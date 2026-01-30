#!/bin/bash
#
# create-beads-issues.sh - Bulk create Beads issues from tasks.md with dependencies
#
# DESCRIPTION:
#   Extracts tasks from tasks.md and creates Beads issues with:
#   - Proper priority detection (P0, P1, P2, P3)
#   - Automatic dependency setup (P0 → P1 → P2 → P3)
#   - User story and phase labels
#
# USAGE:
#   ./create-beads-issues.sh <path-to-tasks.md> <epic-id> [--skip-deps]
#
# EXAMPLE:
#   ./create-beads-issues.sh specs/001-my-feature/tasks.md speckit-abc123
#   ./create-beads-issues.sh specs/001-my-feature/tasks.md speckit-abc123 --skip-deps
#
# REQUIREMENTS:
#   - bd CLI installed and initialized
#   - tasks.md in standard format: - [ ] T001 Description...
#
# OUTPUT:
#   - Creates one Beads issue per task
#   - Sets up priority-based dependencies (P0 blocks P1, P1 blocks P2, etc.)
#   - Prints Beads ID → Task ID mapping for update script
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
if [ $# -lt 2 ]; then
    log_error "Usage: $0 <path-to-tasks.md> <epic-id> [--skip-deps]"
    log_error "Example: $0 specs/001-my-feature/tasks.md speckit-abc123"
    exit 1
fi

TASKS_FILE="$1"
EPIC_ID="$2"
SKIP_DEPS="${3:-}"

# Validate inputs
if [ ! -f "$TASKS_FILE" ]; then
    log_error "Tasks file not found: $TASKS_FILE"
    exit 1
fi

if ! command -v bd &> /dev/null; then
    log_error "bd CLI not found. Install Beads first: https://github.com/steveyegge/beads"
    exit 1
fi

# Check if epic exists
if ! bd show "$EPIC_ID" &> /dev/null; then
    log_error "Epic not found: $EPIC_ID"
    log_error "Create epic first with: .specify/scripts/bash/create-beads-epic.sh <feature-dir>"
    exit 1
fi

log_info "Creating Beads issues from $TASKS_FILE for epic $EPIC_ID"

# Initialize mapping file
MAPPING_FILE="/tmp/beads-mapping-$$.txt"
rm -f "$MAPPING_FILE"
touch "$MAPPING_FILE"

# Track tasks by priority for dependency setup
P0_TASKS=""
P1_TASKS=""
P2_TASKS=""
P3_TASKS=""

# Count tasks to process
TASK_COUNT=$(grep -E "^- \[ \] \[?T" "$TASKS_FILE" | grep -v "speckit-\|bd-\|(.*)" | wc -l | tr -d ' ')

if [ "$TASK_COUNT" -eq 0 ]; then
    log_warning "No tasks found without Beads IDs"
    log_info "All tasks already have Beads IDs linked"
    exit 0
fi

log_info "Found $TASK_COUNT tasks to create"
echo ""

log_section "Creating Tasks"

CREATED=0
FAILED=0

# Extract tasks without Beads IDs and create issues
while IFS= read -r line; do
    # Skip if line already has a Beads ID
    if echo "$line" | grep -qE "\(speckit-|\(bd-"; then
        continue
    fi

    # Extract task ID (handles both "T001" and "[T001]" formats)
    task_id=$(echo "$line" | sed -E 's/^- \[ \] \[?([T][0-9]+)\]?.*/\1/')

    # Extract full description (everything after task ID)
    description=$(echo "$line" | sed -E 's/^- \[ \] \[?[T][0-9]+\]? //')

    # Determine priority based on markers, phase headers, or task number
    priority=""

    # Check for explicit priority markers [P0], [P1], [P2], [P3]
    if echo "$line" | grep -q "\[P0\]"; then
        priority="P0"
    elif echo "$line" | grep -q "\[P1\]"; then
        priority="P1"
    elif echo "$line" | grep -q "\[P2\]"; then
        priority="P2"
    elif echo "$line" | grep -q "\[P3\]"; then
        priority="P3"
    fi

    # If no explicit marker, detect from context
    if [ -z "$priority" ]; then
        # Check for priority keywords in description
        if echo "$description" | grep -qi "MVP\|critical\|blocking\|foundation"; then
            priority="P0"
        elif echo "$description" | grep -qi "important\|should"; then
            priority="P1"
        elif echo "$description" | grep -qi "nice.to.have\|could\|polish"; then
            priority="P2"
        else
            # Default based on task number
            task_num=$(echo "$task_id" | sed 's/T0*//')
            if [ "$task_num" -le 20 ] 2>/dev/null; then
                priority="P0"  # First 20 tasks are typically foundational
            elif [ "$task_num" -le 50 ] 2>/dev/null; then
                priority="P1"
            else
                priority="P2"
            fi
        fi
    fi

    # Determine labels from description
    labels="task"
    echo "$description" | grep -q "\[P\]" && labels="$labels,parallel"
    echo "$description" | grep -qi "backend\|api\|model\|service" && labels="$labels,backend"
    echo "$description" | grep -qi "frontend\|ui\|component\|page" && labels="$labels,frontend"
    echo "$description" | grep -qi "test\|spec" && labels="$labels,testing"
    echo "$description" | grep -qi "TDD\|must fail\|red-green" && labels="$labels,tdd"

    # User story labels
    echo "$description" | grep -qi "\[US1\]" && labels="$labels,us1"
    echo "$description" | grep -qi "\[US2\]" && labels="$labels,us2"
    echo "$description" | grep -qi "\[US3\]" && labels="$labels,us3"
    echo "$description" | grep -qi "\[US4\]" && labels="$labels,us4"
    echo "$description" | grep -qi "\[US5\]" && labels="$labels,us5"
    echo "$description" | grep -qi "\[US6\]" && labels="$labels,us6"

    # Add priority label
    labels="$labels,$priority"

    # Create the Beads issue
    echo -n "Creating $task_id [$priority]... "

    if beads_id=$(bd create "$task_id: $description" \
        --parent "$EPIC_ID" \
        --type task \
        --priority "$priority" \
        --labels "$labels" \
        2>&1 | grep -oE '[a-zA-Z]+-[a-zA-Z0-9]+(\.[0-9]+)?' | tail -1); then

        if [ -n "$beads_id" ]; then
            echo -e "${GREEN}✓${NC} $beads_id"
            echo "$task_id|$beads_id|$priority" >> "$MAPPING_FILE"
            CREATED=$((CREATED + 1))

            # Track by priority for dependency setup
            case "$priority" in
                P0) P0_TASKS="$P0_TASKS $beads_id" ;;
                P1) P1_TASKS="$P1_TASKS $beads_id" ;;
                P2) P2_TASKS="$P2_TASKS $beads_id" ;;
                P3) P3_TASKS="$P3_TASKS $beads_id" ;;
            esac

            # Small delay to avoid overwhelming the system
            sleep 0.1
        else
            echo -e "${YELLOW}?${NC} Created but ID not captured"
            CREATED=$((CREATED + 1))
        fi
    else
        echo -e "${RED}✗${NC} Failed"
        FAILED=$((FAILED + 1))
    fi
done < <(grep -E "^- \[ \] \[?T" "$TASKS_FILE")

echo ""
log_success "Task creation complete: $CREATED created, $FAILED failed"

# Set up dependencies if not skipped
if [ "$SKIP_DEPS" != "--skip-deps" ] && [ "$CREATED" -gt 0 ]; then
    echo ""
    log_section "Setting Up Dependencies"

    # Trim whitespace
    P0_TASKS=$(echo "$P0_TASKS" | xargs)
    P1_TASKS=$(echo "$P1_TASKS" | xargs)
    P2_TASKS=$(echo "$P2_TASKS" | xargs)
    P3_TASKS=$(echo "$P3_TASKS" | xargs)

    DEPS_CREATED=0

    # P1 tasks are blocked by P0 tasks completing
    if [ -n "$P0_TASKS" ] && [ -n "$P1_TASKS" ]; then
        log_info "P1 tasks blocked by P0 tasks..."
        # Get first P0 task as representative blocker
        first_p0=$(echo "$P0_TASKS" | awk '{print $1}')
        for p1_task in $P1_TASKS; do
            if bd dep add "$p1_task" "$first_p0" --type blocks 2>/dev/null; then
                DEPS_CREATED=$((DEPS_CREATED + 1))
            fi
        done
        log_success "P1 ← P0 dependencies set"
    fi

    # P2 tasks are blocked by P1 tasks completing
    if [ -n "$P1_TASKS" ] && [ -n "$P2_TASKS" ]; then
        log_info "P2 tasks blocked by P1 tasks..."
        first_p1=$(echo "$P1_TASKS" | awk '{print $1}')
        for p2_task in $P2_TASKS; do
            if bd dep add "$p2_task" "$first_p1" --type blocks 2>/dev/null; then
                DEPS_CREATED=$((DEPS_CREATED + 1))
            fi
        done
        log_success "P2 ← P1 dependencies set"
    fi

    # P3 tasks are blocked by P2 tasks completing
    if [ -n "$P2_TASKS" ] && [ -n "$P3_TASKS" ]; then
        log_info "P3 tasks blocked by P2 tasks..."
        first_p2=$(echo "$P2_TASKS" | awk '{print $1}')
        for p3_task in $P3_TASKS; do
            if bd dep add "$p3_task" "$first_p2" --type blocks 2>/dev/null; then
                DEPS_CREATED=$((DEPS_CREATED + 1))
            fi
        done
        log_success "P3 ← P2 dependencies set"
    fi

    if [ "$DEPS_CREATED" -gt 0 ]; then
        log_success "Created $DEPS_CREATED dependencies"
    else
        log_info "No cross-priority dependencies to create"
    fi
fi

# Copy mapping to standard location
if [ -f "$MAPPING_FILE" ] && [ -s "$MAPPING_FILE" ]; then
    cp "$MAPPING_FILE" /tmp/beads-mapping.txt

    echo ""
    log_section "Summary"
    echo ""
    echo "Tasks by priority:"
    echo "  P0 (Critical):  $(echo "$P0_TASKS" | wc -w | tr -d ' ')"
    echo "  P1 (Important): $(echo "$P1_TASKS" | wc -w | tr -d ' ')"
    echo "  P2 (Nice-to-have): $(echo "$P2_TASKS" | wc -w | tr -d ' ')"
    echo "  P3 (Future): $(echo "$P3_TASKS" | wc -w | tr -d ' ')"
    echo ""
    log_info "Mapping saved to /tmp/beads-mapping.txt"
    echo ""
    log_info "Next steps:"
    echo "  1. Update tasks.md:  ./.specify/scripts/bash/update-tasks-with-beads-ids.sh $TASKS_FILE"
    echo "  2. View ready tasks: bd ready"
    echo "  3. View epic:        bd show $EPIC_ID"
else
    log_warning "No mapping file created (no issues created)"
fi

# Clean up temp file
rm -f "$MAPPING_FILE"

exit 0
