# Telegram Bot Polling Analysis - Critical Issue Found

## THE RACE CONDITION

The polling mechanism has a **critical race condition** that causes it to stop after processing messages.

## Current Flow (BROKEN)

```elixir
def handle_info(:poll_updates, state) do
  # 1. Spawns polling task
  task = spawn_link(fn -> 
    result = do_poll_updates_safe(bot_token, offset)  # Takes 5+ seconds (long poll)
    send(parent, {:poll_result, result})
  end)
  
  # 2. IMMEDIATELY schedules next poll (BAD!)
  delay = calculate_poll_delay(state.polling_failures)  # Usually 2-3 seconds
  Process.send_after(self(), :poll_updates, delay)      # Scheduled BEFORE current poll completes!
  
  {:noreply, %{state | polling_task: task}}
end
```

## The Problem

1. **First poll starts** at T=0
   - Spawns task that will take 5+ seconds (HTTP timeout=5s)
   - Schedules next `:poll_updates` for T=2s

2. **Second poll arrives** at T=2s (while first still running!)
   - Sees `polling_task` is still alive
   - **KILLS the first task**: `Process.exit(state.polling_task, :kill)`
   - First task never sends `{:poll_result, result}`

3. **Result**: Offset never updates, polling effectively stops

## Why It Appears to Work Initially

- First poll completes (no previous task to kill)
- Processes messages successfully
- But subsequent polls kill each other
- System enters zombie state: GenServer alive but not polling

## THE FIX

Move the scheduling of the next poll to AFTER the current poll completes:

```elixir
def handle_info(:poll_updates, state) do
  if state.bot_token do
    # Cancel previous task if still running
    if state.polling_task && Process.alive?(state.polling_task) do
      Process.exit(state.polling_task, :kill)
    end
    
    # Start supervised polling task
    parent = self()
    offset = state.telegram_offset
    bot_token = state.bot_token
    
    task = spawn_link(fn -> 
      result = do_poll_updates_safe(bot_token, offset)
      send(parent, {:poll_result, result})
    end)
    
    # DO NOT schedule next poll here!
    # Remove: Process.send_after(self(), :poll_updates, delay)
    
    {:noreply, %{state | polling_task: task}}
  else
    {:noreply, state}
  end
end

def handle_info({:poll_result, {:ok, new_offset}}, state) when new_offset > state.telegram_offset do
  # Successful poll with new messages
  
  # Schedule next poll NOW (after completion)
  delay = calculate_poll_delay(0)  # Reset failures on success
  Process.send_after(self(), :poll_updates, delay)
  
  {:noreply, %{state | 
    telegram_offset: new_offset,
    polling_failures: 0,
    last_poll_success: System.system_time(:second)
  }}
end

def handle_info({:poll_result, {:ok, _offset}}, state) do
  # Successful poll but no new messages
  
  # Schedule next poll NOW (after completion)
  delay = calculate_poll_delay(0)
  Process.send_after(self(), :poll_updates, delay)
  
  {:noreply, %{state | 
    polling_failures: 0,
    last_poll_success: System.system_time(:second)
  }}
end

def handle_info({:poll_result, {:error, reason}}, state) do
  Logger.warning("Telegram polling failed: #{inspect(reason)}")
  failures = state.polling_failures + 1
  
  # Schedule next poll with backoff
  delay = calculate_poll_delay(failures)
  Process.send_after(self(), :poll_updates, delay)
  
  {:noreply, %{state | polling_failures: failures}}
end
```

## Key Changes

1. **Remove** `Process.send_after` from `handle_info(:poll_updates)`
2. **Add** `Process.send_after` to ALL `handle_info({:poll_result, _})` handlers
3. This ensures next poll only starts AFTER current poll completes
4. No more race conditions, no more killed tasks

## Expected Behavior After Fix

- Poll completes → schedules next poll
- Each poll runs to completion
- Offset updates properly
- Continuous, uninterrupted polling
- Bot responds to all messages