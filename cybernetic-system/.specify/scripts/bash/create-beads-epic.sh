#!/bin/bash
#
# create-beads-epic.sh - Create a Pivotal-style Beads epic from spec.md and plan.md
#
# DESCRIPTION:
#   Extracts Problem Statement, Business Value, Architectural Vision,
#   Integration Tests, and Acceptance Criteria from Spec Kit artifacts
#   and creates a rich Beads epic with full description.
#
# USAGE:
#   ./create-beads-epic.sh <feature-dir> [priority]
#
# EXAMPLE:
#   ./create-beads-epic.sh specs/001-my-feature P0
#   ./create-beads-epic.sh specs/001-my-feature      # defaults to P1
#
# REQUIREMENTS:
#   - bd CLI installed and initialized
#   - spec.md with Problem Statement, Business Value, Integration Tests, Acceptance Criteria
#   - plan.md with Architectural Vision (optional but recommended)
#
# OUTPUT:
#   - Creates one Beads epic with rich description
#   - Prints epic ID for use with create-beads-issues.sh
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1" >&2; }
log_section() { echo -e "${CYAN}━━━ $1 ━━━${NC}"; }

# Check arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <feature-dir> [priority]"
    log_error "Example: $0 specs/001-my-feature P0"
    exit 1
fi

FEATURE_DIR="$1"
PRIORITY="${2:-P1}"

SPEC_FILE="$FEATURE_DIR/spec.md"
PLAN_FILE="$FEATURE_DIR/plan.md"

# Validate inputs
if [ ! -d "$FEATURE_DIR" ]; then
    log_error "Feature directory not found: $FEATURE_DIR"
    exit 1
fi

if [ ! -f "$SPEC_FILE" ]; then
    log_error "spec.md not found: $SPEC_FILE"
    exit 1
fi

if ! command -v bd &> /dev/null; then
    log_error "bd CLI not found. Install Beads first: https://github.com/steveyegge/beads"
    exit 1
fi

log_info "Creating Beads epic from $FEATURE_DIR"
log_info "Priority: $PRIORITY"

# Extract feature name from spec.md
FEATURE_NAME=$(grep "^# Feature Specification:" "$SPEC_FILE" | sed 's/^# Feature Specification: //' | head -1)
if [ -z "$FEATURE_NAME" ]; then
    # Fallback to directory name
    FEATURE_NAME=$(basename "$FEATURE_DIR" | sed 's/^[0-9]*-//')
fi

log_info "Feature: $FEATURE_NAME"

# Function to extract a section from markdown
# Usage: extract_section "file.md" "## Section Name"
extract_section() {
    local file="$1"
    local section="$2"
    local content=""

    if [ ! -f "$file" ]; then
        echo ""
        return
    fi

    # Extract content between section header and next ## header
    content=$(awk -v section="$section" '
        BEGIN { found=0; output="" }
        $0 ~ "^" section { found=1; next }
        found && /^## / { found=0 }
        found && !/^<!--/ && !/^-->/ && !/ACTION REQUIRED/ {
            # Skip empty lines at start
            if (output == "" && $0 ~ /^[[:space:]]*$/) next
            output = output $0 "\n"
        }
        END { print output }
    ' "$file" | sed 's/[[:space:]]*$//')

    echo "$content"
}

# Extract sections from spec.md
log_section "Extracting from spec.md"

PROBLEM_STATEMENT=$(extract_section "$SPEC_FILE" "## Problem Statement")
if [ -n "$PROBLEM_STATEMENT" ]; then
    log_success "Found Problem Statement"
else
    log_warning "Problem Statement not found (using placeholder)"
    PROBLEM_STATEMENT="[Problem statement not defined in spec.md]"
fi

BUSINESS_VALUE=$(extract_section "$SPEC_FILE" "## Business Value")
if [ -n "$BUSINESS_VALUE" ]; then
    log_success "Found Business Value"
else
    log_warning "Business Value not found (using placeholder)"
    BUSINESS_VALUE="[Business value not defined in spec.md]"
fi

INTEGRATION_TESTS=$(extract_section "$SPEC_FILE" "## Integration Tests")
if [ -n "$INTEGRATION_TESTS" ]; then
    log_success "Found Integration Tests"
else
    log_warning "Integration Tests not found"
    INTEGRATION_TESTS=""
fi

ACCEPTANCE_CRITERIA=$(extract_section "$SPEC_FILE" "## Acceptance Criteria")
if [ -n "$ACCEPTANCE_CRITERIA" ]; then
    log_success "Found Acceptance Criteria"
else
    log_warning "Acceptance Criteria not found"
    ACCEPTANCE_CRITERIA=""
fi

# Extract Architectural Vision from plan.md (if exists)
log_section "Extracting from plan.md"

ARCHITECTURAL_VISION=""
if [ -f "$PLAN_FILE" ]; then
    ARCHITECTURAL_VISION=$(extract_section "$PLAN_FILE" "## Architectural Vision")
    if [ -n "$ARCHITECTURAL_VISION" ]; then
        log_success "Found Architectural Vision"
    else
        log_warning "Architectural Vision not found in plan.md"
    fi
else
    log_warning "plan.md not found - skipping Architectural Vision"
fi

# Build the epic description
log_section "Building Epic Description"

DESCRIPTION="PROBLEM STATEMENT:
$PROBLEM_STATEMENT

BUSINESS VALUE:
$BUSINESS_VALUE"

if [ -n "$ARCHITECTURAL_VISION" ]; then
    DESCRIPTION="$DESCRIPTION

ARCHITECTURAL VISION:
$ARCHITECTURAL_VISION"
fi

if [ -n "$INTEGRATION_TESTS" ]; then
    DESCRIPTION="$DESCRIPTION

INTEGRATION TESTS:
$INTEGRATION_TESTS"
fi

if [ -n "$ACCEPTANCE_CRITERIA" ]; then
    DESCRIPTION="$DESCRIPTION

Acceptance Criteria:
$ACCEPTANCE_CRITERIA"
fi

# Show preview
echo ""
log_section "Epic Preview"
echo "Title: $FEATURE_NAME"
echo "Priority: $PRIORITY"
echo "Type: epic"
echo ""
echo "Description:"
echo "────────────────────────────────────────"
echo "$DESCRIPTION" | head -50
if [ $(echo "$DESCRIPTION" | wc -l) -gt 50 ]; then
    echo "... (truncated for preview)"
fi
echo "────────────────────────────────────────"

# Create the epic
echo ""
log_section "Creating Beads Epic"

# Write description to temp file to handle special characters
TEMP_DESC=$(mktemp)
echo "$DESCRIPTION" > "$TEMP_DESC"

if EPIC_ID=$(bd create "$FEATURE_NAME" \
    --type epic \
    --priority "$PRIORITY" \
    --description "$(cat "$TEMP_DESC")" \
    2>&1); then

    # Clean up
    rm -f "$TEMP_DESC"

    # Extract just the ID if bd returns extra output
    EPIC_ID=$(echo "$EPIC_ID" | grep -o '[a-zA-Z0-9-]*\.[0-9]*$' | tail -1)

    if [ -z "$EPIC_ID" ]; then
        # Try to get the ID another way
        EPIC_ID=$(echo "$EPIC_ID" | tail -1)
    fi

    echo ""
    log_success "Epic created successfully!"
    echo ""
    echo -e "${GREEN}Epic ID: ${CYAN}$EPIC_ID${NC}"
    echo ""
    log_info "Next steps:"
    echo "  1. Generate tasks:     /speckit.tasks"
    echo "  2. Create task issues: ./.specify/scripts/bash/create-beads-issues.sh $FEATURE_DIR/tasks.md $EPIC_ID"
    echo "  3. View epic:          bd show $EPIC_ID"
    echo ""

    # Save epic ID to feature directory for reference
    echo "$EPIC_ID" > "$FEATURE_DIR/.beads-epic-id"
    log_info "Epic ID saved to $FEATURE_DIR/.beads-epic-id"

else
    rm -f "$TEMP_DESC"
    log_error "Failed to create epic"
    log_error "Output: $EPIC_ID"
    exit 1
fi

exit 0
