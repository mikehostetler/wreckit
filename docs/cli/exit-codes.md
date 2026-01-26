# Exit Codes

Understanding exit codes for scripting.

## Exit Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `0` | Success | Command completed successfully |
| `1` | Error | Command failed (check error message) |
| `130` | Interrupted | Command was interrupted (Ctrl-C) |

## Scripting Examples

### Check if command succeeded

```bash
#!/bin/bash
wreckit run 1
if [ $? -eq 0 ]; then
  echo "Item completed successfully"
else
  echo "Item failed with exit code $?"
fi
```

### Run multiple items, stop on error

```bash
#!/bin/bash
for i in {1..5}; do
  wreckit run $i || exit 1
done
```

### Handle interruptions gracefully

```bash
#!/bin/bash
wreckit
EXIT_CODE=$?

if [ $EXIT_CODE -eq 130 ]; then
  echo "Interrupted by user"
  # Resume later
elif [ $EXIT_CODE -eq 0 ]; then
  echo "All items completed"
else
  echo "Error occurred: $EXIT_CODE"
  exit $EXIT_CODE
fi
```

### CI/CD integration

```bash
#!/bin/bash
# In CI pipeline
wreckit --no-tui --quiet

if [ $? -ne 0 ]; then
  echo "Wreckit failed"
  exit 1
fi

echo "Wreckit completed successfully"
```

### Retry logic

```bash
#!/bin/bash
MAX_RETRIES=3
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  wreckit run 1
  if [ $? -eq 0 ]; then
    echo "Success"
    exit 0
  fi

  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Retry $RETRY_COUNT/$MAX_RETRIES"
  sleep 5
done

echo "Failed after $MAX_RETRIES attempts"
exit 1
```

## Common Patterns

### Run all items, report failures

```bash
wreckit || echo "Some items failed"
```

### Single item with error handling

```bash
wreckit run 1 && echo "Success" || echo "Failed"
```

### Conditional execution

```bash
wreckit doctor && wreckit run 1
```

### Background job with exit code checking

```bash
wreckit &
WRECKIT_PID=$!
wait $WRECKIT_PID
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "Wreckit failed with exit code $EXIT_CODE"
fi
```

## Notes

- Exit code `0` always means success
- Exit code `1` is a general error (check stderr for details)
- Exit code `130` is standard for SIGINT (Ctrl-C)
- All non-zero exit codes indicate failure
- Use `--quiet` flag to reduce output when scripting
- Use `--no-tui` flag for CI/CD environments

[Back to CLI Reference](/cli/)
