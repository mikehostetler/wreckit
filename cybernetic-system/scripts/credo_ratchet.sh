#!/bin/bash
# Credo Ratchet - fail if issue count increases
# Usage: ./scripts/credo_ratchet.sh

set -e

BASELINE_FILE=".credo_baseline"
BASELINE=$(grep -v '^#' "$BASELINE_FILE" | head -1)

echo "Running Credo analysis..."
CURRENT=$(mix credo --strict --format=json 2>/dev/null | jq '.issues | length')

echo "Baseline: $BASELINE issues"
echo "Current:  $CURRENT issues"

if [ "$CURRENT" -gt "$BASELINE" ]; then
    echo ""
    echo "FAIL: Credo issues increased from $BASELINE to $CURRENT"
    echo "New issues introduced. Fix them before committing."
    echo ""
    echo "Run 'mix credo --strict' to see all issues."
    exit 1
elif [ "$CURRENT" -lt "$BASELINE" ]; then
    echo ""
    echo "IMPROVED! Issues decreased from $BASELINE to $CURRENT"
    echo "Consider updating .credo_baseline to lock in this improvement:"
    echo "  echo '$CURRENT' > .credo_baseline"
    exit 0
else
    echo ""
    echo "OK: Issue count unchanged at $CURRENT"
    exit 0
fi
