#!/bin/bash

# Test runner that ensures environment variables are loaded
# Usage: ./scripts/test_with_env.sh [test_file]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔧 Cybernetic Test Runner with Environment"
echo "=========================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found${NC}"
    echo "Creating .env from template..."
    cp .env.example .env
    echo -e "${YELLOW}Please edit .env with your actual API keys${NC}"
    exit 1
fi

# Source the environment file
source .env

# Check required environment variables
REQUIRED_VARS=(
    "ANTHROPIC_API_KEY"
    "AMQP_URL"
)

MISSING_VARS=()
for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ] || [ "${!VAR}" == "your-"* ]; then
        MISSING_VARS+=("$VAR")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing required environment variables:${NC}"
    for VAR in "${MISSING_VARS[@]}"; do
        echo -e "${RED}   - $VAR${NC}"
    done
    echo ""
    echo "Please set these in your .env file"
    exit 1
fi

echo -e "${GREEN}✓${NC} Environment loaded successfully"
echo ""

# Run the specified test or all tests
if [ $# -eq 0 ]; then
    echo "Running all tests..."
    MIX_ENV=test mix test
else
    echo "Running test: $1"
    if [[ $1 == *.exs ]]; then
        # If it's an Elixir script, run with elixir
        elixir "$1"
    else
        # Otherwise assume it's a mix test path
        MIX_ENV=test mix test "$1"
    fi
fi