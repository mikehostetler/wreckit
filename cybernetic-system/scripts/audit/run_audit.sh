#!/bin/bash

# System Resilience Audit - Quick Run Script
# This script provides convenient shortcuts for running the audit

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print usage
usage() {
    echo "Cybernetic AMCP System Resilience Audit"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --test         Run in test mode (minimal, no external dependencies)"
    echo "  --prod         Run against production system (must be running)"
    echo "  --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --test      # Run in test mode"
    echo "  $0 --prod      # Run against running production system"
    echo ""
    echo "Exit Codes:"
    echo "  0 - HIGH confidence (90%+)"
    echo "  1 - MEDIUM confidence (70-90%)"
    echo "  2 - LOW confidence (<70%)"
}

# Check if script is in the right directory
check_directory() {
    if [ ! -f "mix.exs" ]; then
        echo -e "${RED}Error: Must be run from project root directory${NC}"
        exit 2
    fi
}

# Run audit in test mode
run_test_mode() {
    echo -e "${BLUE}Running audit in test mode...${NC}"
    echo ""

    MIX_ENV=test mix run scripts/audit/system_resilience_audit.exs
    # The script halts with its own exit code, which will be returned
}

# Run audit in production mode
run_prod_mode() {
    echo -e "${BLUE}Running audit against production system...${NC}"
    echo ""

    # Check if application is running
    if ! pgrep -f "beam.*cybernetic" > /dev/null; then
        echo -e "${RED}Error: Cybernetic application is not running${NC}"
        echo -e "${YELLOW}Start it first with: iex -S mix or mix start${NC}"
        exit 2
    fi

    MIX_ENV=test mix run scripts/audit/system_resilience_audit.exs
    EXIT_CODE=$?

    echo ""
    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ Audit passed with HIGH confidence${NC}"
    elif [ $EXIT_CODE -eq 1 ]; then
        echo -e "${YELLOW}⚠️  Audit passed with MEDIUM confidence${NC}"
    else
        echo -e "${RED}❌ Audit failed with LOW confidence${NC}"
    fi

    exit $EXIT_CODE
}

# Main script
main() {
    check_directory

    case "${1:-}" in
        --test)
            run_test_mode
            ;;
        --prod)
            run_prod_mode
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        "")
            # Default to test mode for safety
            run_test_mode
            ;;
        *)
            echo -e "${RED}Error: Unknown option '$1'${NC}"
            echo ""
            usage
            exit 2
            ;;
    esac
}

main "$@"
