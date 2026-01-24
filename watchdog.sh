#!/bin/bash
# Log file outside the repository to prevent git dirty state
LOG_FILE="/Users/speed/.gemini/tmp/watchdog_persistent.log"
echo "Starting Watchdog Loop (Persistent)..." > "$LOG_FILE"

while true; do
  echo "[$(date +%T)] Running next item..." >> "$LOG_FILE"
  # Run wreckit next
  wreckit next --no-tui --verbose >> "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ Crashed with code $EXIT_CODE. Restarting in 5s..." >> "$LOG_FILE"
    sleep 5
  else
    # Check for completion signal
    if tail -n 20 "$LOG_FILE" | grep -q "All items complete"; then
      echo "✅ All items complete! Exiting." >> "$LOG_FILE"
      break
    fi
    echo "✅ Item finished. Starting next..." >> "$LOG_FILE"
  fi
  sleep 1
done