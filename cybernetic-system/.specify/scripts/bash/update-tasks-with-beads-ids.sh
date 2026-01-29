#!/bin/bash
#
# update-tasks-with-beads-ids.sh - Update tasks.md with Beads issue IDs
#
# DESCRIPTION:
#   Updates tasks.md to link task items with their Beads issue IDs.
#   Converts: - [ ] T001 Description
#   To:       - [ ] (speckit-abc.1) T001 Description
#
# USAGE:
#   ./update-tasks-with-beads-ids.sh <path-to-tasks.md>
#
# EXAMPLE:
#   ./update-tasks-with-beads-ids.sh specs/001-my-feature/tasks.md
#
# REQUIREMENTS:
#   - bd CLI installed
#   - Python 3.6+ for JSON parsing
#   - Beads issues already created
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1" >&2; }

# Check arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <path-to-tasks.md>"
    log_error "Example: $0 specs/001-my-feature/tasks.md"
    exit 1
fi

TASKS_FILE="$1"

# Validate inputs
if [ ! -f "$TASKS_FILE" ]; then
    log_error "Tasks file not found: $TASKS_FILE"
    exit 1
fi

if ! command -v bd &> /dev/null; then
    log_error "bd CLI not found. Install Beads first: https://github.com/steveyegge/beads"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    log_error "python3 not found. Required for JSON parsing."
    exit 1
fi

log_info "Updating $TASKS_FILE with Beads IDs..."

# Create backup
BACKUP_FILE="${TASKS_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
cp "$TASKS_FILE" "$BACKUP_FILE"
log_info "Backup created: $BACKUP_FILE"

# Run Python script to update tasks.md
python3 << 'PYTHON_SCRIPT'
import re
import json
import subprocess
import sys

tasks_file = sys.argv[1]

# Get all Beads issues
result = subprocess.run(["bd", "list", "--json"], capture_output=True, text=True)
if result.returncode != 0:
    print(f"Error: Failed to list Beads issues", file=sys.stderr)
    sys.exit(1)

issues = json.loads(result.stdout)

# Create mapping of task ID to Beads ID
task_to_beads = {}
for issue in issues:
    beads_id = issue["id"]
    title = issue["title"]
    # Extract task ID from title (T001, T002, T057a, etc.)
    match = re.match(r'^(T\d+[a-z]?):', title)
    if match:
        task_id = match.group(1)
        task_to_beads[task_id] = beads_id

print(f"Found {len(task_to_beads)} task-to-Beads mappings")

# Read tasks.md
with open(tasks_file, "r") as f:
    content = f.read()

# Replace tasks without Beads IDs
lines = content.split("\n")
updated_lines = []
updated_count = 0

for line in lines:
    # Match task lines without Beads IDs
    match = re.match(r'^- \[ \] (T\d+[a-z]?) (.+)$', line)
    if match:
        task_id = match.group(1)
        rest = match.group(2)
        if task_id in task_to_beads:
            # Add Beads ID
            beads_id = task_to_beads[task_id]
            updated_line = f"- [ ] ({beads_id}) {task_id} {rest}"
            updated_lines.append(updated_line)
            print(f"✓ Updated {task_id} → {beads_id}")
            updated_count += 1
        else:
            updated_lines.append(line)
    else:
        updated_lines.append(line)

# Write back to tasks.md
with open(tasks_file, "w") as f:
    f.write("\n".join(updated_lines))

print(f"\n✅ Updated {updated_count} tasks with Beads IDs")
PYTHON_SCRIPT "$TASKS_FILE"

UPDATE_STATUS=$?

if [ $UPDATE_STATUS -eq 0 ]; then
    log_success "Tasks file updated successfully"
    log_info "Review changes: git diff $TASKS_FILE"
    log_info "Restore backup if needed: mv $BACKUP_FILE $TASKS_FILE"
else
    log_error "Update failed. Restoring backup..."
    mv "$BACKUP_FILE" "$TASKS_FILE"
    exit 1
fi

exit 0
