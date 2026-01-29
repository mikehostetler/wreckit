# Sandbox Mode - E2E Test Plan

**Item**: 079-sandbox-usability-layer
**Story**: US-011 - Perform end-to-end manual testing
**Required**: Sprite CLI installation and Sprites.dev account

## Prerequisites

1. Install Sprite CLI from https://sprites.dev/
2. Authenticate with Sprites.dev: `sprite auth login`
3. Ensure wreckit is installed: `npm install -g wreckit`
4. Initialize a test repository: `mkdir /tmp/wreckit-sandbox-test && cd /tmp/wreckit-sandbox-test && wreckit init`

## Test Scenarios

### Test 1: Normal Execution

**Objective**: Verify VM is created, agent runs, VM is destroyed, and changes are synced

```bash
cd /tmp/wreckit-sandbox-test

# Create a simple test item
echo "Add a hello world function" | wreckit ideas

# Run in sandbox mode
wreckit run <item-id> --sandbox --verbose

# Verify VM cleanup
wreckit sprite list
# Expected: No VMs listed (or only VMs from other tests)
```

**Acceptance Criteria**:
- [ ] VM is created with name format: `wreckit-sandbox-<id>-<timestamp>`
- [ ] Agent executes successfully
- [ ] Files are synced back to host
- [ ] VM is destroyed after completion
- [ ] No orphaned VMs remain

---

### Test 2: Interrupt During Execution

**Objective**: Verify Ctrl+C triggers VM cleanup

```bash
cd /tmp/wreckit-sandbox-test

# Start a long-running task
wreckit run <item-id> --sandbox --verbose

# While agent is running, press Ctrl+C once
# Wait for cleanup to complete

# Verify VM cleanup
wreckit sprite list
# Expected: No VMs listed
```

**Acceptance Criteria**:
- [ ] First Ctrl+C triggers graceful shutdown
- [ ] Log message: "Interrupted. Cleaning up..."
- [ ] VM is cleaned up
- [ ] Log message: "Cleanup completed"
- [ ] No orphaned VMs remain

---

### Test 3: Interrupt During Sync

**Objective**: Verify cleanup works even when interrupted during file sync

```bash
cd /tmp/wreckit-sandbox-test

# Create a large project to ensure sync takes time
git clone https://github.com/torvalds/linux.git /tmp/large-project 2>/dev/null || true
cd /tmp/large-project
wreckit init

# Run in sandbox mode
wreckit run <item-id> --sandbox --verbose

# Press Ctrl+C during sync phase
# Wait for cleanup

# Verify VM cleanup
wreckit sprite list
```

**Acceptance Criteria**:
- [ ] Ctrl+C during sync triggers cleanup
- [ ] VM is destroyed
- [ ] No partial sync state
- [ ] No orphaned VMs

---

### Test 4: Agent Failure

**Objective**: Verify VM cleanup happens even when agent fails

```bash
cd /tmp/wreckit-sandbox-test

# Create a task that will fail (e.g., syntax error in prompt)
cat <<EOF | wreckit ideas
Create a function with intentional syntax error: function foo {
EOF

# Run in sandbox mode
wreckit run <item-id> --sandbox --verbose

# Verify VM cleanup despite failure
wreckit sprite list
```

**Acceptance Criteria**:
- [ ] Agent fails with error
- [ ] VM is still cleaned up
- [ ] Log shows cleanup attempt
- [ ] No orphaned VMs remain

---

### Test 5: Concurrent Sandboxes

**Objective**: Verify multiple concurrent runs use different VM names

```bash
cd /tmp/wreckit-sandbox-test

# Create multiple items
echo "Task 1" | wreckit ideas
echo "Task 2" | wreckit ideas
echo "Task 3" | wreckit ideas

# Run in parallel (background jobs)
wreckit run <id1> --sandbox --verbose &
PID1=$!
wreckit run <id2> --sandbox --verbose &
PID2=$!
wreckit run <id3> --sandbox --verbose &
PID3=$!

# Check VM names while running
sleep 2
wreckit sprite list
# Expected: 3 different VMs with different timestamps

# Wait for completion
wait $PID1
wait $PID2
wait $PID3

# Verify all VMs cleaned up
wreckit sprite list
# Expected: No VMs listed
```

**Acceptance Criteria**:
- [ ] Each run gets unique VM name
- [ ] VM names include different timestamps
- [ ] All VMs run concurrently without conflicts
- [ ] All VMs are cleaned up after completion
- [ ] No name collisions

---

### Test 6: Missing Sprite CLI

**Objective**: Verify clear error message when Sprite CLI is not installed

```bash
# Temporarily remove Sprite CLI from PATH
export PATH="/tmp/empty-path:$PATH"

# Try to run sandbox mode
wreckit run <item-id> --sandbox

# Restore PATH
export PATH="$ORIGINAL_PATH"

# Check error message includes:
# - Installation instructions
# - Link to sprites.dev
# - Suggestion to use --sandbox flag
```

**Acceptance Criteria**:
- [ ] Error message mentions "https://sprites.dev"
- [ ] Error message provides installation instructions
- [ ] Error is logged at ERROR level
- [ ] Message is clear and actionable
- [ ] No cryptic errors

---

### Test 7: Config Interaction

**Objective**: Verify --sandbox flag overrides config.json settings

```bash
cd /tmp/wreckit-sandbox-test

# Set sprite config in config.json
cat <<EOF > .wreckit/config.json
{
  "agent": {
    "kind": "sprite",
    "vmName": "persistent-vm",
    "syncOnSuccess": false
  }
}
EOF

# Run with --sandbox flag
wreckit run <item-id> --sandbox --verbose

# Check VM name format (should be auto-generated, not "persistent-vm")
wreckit sprite list | grep -q "wreckit-sandbox-"

# Verify syncOnSuccess was enabled (check logs)
grep -q "syncOnSuccess" .wreckit/items/<id>/implementation.log
```

**Acceptance Criteria**:
- [ ] VM name is auto-generated (not "persistent-vm")
- [ ] syncOnSuccess is set to true
- [ ] Config is overridden correctly
- [ ] Log shows "Sandbox mode: Using Sprite agent with ephemeral VM"

---

### Test 8: Sync on Success

**Objective**: Verify file modifications are pulled back from VM

```bash
cd /tmp/wreckit-sandbox-test

# Create a task that modifies a file
cat <<EOF | wreckit ideas
Create a new file called test-output.txt with content "Hello from VM"
EOF

# Run in sandbox mode
wreckit run <item-id> --sandbox

# Check file exists on host
ls -la test-output.txt
cat test-output.txt

# Verify content
cat test-output.txt | grep -q "Hello from VM"
```

**Acceptance Criteria**:
- [ ] File created in VM is synced back to host
- [ ] File content is correct
- [ ] Sync happens on success (not on failure)
- [ ] No sync happens if agent fails

---

### Test 9: Dry Run Mode

**Objective**: Verify --dry-run shows correct config without creating VM

```bash
cd /tmp/wreckit-sandbox-test

# Run with dry-run
wreckit run <item-id> --sandbox --dry-run --verbose

# Verify no VM is created
wreckit sprite list
# Expected: No VMs listed

# Check logs show correct config transformation
grep -q "Sandbox mode" .wreckit/items/<id>/research.log
```

**Acceptance Criteria**:
- [ ] Config shows sprite agent
- [ ] No VM is created
- [ ] Logs show sandbox mode is active
- [ ] Dry-run skips actual VM operations

---

### Test 10: Double Ctrl+C (Force Exit)

**Objective**: Verify second Ctrl+C forces immediate exit

```bash
cd /tmp/wreckit-sandbox-test

# Start a long-running task
wreckit run <item-id> --sandbox --verbose

# Press Ctrl+C once
# Wait 1 second
# Press Ctrl+C again (force exit)

# Check if VM was cleaned up (best effort)
wreckit sprite list
```

**Acceptance Criteria**:
- [ ] First Ctrl+C starts cleanup
- [ ] Second Ctrl+C forces immediate exit
- [ ] Process exits immediately
- [ ] Warning logged about forced exit
- [ ] VM may be orphaned (acceptable in force exit case)

---

## Edge Cases

### Test 11: Empty Repository

```bash
mkdir /tmp/empty-repo
cd /tmp/empty-repo
wreckit init
echo "Test task" | wreckit ideas
wreckit run <id> --sandbox
```

**Expected**: Works correctly with empty repo

---

### Test 12: Large Repository

```bash
cd /tmp/large-project  # From Test 4
wreckit run <id> --sandbox --verbose
```

**Expected**: Sync handles large repo, timeout doesn't occur

---

### Test 13: Network Timeout

```bash
# Simulate network issues (if possible in test environment)
# Or use very slow network
wreckit run <id> --sandbox
```

**Expected**: Graceful error handling, no orphaned VMs

---

## Test Results Template

| Test | Status | Notes | Orphaned VMs? |
|------|--------|-------|---------------|
| Test 1: Normal Execution | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |
| Test 2: Interrupt During Execution | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |
| Test 3: Interrupt During Sync | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |
| Test 4: Agent Failure | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |
| Test 5: Concurrent Sandboxes | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |
| Test 6: Missing Sprite CLI | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |
| Test 7: Config Interaction | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |
| Test 8: Sync on Success | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |
| Test 9: Dry Run Mode | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |
| Test 10: Double Ctrl+C | ⬜ Pass / ❌ Fail | | ⬜ Yes / ☐ No |

## Cleanup After Testing

```bash
# Kill any orphaned VMs
wreckit sprite list | awk 'NR>1 {print $1}' | xargs -I {} wreckit sprite kill {}

# Clean up test directories
rm -rf /tmp/wreckit-sandbox-test
rm -rf /tmp/large-project
rm -rf /tmp/empty-repo
```

## Notes

- **Orphaned VMs**: If any test leaves orphaned VMs, note which test and why
- **Performance**: Note any timeouts or slow operations
- **Error Messages**: Copy any unclear or confusing error messages
- **Improvements**: Note any UX improvements discovered during testing

## Sign-off

**Tester**: _____________________
**Date**: _____________________
**Sprite CLI Version**: _____________________
**Wreckit Version**: _____________________
**Overall Status**: ⬜ All Tests Pass / ❌ Some Tests Fail

**Issues Found**:
1.
2.
3.

**Recommendations**:
1.
2.
3.
