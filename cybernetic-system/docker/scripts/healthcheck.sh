#!/bin/bash
# Health check script for Cybernetic application
# Returns 0 if healthy, 1 otherwise

set -e

HEALTH_URL="${HEALTH_URL:-http://localhost:4000/health}"
TIMEOUT="${HEALTH_TIMEOUT:-5}"

# Check the health endpoint
response=$(curl -sf --max-time $TIMEOUT "$HEALTH_URL" 2>/dev/null)

if [ $? -eq 0 ]; then
    # Parse response if JSON
    if echo "$response" | jq -e '.status == "ok"' > /dev/null 2>&1; then
        exit 0
    elif echo "$response" | grep -q "ok"; then
        exit 0
    fi
fi

exit 1
