#!/usr/bin/env bash

# Consolidated prerequisite checking script
#
# This script provides unified prerequisite checking for Spec-Driven Development workflow.
# It replaces the functionality previously spread across multiple scripts.
#
# Usage: ./check-prerequisites.sh [OPTIONS]
#
# OPTIONS:
#   --json              Output in JSON format
#   --require-tasks     Require tasks.md to exist (for implementation phase)
#   --include-tasks     Include tasks.md in AVAILABLE_DOCS list
#   --paths-only        Only output path variables (no validation)
#   --check-ci          Verify act and Docker are available for local CI
#   --help, -h          Show help message
#
# OUTPUTS:
#   JSON mode: {"FEATURE_DIR":"...", "AVAILABLE_DOCS":["..."]}
#   Text mode: FEATURE_DIR:... \n AVAILABLE_DOCS: \n ✓/✗ file.md
#   Paths only: REPO_ROOT: ... \n BRANCH: ... \n FEATURE_DIR: ... etc.

set -e

# Parse command line arguments
JSON_MODE=false
REQUIRE_TASKS=false
INCLUDE_TASKS=false
PATHS_ONLY=false
CHECK_CI=false

for arg in "$@"; do
    case "$arg" in
        --json)
            JSON_MODE=true
            ;;
        --require-tasks)
            REQUIRE_TASKS=true
            ;;
        --include-tasks)
            INCLUDE_TASKS=true
            ;;
        --paths-only)
            PATHS_ONLY=true
            ;;
        --check-ci)
            CHECK_CI=true
            ;;
        --help|-h)
            cat << 'EOF'
Usage: check-prerequisites.sh [OPTIONS]

Consolidated prerequisite checking for Spec-Driven Development workflow.

OPTIONS:
  --json              Output in JSON format
  --require-tasks     Require tasks.md to exist (for implementation phase)
  --include-tasks     Include tasks.md in AVAILABLE_DOCS list
  --paths-only        Only output path variables (no prerequisite validation)
  --check-ci          Verify act and Docker are available for local CI
  --help, -h          Show this help message

EXAMPLES:
  # Check task prerequisites (plan.md required)
  ./check-prerequisites.sh --json
  
  # Check implementation prerequisites (plan.md + tasks.md required)
  ./check-prerequisites.sh --json --require-tasks --include-tasks
  
  # Get feature paths only (no validation)
  ./check-prerequisites.sh --paths-only

  # Check CI prerequisites (act + Docker)
  ./check-prerequisites.sh --check-ci

EOF
            exit 0
            ;;
        *)
            echo "ERROR: Unknown option '$arg'. Use --help for usage information." >&2
            exit 1
            ;;
    esac
done

# Source common functions
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Get feature paths and validate branch
eval $(get_feature_paths)
check_feature_branch "$CURRENT_BRANCH" "$HAS_GIT" || exit 1

# If paths-only mode, output paths and exit (support JSON + paths-only combined)
if $PATHS_ONLY; then
    if $JSON_MODE; then
        # Minimal JSON paths payload (no validation performed)
        printf '{"REPO_ROOT":"%s","BRANCH":"%s","FEATURE_DIR":"%s","FEATURE_SPEC":"%s","IMPL_PLAN":"%s","TASKS":"%s"}\n' \
            "$REPO_ROOT" "$CURRENT_BRANCH" "$FEATURE_DIR" "$FEATURE_SPEC" "$IMPL_PLAN" "$TASKS"
    else
        echo "REPO_ROOT: $REPO_ROOT"
        echo "BRANCH: $CURRENT_BRANCH"
        echo "FEATURE_DIR: $FEATURE_DIR"
        echo "FEATURE_SPEC: $FEATURE_SPEC"
        echo "IMPL_PLAN: $IMPL_PLAN"
        echo "TASKS: $TASKS"
    fi
    exit 0
fi

# Check CI prerequisites if requested
if $CHECK_CI; then
    ci_errors=()
    ci_warnings=()

    # Check act
    if command -v act &> /dev/null; then
        ACT_VERSION=$(act --version 2>/dev/null | head -1 || echo "unknown")
        act_status="installed"
    else
        act_status="missing"
        ci_errors+=("act is not installed. Install: brew install act (macOS) or https://github.com/nektos/act")
    fi

    # Check Docker
    if command -v docker &> /dev/null; then
        if docker info &> /dev/null 2>&1; then
            DOCKER_VERSION=$(docker --version 2>/dev/null | head -1 || echo "unknown")
            docker_status="running"
        else
            docker_status="not_running"
            ci_errors+=("Docker is installed but not running. Start Docker Desktop or your Docker daemon.")
        fi
    else
        docker_status="missing"
        ci_errors+=("Docker is not installed. Install: https://docs.docker.com/get-docker/")
    fi

    # Check for workflow files
    if [[ -d "$REPO_ROOT/.github/workflows" ]]; then
        workflow_count=$(find "$REPO_ROOT/.github/workflows" -name "*.yml" -o -name "*.yaml" 2>/dev/null | wc -l | tr -d ' ')
        if [[ "$workflow_count" -eq 0 ]]; then
            ci_warnings+=("No workflow files found in .github/workflows/")
        fi
    else
        ci_warnings+=("No .github/workflows/ directory found")
    fi

    # Check for .actrc
    if [[ -f "$REPO_ROOT/.actrc" ]]; then
        actrc_status="present"
    else
        actrc_status="missing"
        ci_warnings+=("No .actrc file found (optional but recommended)")
    fi

    # Output results
    if $JSON_MODE; then
        # Build JSON output
        errors_json="[]"
        if [[ ${#ci_errors[@]} -gt 0 ]]; then
            errors_json=$(printf '"%s",' "${ci_errors[@]}")
            errors_json="[${errors_json%,}]"
        fi

        warnings_json="[]"
        if [[ ${#ci_warnings[@]} -gt 0 ]]; then
            warnings_json=$(printf '"%s",' "${ci_warnings[@]}")
            warnings_json="[${warnings_json%,}]"
        fi

        ready="true"
        [[ ${#ci_errors[@]} -gt 0 ]] && ready="false"

        printf '{"ci_ready":%s,"act":"%s","docker":"%s","actrc":"%s","workflows":%d,"errors":%s,"warnings":%s}\n' \
            "$ready" "$act_status" "$docker_status" "$actrc_status" "${workflow_count:-0}" "$errors_json" "$warnings_json"
    else
        echo "CI Prerequisites:"
        echo ""

        # Act status
        if [[ "$act_status" == "installed" ]]; then
            echo "  ✓ act: $ACT_VERSION"
        else
            echo "  ✗ act: not installed"
        fi

        # Docker status
        if [[ "$docker_status" == "running" ]]; then
            echo "  ✓ Docker: $DOCKER_VERSION"
        elif [[ "$docker_status" == "not_running" ]]; then
            echo "  ✗ Docker: installed but not running"
        else
            echo "  ✗ Docker: not installed"
        fi

        # Actrc status
        if [[ "$actrc_status" == "present" ]]; then
            echo "  ✓ .actrc: present"
        else
            echo "  ○ .actrc: not found (optional)"
        fi

        # Workflows
        if [[ -d "$REPO_ROOT/.github/workflows" ]] && [[ "${workflow_count:-0}" -gt 0 ]]; then
            echo "  ✓ Workflows: $workflow_count found"
        else
            echo "  ○ Workflows: none found"
        fi

        echo ""

        # Errors
        if [[ ${#ci_errors[@]} -gt 0 ]]; then
            echo "Errors:"
            for err in "${ci_errors[@]}"; do
                echo "  ✗ $err"
            done
            echo ""
        fi

        # Warnings
        if [[ ${#ci_warnings[@]} -gt 0 ]]; then
            echo "Warnings:"
            for warn in "${ci_warnings[@]}"; do
                echo "  ○ $warn"
            done
            echo ""
        fi

        # Summary
        if [[ ${#ci_errors[@]} -eq 0 ]]; then
            echo "✓ CI prerequisites satisfied - ready to use pre-push hook"
        else
            echo "✗ CI prerequisites NOT satisfied - fix errors above"
            exit 1
        fi
    fi

    exit 0
fi

# Validate required directories and files
if [[ ! -d "$FEATURE_DIR" ]]; then
    echo "ERROR: Feature directory not found: $FEATURE_DIR" >&2
    echo "Run /speckit.specify first to create the feature structure." >&2
    exit 1
fi

if [[ ! -f "$IMPL_PLAN" ]]; then
    echo "ERROR: plan.md not found in $FEATURE_DIR" >&2
    echo "Run /speckit.plan first to create the implementation plan." >&2
    exit 1
fi

# Check for tasks.md if required
if $REQUIRE_TASKS && [[ ! -f "$TASKS" ]]; then
    echo "ERROR: tasks.md not found in $FEATURE_DIR" >&2
    echo "Run /speckit.tasks first to create the task list." >&2
    exit 1
fi

# Build list of available documents
docs=()

# Always check these optional docs
[[ -f "$RESEARCH" ]] && docs+=("research.md")
[[ -f "$DATA_MODEL" ]] && docs+=("data-model.md")

# Check contracts directory (only if it exists and has files)
if [[ -d "$CONTRACTS_DIR" ]] && [[ -n "$(ls -A "$CONTRACTS_DIR" 2>/dev/null)" ]]; then
    docs+=("contracts/")
fi

[[ -f "$QUICKSTART" ]] && docs+=("quickstart.md")

# Include tasks.md if requested and it exists
if $INCLUDE_TASKS && [[ -f "$TASKS" ]]; then
    docs+=("tasks.md")
fi

# Output results
if $JSON_MODE; then
    # Build JSON array of documents
    if [[ ${#docs[@]} -eq 0 ]]; then
        json_docs="[]"
    else
        json_docs=$(printf '"%s",' "${docs[@]}")
        json_docs="[${json_docs%,}]"
    fi
    
    printf '{"FEATURE_DIR":"%s","AVAILABLE_DOCS":%s}\n' "$FEATURE_DIR" "$json_docs"
else
    # Text output
    echo "FEATURE_DIR:$FEATURE_DIR"
    echo "AVAILABLE_DOCS:"
    
    # Show status of each potential document
    check_file "$RESEARCH" "research.md"
    check_file "$DATA_MODEL" "data-model.md"
    check_dir "$CONTRACTS_DIR" "contracts/"
    check_file "$QUICKSTART" "quickstart.md"
    
    if $INCLUDE_TASKS; then
        check_file "$TASKS" "tasks.md"
    fi
fi
