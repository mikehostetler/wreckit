# SDK Mode Feature Parity Testing

This document describes how to verify feature parity between process mode and SDK mode.

## Manual Testing Steps

### 1. Test Process Mode

```bash
# Set process mode in config
cat > .wreckit/config.json << EOF
{
  "schema_version": 1,
  "agent": {
    "mode": "process",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
EOF

# Run a simple item
wreckit ideas <<< "Add a hello world function"
wreckit run features/001-add-a-hello-world-function --dry-run
```

### 2. Test SDK Mode

```bash
# Set SDK mode in config
cat > .wreckit/config.json << EOF
{
  "schema_version": 1,
  "agent": {
    "mode": "sdk"
  }
}
EOF

# Run the same item
wreckit run features/001-add-a-hello-world-function --dry-run
```

### 3. Compare Outputs

Both modes should:

- Produce equivalent output structure
- Handle errors similarly
- Respect timeout settings
- Support dry-run mode
- Support mock-agent mode

## Automated Tests

The test suite includes:

1. **Unit tests** (`src/__tests__/agent.test.ts`):
   - Tests for both process and SDK modes
   - Dry-run mode tests for both modes
   - Mock-agent mode tests for both modes
   - Config extraction tests

2. **Integration tests**:
   - Run `npm test` to execute all tests
   - Tests use shell commands for process mode
   - SDK mode uses mock implementations to avoid API calls

3. **SDK Integration tests** (`src/__tests__/sdk-integration/*.integration.test.ts`):
   - Tests for Amp, Codex, and OpenCode experimental SDK runners
   - Mock-based testing (no API credentials required)
   - Covers: message formatting, event emission, error handling, SDK options
   - Run with: `bun test ./src/__tests__/sdk-integration/*.integration.test.ts`

## Verification Checklist

- [ ] Process mode: dry-run works
- [ ] SDK mode: dry-run works
- [ ] Process mode: mock-agent works
- [ ] SDK mode: mock-agent works
- [ ] Process mode: timeout handling
- [ ] SDK mode: timeout handling
- [ ] Process mode: error handling
- [ ] SDK mode: error handling
- [ ] Config schema validates both modes
- [ ] Prompt templates render for both modes
