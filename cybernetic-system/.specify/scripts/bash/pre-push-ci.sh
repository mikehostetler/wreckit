#!/usr/bin/env bash

# Pre-push CI gate using act
#
# Runs GitHub Actions locally before allowing push.
# This ensures CI will pass before code leaves your machine.
#
# Usage:
#   ./.specify/scripts/bash/pre-push-ci.sh [OPTIONS]
#
# OPTIONS:
#   --workflow <path>   Specify workflow file (default: auto-detect)
#   --job <name>        Run specific job only
#   --dry-run           Show what would be run without executing
#   --help, -h          Show help message
#
# ENVIRONMENT:
#   SPECKIT_SKIP_CI=1   Emergency bypass (logged to .specify/ci-skip.log)

set -e

# Parse command line arguments
WORKFLOW=""
JOB=""
DRY_RUN=false

for arg in "$@"; do
    case "$arg" in
        --workflow)
            shift
            WORKFLOW="$1"
            shift
            ;;
        --workflow=*)
            WORKFLOW="${arg#*=}"
            ;;
        --job)
            shift
            JOB="$1"
            shift
            ;;
        --job=*)
            JOB="${arg#*=}"
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
        --help|-h)
            cat << 'EOF'
Usage: pre-push-ci.sh [OPTIONS]

Runs GitHub Actions locally via act before allowing push.

OPTIONS:
  --workflow <path>   Specify workflow file (default: auto-detect)
  --job <name>        Run specific job only
  --dry-run           Show what would be run without executing
  --help, -h          Show this help message

ENVIRONMENT:
  SPECKIT_SKIP_CI=1   Emergency bypass (logged)

EXAMPLES:
  # Run default CI
  ./pre-push-ci.sh

  # Run specific workflow
  ./pre-push-ci.sh --workflow .github/workflows/test.yml

  # Run specific job
  ./pre-push-ci.sh --job build

  # Dry run (show commands)
  ./pre-push-ci.sh --dry-run

EOF
            exit 0
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[CI]${NC} $1"; }
success() { echo -e "${GREEN}[CI]${NC} $1"; }
warn() { echo -e "${YELLOW}[CI]${NC} $1"; }
error() { echo -e "${RED}[CI]${NC} $1" >&2; }

# Get script and repo root
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Emergency escape hatch (logged for audit)
if [[ "${SPECKIT_SKIP_CI:-}" == "1" ]]; then
    warn "SPECKIT_SKIP_CI=1 detected - skipping CI gate"
    LOG_FILE="$REPO_ROOT/.specify/ci-skip.log"
    echo "$(date -Iseconds) SKIP by ${USER:-unknown} on $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown-branch')" >> "$LOG_FILE"
    warn "Logged skip to $LOG_FILE"
    exit 0
fi

# Verify act is installed
if ! command -v act &> /dev/null; then
    error "act is required but not installed"
    echo ""
    echo "Install act:"
    echo "  macOS:  brew install act"
    echo "  Linux:  https://github.com/nektos/act#installation"
    echo ""
    echo "Or bypass with: SPECKIT_SKIP_CI=1 git push"
    exit 1
fi

# Verify Docker is running
if ! docker info &> /dev/null 2>&1; then
    error "Docker must be running for act"
    echo ""
    echo "Start Docker Desktop or your Docker daemon, then retry."
    echo ""
    echo "Or bypass with: SPECKIT_SKIP_CI=1 git push"
    exit 1
fi

# Auto-detect workflow if not specified
if [[ -z "$WORKFLOW" ]]; then
    WORKFLOWS_DIR="$REPO_ROOT/.github/workflows"

    if [[ -d "$WORKFLOWS_DIR" ]]; then
        # Priority order for workflow detection
        for candidate in "ci.yml" "ci.yaml" "test.yml" "test.yaml" "build.yml" "build.yaml" "main.yml" "main.yaml"; do
            if [[ -f "$WORKFLOWS_DIR/$candidate" ]]; then
                WORKFLOW="$WORKFLOWS_DIR/$candidate"
                break
            fi
        done

        # If still not found, use first yaml file
        if [[ -z "$WORKFLOW" ]]; then
            WORKFLOW=$(find "$WORKFLOWS_DIR" -name "*.yml" -o -name "*.yaml" | head -1)
        fi
    fi

    if [[ -z "$WORKFLOW" ]] || [[ ! -f "$WORKFLOW" ]]; then
        error "No CI workflow found in .github/workflows/"
        echo ""
        echo "Create a workflow file or specify one:"
        echo "  ./pre-push-ci.sh --workflow .github/workflows/your-ci.yml"
        exit 1
    fi
fi

# Verify workflow exists
if [[ ! -f "$WORKFLOW" ]]; then
    error "Workflow not found: $WORKFLOW"
    exit 1
fi

info "Running local CI via act..."
info "Workflow: $WORKFLOW"
[[ -n "$JOB" ]] && info "Job: $JOB"

# Build act command
ACT_CMD="act push"
ACT_CMD="$ACT_CMD --container-architecture linux/amd64"
ACT_CMD="$ACT_CMD -W $WORKFLOW"
ACT_CMD="$ACT_CMD --env CI=true"

# Add job filter if specified
[[ -n "$JOB" ]] && ACT_CMD="$ACT_CMD -j $JOB"

# Use .actrc if it exists
if [[ -f "$REPO_ROOT/.actrc" ]]; then
    info "Using .actrc configuration"
fi

# Use .secrets if it exists
if [[ -f "$REPO_ROOT/.secrets" ]]; then
    ACT_CMD="$ACT_CMD --secret-file $REPO_ROOT/.secrets"
    info "Loading secrets from .secrets"
fi

# Dry run mode
if $DRY_RUN; then
    info "Dry run - would execute:"
    echo "  cd $REPO_ROOT && $ACT_CMD"
    exit 0
fi

# Run act with timeout (10 minutes max)
cd "$REPO_ROOT"

if timeout 600 $ACT_CMD; then
    success "CI passed locally - push allowed"
    exit 0
else
    EXIT_CODE=$?
    error "CI failed locally (exit code: $EXIT_CODE)"
    echo ""
    echo "Fix the issues above before pushing."
    echo ""
    echo "To bypass (emergency only): SPECKIT_SKIP_CI=1 git push"
    exit 1
fi
