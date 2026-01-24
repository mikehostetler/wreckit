#!/bin/bash
echo "Starting Watchdog Loop..." > watchdog.log

while true; do
  echo "Running next item..." >> watchdog.log
  wreckit next --no-tui --verbose >> watchdog.log 2>&1
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ Crashed with code $EXIT_CODE. Restarting in 5s..." >> watchdog.log
    sleep 5
  else
    # Check for completion signal in the last run's output
    # (Since we append to log, we check the tail)
    if tail -n 20 watchdog.log | grep -q "All items complete"; then
      echo "✅ All items complete! Exiting." >> watchdog.log
      break
    fi
    echo "✅ Item finished. Starting next..." >> watchdog.log
  fi
  sleep 1
done
