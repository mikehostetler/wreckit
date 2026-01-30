# Fix Telegram Reflex Arc (Input -> Response Loop) Implementation Plan

## Overview

Implement the missing AMQP consumer for System 4 (Intelligence) to complete the Telegram Agent's "reflex arc" - the bidirectional message flow from Telegram input through S4 processing back to Telegram output. Currently, messages enter the system but are never consumed from the `cyb.s4.llm` queue, causing them to vanish without processing or response.

## Current State Analysis

### Existing Architecture

**Message Flow (Current - Broken):**
1. TelegramAgent polls Telegram API → receives message (telegram_agent.ex:162-227)
2. TelegramAgent.classify_and_route() determines routing key (lines 275-301)
   - Questions with "?" → `s4.reason`
   - "think:" or "analyze:" → `s4.reason`
3. TelegramAgent publishes to AMQP `cyb.commands` exchange with routing key `s4.reason` (lines 116-122)
4. Message arrives at `cyb.s4.llm` queue (bound to `s4.*` in publisher.ex:140)
5. **BREAKPOINT: No consumer listening on `cyb.s4.llm` queue**
6. TelegramAgent waits for `{:s4_response, correlation_id, response}` message (lines 145-160)
7. Message never arrives → no response sent to Telegram user

**Message Flow (Expected - After Fix):**
1. TelegramAgent receives message and publishes to `cyb.commands` with `s4.reason`
2. S4 AMQP Consumer consumes message from `cyb.s4.llm` queue
3. Consumer extracts operation and routes to S4 MessageHandler
4. S4 Intelligence processes the request
5. Consumer sends response back via `send(TelegramAgent, {:s4_response, correlation_id, response})`
6. TelegramAgent receives response and sends to Telegram user

### Key Discoveries

**Queue Configuration:**
- `lib/cybernetic/core/transport/amqp/publisher.ex:140` - Queue binding: `{"cyb.s4.llm", commands_exchange, "s4.*"}`
- `lib/cybernetic/core/transport/amqp/topology.ex:118` - Alternative binding: `{"cyb.vsm.s4", "vsm.s4.intelligence", "s4.#"}`
- Messages are correctly bound and routed, but no consumer exists

**Existing Consumer Pattern:**
- `lib/cybernetic/core/transport/amqp/consumer.ex:13` - Consumes from `@queue "cyb.consumer"` only
- Lines 168-184: `process_by_type()` routes VSM messages by extracting system number from type field
- Uses whitelist for security (lines 18-24)
- Pattern: `apply(vsm_module, :handle_message, [message, meta])` (line 174)

**S4 Processing Infrastructure:**
- `lib/cybernetic/vsm/system4/intelligence.ex:47-52` - Public `handle_message/2` interface exists
- `lib/cybernetic/vsm/system4/message_handler.ex:8-21` - `handle_message/3` with telemetry wrapping
- Lines 23-55: Operation routing (intelligence, analyze, learn, predict, algedonic)
- Lines 196-216: `process_intelligence_analysis()` processes requests and returns analysis result map
- **MISSING:** No code to send response back to TelegramAgent

**TelegramAgent Response Pattern:**
- Lines 114-122: Publishes with correlation_id
- Lines 125-129: Tracks pending response in `state.pending_responses[correlation_id]`
- Lines 145-160: Expects `{:s4_response, correlation_id, response}` message
- Lines 148-150: Looks up chat_id and sends reply via `send_message/2`

**Application Startup:**
- `lib/cybernetic/application.ex:129-132` - S4 services started:
  - `Cybernetic.VSM.System4.LLMBridge` - No consumer logic
  - `Cybernetic.VSM.System4.Service` - LLM provider routing, not AMQP consumer
  - **NO AMQP CONSUMER FOR S4 QUEUE**

### Constraints

**Must Work Within:**
1. Existing AMQP infrastructure (exchanges, queues, bindings)
2. Existing correlation ID pattern in TelegramAgent
3. Existing S4 MessageHandler operation routing
4. Security pattern (whitelist-based routing)
5. Telemetry and observability requirements

**Cannot Modify:**
- TelegramAgent message format or response pattern
- AMQP topology (exchanges/queues already configured)
- S4 Intelligence GenServer core logic

## Desired End State

### Functional Requirements

1. **S4 AMQP Consumer**: A dedicated consumer for `cyb.s4.llm` queue that processes all S4-bound messages
2. **Response Routing**: After processing, consumer extracts correlation_id and sends response to TelegramAgent
3. **Error Handling**: Graceful fallback when S4 processing fails or times out
4. **Observability**: Telemetry events for message flow through the reflex arc

### Verification Criteria

**Automated:**
- Application starts without errors
- AMQP consumer registered and consuming from `cyb.s4.llm` queue
- No error logs related to missing consumer or unhandled messages

**Manual:**
- Send "hi" to Telegram bot → receive intelligent response
- Send "think: what is 2+2?" → receive analyzed response
- Response time <2 seconds
- Messages not lost in RabbitMQ (no buildup in `cyb.s4.llm` queue)

## What We're NOT Doing

**Explicitly Out of Scope:**
- Modifying TelegramAgent's message format or correlation ID pattern
- Changing AMQP topology (exchanges, queues, bindings)
- Implementing S4 LLM provider logic (already exists in S4.Service)
- Adding timeout handling in TelegramAgent (can be separate enhancement)
- Implementing fallback error responses (can be separate enhancement)
- Creating comprehensive telemetry (basic logging only)
- Modifying existing generic AMQP consumer

**Why These Are Out of Scope:**
- Focus on minimal fix to complete the reflex arc
- Avoid risk of breaking existing functionality
- Keep changes localized to S4 consumption
- Additional features can be follow-up items

## Implementation Approach

### Strategy

Create a dedicated S4 AMQP Consumer that:
1. Follows the existing consumer pattern but specifically for S4
2. Uses the existing S4 message handling infrastructure
3. Implements the response callback pattern expected by TelegramAgent
4. Maintains security (whitelist) and observability (telemetry)

**Key Design Decisions:**

1. **Separate Consumer vs Modify Existing**: Create new consumer to avoid breaking working `cyb.consumer` logic
2. **Direct Process Messaging**: Use `send(TelegramAgent, {:s4_response, ...})` matching existing code pattern
3. **Operation Extraction**: Extract from both routing key (`s4.reason` → "reason") and payload for flexibility
4. **Response Format**: Convert S4 analysis results to text for Telegram

---

## Phase 1: Create S4 AMQP Consumer

### Overview

Implement a dedicated AMQP consumer for System 4 that consumes messages from the `cyb.s4.llm` queue, routes them to the S4 message handler, and sends responses back to the TelegramAgent.

### Changes Required

#### 1. Create S4 AMQP Consumer Module

**File**: `lib/cybernetic/vsm/system4/amqp_consumer.ex` (NEW FILE)

**Purpose**: Dedicated AMQP consumer for System 4 intelligence processing

```elixir
defmodule Cybernetic.VSM.System4.AMQPConsumer do
  @moduledoc """
  AMQP consumer for System 4 (Intelligence).
  Consumes messages from cyb.s4.llm queue bound to cyb.commands exchange with s4.* routing key.
  Processes messages through S4 MessageHandler and routes responses back to requesters.
  """
  use GenServer
  use AMQP
  require Logger
  alias Cybernetic.Core.Transport.AMQP.Connection

  @queue "cyb.s4.llm"
  @exchange "cyb.commands"
  @default_prefetch_count 10

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(_opts) do
    send(self(), :connect)
    {:ok, %{channel: nil, consumer_tag: nil}}
  end

  def handle_info(:connect, state) do
    case Connection.get_channel() do
      {:ok, channel} ->
        setup_queue(channel)
        {:ok, consumer_tag} = Basic.consume(channel, @queue)
        Basic.qos(channel, prefetch_count: @default_prefetch_count)
        Logger.info("S4 AMQP Consumer started on queue #{@queue}")
        {:noreply, %{state | channel: channel, consumer_tag: consumer_tag}}

      {:error, reason} ->
        Logger.error("S4 AMQP Consumer failed to connect: #{inspect(reason)}")
        Process.send_after(self(), :connect, 5_000)
        {:noreply, state}
    end
  end

  def handle_info({:basic_deliver, payload, meta}, state) do
    Logger.debug("S4 Consumer received message with routing key: #{meta.routing_key}")

    case Jason.decode(payload) do
      {:ok, message} ->
        process_message(message, meta, state)
        Basic.ack(state.channel, meta.delivery_tag)

      {:error, reason} ->
        Logger.error("Failed to decode message: #{inspect(reason)}")
        Basic.reject(state.channel, meta.delivery_tag, requeue: false)
    end

    {:noreply, state}
  end

  def handle_info({:basic_consume_ok, %{consumer_tag: tag}}, state) do
    Logger.debug("S4 Consumer registered: #{tag}")
    {:noreply, state}
  end

  def handle_info({:basic_cancel, _}, state) do
    Logger.warning("S4 Consumer cancelled")
    {:stop, :normal, state}
  end

  def handle_info({:DOWN, _, :process, _pid, reason}, state) do
    Logger.error("S4 Consumer channel down: #{inspect(reason)}")
    send(self(), :connect)
    {:noreply, %{state | channel: nil}}
  end

  defp setup_queue(channel) do
    # Queue should already exist from topology setup
    case Queue.declare(channel, @queue, passive: true) do
      {:ok, _} ->
        Logger.debug("Queue #{@queue} exists")
      {:error, _} ->
        Logger.warning("Queue #{@queue} does not exist - topology should create it")
    end
  end

  defp process_message(message, meta, _state) do
    # Extract correlation_id from headers (Publisher puts it there)
    headers = get_in(message, ["headers"]) || %{}
    correlation_id = Map.get(headers, "correlation_id")
    source = Map.get(headers, "source", "unknown")

    # Extract operation from routing key or message payload
    operation = extract_operation(meta.routing_key, message)

    # Extract payload (remove envelope if present)
    payload = Map.get(message, "payload", message)

    # Build metadata for handler
    handler_meta = %{
      correlation_id: correlation_id,
      routing_key: meta.routing_key,
      source: source
    }

    # Process through S4 MessageHandler
    result = Cybernetic.VSM.System4.MessageHandler.handle_message(operation, payload, handler_meta)

    # Send response if correlation_id present (Telegram request)
    if correlation_id do
      send_telegram_response(correlation_id, format_result(result))
    end

    # Emit telemetry for message processing
    :telemetry.execute([:s4, :amqp, :processed], %{count: 1}, %{
      operation: operation,
      routing_key: meta.routing_key,
      correlation_id: correlation_id,
      source: source
    })

    Logger.debug("S4 processed #{operation} for correlation_id: #{correlation_id}")
  end

  defp extract_operation("s4.reason", _message), do: "intelligence"
  defp extract_operation("s4.analyze", _message), do: "analyze"
  defp extract_operation("s4.learn", _message), do: "learn"
  defp extract_operation("s4.predict", _message), do: "predict"
  defp extract_operation(_routing_key, message) do
    # Fallback to operation field in message
    Map.get(message, "operation", "intelligence")
  end

  defp send_telegram_response(correlation_id, response) do
    try do
      send(Cybernetic.VSM.System1.Agents.TelegramAgent, {:s4_response, correlation_id, response})
      Logger.debug("Sent S4 response to TelegramAgent for correlation_id: #{correlation_id}")
    catch
      :exit, {:noproc, _} ->
        Logger.warning("TelegramAgent not available, cannot send response")
      kind, reason ->
        Logger.error("Failed to send response to TelegramAgent: #{kind}: #{inspect(reason)}")
    end
  end

  defp format_result(:ok) do
    %{"result" => "Request processed successfully"}
  end

  defp format_result({:ok, result}) when is_map(result) do
    # Convert result map to response format
    case Map.get(result, "type") do
      "vsm.s4.analysis_complete" ->
        analysis_type = Map.get(result, "analysis_type", "analysis")
        health_score = Map.get(result, "health_score", 0.0)
        recommendations = Map.get(result, "recommendations", [])

        response_text = """
        Analysis: #{analysis_type}
        Health Score: #{Float.round(health_score * 100, 1)}%
        Recommendations: #{Enum.join(recommendations, ", ")}
        """

        %{"result" => response_text}

      _type ->
        %{"result" => inspect(result)}
    end
  end

  defp format_result({:error, reason}) do
    %{"error" => "Processing failed: #{inspect(reason)}"}
  end

  defp format_result(other), do: %{"result" => inspect(other)}
end
```

**Key Features:**
- Consumes from `cyb.s4.llm` queue bound to `cyb.commands` with `s4.*`
- Extracts operation from routing key (s4.reason → "intelligence")
- Routes to S4 MessageHandler.handle_message/3
- Sends response back to TelegramAgent using correlation ID
- Emits telemetry for observability
- Handles missing TelegramAgent gracefully

### Success Criteria

#### Automated Verification:
- [ ] Module compiles without errors: `mix compile`
- [ ] Application starts successfully: `mix phx.server`
- [ ] No error logs related to S4 AMQP consumer startup
- [ ] Consumer appears in supervisor tree

#### Manual Verification:
- [ ] Check RabbitMQ management UI: consumer connected to `cyb.s4.llm` queue
- [ ] Send test message via Telegram
- [ ] Verify consumer logs show message received
- [ ] **PAUSE HERE** - Confirm messages are being consumed before proceeding

---

## Phase 2: Add Consumer to Application Supervisor

### Overview

Register the S4 AMQP Consumer in the application supervisor so it starts with the rest of the system.

### Changes Required

#### 1. Update Application Supervisor

**File**: `lib/cybernetic/application.ex`

**Location**: Line 132 (after S4 Service, before S4 Memory)

**Changes**: Add S4 AMQP Consumer to children list

```elixir
# BEFORE (lines 128-134):
               # S4 Intelligence Layer
               {Cybernetic.VSM.System4.LLMBridge,
                provider: Cybernetic.VSM.System4.Providers.Null},
               # S4 Multi-Provider Intelligence Service
               {Cybernetic.VSM.System4.Service, []},
               # S4 Memory for conversation context
               {Cybernetic.VSM.System4.Memory, []},

# AFTER:
               # S4 Intelligence Layer
               {Cybernetic.VSM.System4.LLMBridge,
                provider: Cybernetic.VSM.System4.Providers.Null},
               # S4 Multi-Provider Intelligence Service
               {Cybernetic.VSM.System4.Service, []},
               # S4 AMQP Consumer for processing intelligence requests
               {Cybernetic.VSM.System4.AMQPConsumer, []},
               # S4 Memory for conversation context
               {Cybernetic.VSM.System4.Memory, []},
```

### Success Criteria

#### Automated Verification:
- [ ] Application compiles: `mix compile`
- [ ] Application starts without errors: `mix phx.server`
- [ ] Logs show "S4 AMQP Consumer started on queue cyb.s4.llm"
- [ ] Consumer appears in process tree: `Observer_cli` or `:observer.start()`

#### Manual Verification:
- [ ] Check RabbitMQ management UI → Queues → `cyb.s4.llm` → Consumers tab shows active consumer
- [ ] Send Telegram message, verify no errors in logs
- [ ] **PAUSE HERE** - Confirm consumer is running before testing end-to-end

---

## Phase 3: End-to-End Testing

### Overview

Verify the complete reflex arc works: Telegram → AMQP → S4 → Response → Telegram

### Test Scenarios

#### Test 1: Simple Question

**Steps:**
1. Send message to Telegram bot: "hi"
2. Watch application logs for:
   - TelegramAgent receiving message
   - Publishing to AMQP with routing key `s4.reason`
   - S4 Consumer consuming message
   - S4 processing message
   - Response sent back to TelegramAgent
   - TelegramAgent sending response to Telegram API
3. Verify response received in Telegram

**Expected Logs:**
```
[debug] S1 Telegram received from <chat_id>: hi
[debug] S4 Consumer received message with routing key: s4.reason
[debug] System4 received intelligence: ...
[info] System4: Processing intelligence - ...
[debug] Sent S4 response to TelegramAgent for correlation_id: tg_...
```

**Expected Result:** Response from S4 intelligence

#### Test 2: Complex Reasoning Request

**Steps:**
1. Send message: "think: what is the meaning of life?"
2. Verify response is intelligent and relevant
3. Check response time <2 seconds

**Expected Result:** Thoughtful analysis response

#### Test 3: Analysis Request

**Steps:**
1. Send message: "analyze: why is the sky blue?"
2. Verify structured analysis response

**Expected Result:** Analysis with health score and recommendations

### Success Criteria

#### Manual Verification:
- [ ] Test 1 passes: "hi" receives response
- [ ] Test 2 passes: "think:" request receives analysis
- [ ] Test 3 passes: "analyze:" request receives structured response
- [ ] All responses received within 2 seconds
- [ ] No error logs in console
- [ ] No message buildup in RabbitMQ `cyb.s4.llm` queue

#### Observable Metrics:
- [ ] Response time <2000ms
- [ ] Success rate = 100% (3/3 tests pass)
- [ ] No orphaned correlation_ids in TelegramAgent state
- [ ] Telemetry events emitted for all S4 processing

---

## Testing Strategy

### Unit Testing

**Focus:** S4 AMQP Consumer message processing logic

```elixir
# test/cybernetic/vsm/system4/amqp_consumer_test.exs

defmodule Cybernetic.VSM.System4.AMQPConsumerTest do
  use ExUnit.Case

  test "extract_operation/2 maps routing keys to operations" do
    assert Cybernetic.VSM.System4.AMQPConsumer.extract_operation("s4.reason", %{}) == "intelligence"
    assert Cybernetic.VSM.System4.AMQPConsumer.extract_operation("s4.analyze", %{}) == "analyze"
  end

  test "format_result/1 converts analysis to response" do
    result = %{
      "type" => "vsm.s4.analysis_complete",
      "analysis_type" => "test",
      "health_score" => 0.95
    }

    response = Cybernetic.VSM.System4.AMQPConsumer.format_result({:ok, result})
    assert Map.has_key?(response, "result")
    assert String.contains?(response["result"], "95%")
  end
end
```

### Integration Testing

**Focus:** Complete message flow through AMQP

```bash
# Manual integration test script
# test/integration/telegram_reflex_arc_test.sh

#!/bin/bash
# Prerequisites: TELEGRAM_BOT_TOKEN set, RabbitMQ running, application started

echo "Testing Telegram Reflex Arc..."

# Send test message via Telegram API
CHAT_ID="your_test_chat_id"
MESSAGE="hi"

curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$CHAT_ID" \
  -d "text=$MESSAGE"

echo "Sent test message. Check logs and Telegram for response..."
```

### Manual Testing Checklist

1. **Startup Verification**
   - [ ] Application starts without errors
   - [ ] S4 AMQP Consumer logs "started on queue cyb.s4.llm"
   - [ ] RabbitMQ shows consumer connected to `cyb.s4.llm`

2. **Message Flow Verification**
   - [ ] Send "hi" to Telegram bot
   - [ ] Logs show message received by TelegramAgent
   - [ ] Logs show message published to AMQP
   - [ ] Logs show S4 Consumer consumed message
   - [ ] Logs show S4 MessageHandler processed message
   - [ ] Logs show response sent to TelegramAgent
   - [ ] Logs show TelegramAgent sent to Telegram API
   - [ ] Response appears in Telegram

3. **Error Handling Verification**
   - [ ] Stop S4 Service mid-processing
   - [ ] Send message to Telegram
   - [ ] Verify error response received (not hanging)
   - [ ] Verify no message stuck in queue

4. **Performance Verification**
   - [ ] Send 10 messages in quick succession
   - [ ] All responses received within 2 seconds
   - [ ] No message loss or duplication

---

## Migration Notes

### Deployment Strategy

**Zero-Downtime Deployment:**
1. Deploy new code with S4 AMQP Consumer
2. Consumer starts and begins consuming from `cyb.s4.llm`
3. Existing messages in queue are processed
4. No configuration changes needed (queue/exchange already exist)

**Rollback Plan:**
1. Remove S4 AMQP Consumer from application.ex
2. Redeploy
3. System returns to previous state (messages consumed but not processed)
4. Queue may accumulate messages (manual cleanup via RabbitMQ UI)

### Post-Deployment Verification

1. Check logs for "S4 AMQP Consumer started"
2. Verify RabbitMQ consumer count on `cyb.s4.llm` queue
3. Send test message and verify response
4. Monitor queue depth (should be 0 or low)

### Data Migration

**No data migration required** - AMQP messages are transient and queue already exists.

---

## References

### Key Files

**Telegram Agent:**
- `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:107-132` - Message publishing
- `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:145-160` - Response handling
- `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:274-301` - Routing logic

**AMQP Infrastructure:**
- `lib/cybernetic/core/transport/amqp/publisher.ex:140` - Queue binding
- `lib/cybernetic/core/transport/amqp/consumer.ex:1-245` - Generic consumer pattern
- `lib/cybernetic/core/transport/amqp/topology.ex:118` - Topology bindings

**System 4:**
- `lib/cybernetic/vsm/system4/intelligence.ex:47-52` - Public interface
- `lib/cybernetic/vsm/system4/message_handler.ex:8-54` - Message processing
- `lib/cybernetic/vsm/system4/message_handler.ex:196-216` - Analysis processing

**Application:**
- `lib/cybernetic/application.ex:129-132` - S4 services startup

### Research Document

- `/Users/speed/wreckit/cybernetic-system/.wreckit/items/031-fix-telegram-reflex-arc/research.md`

### Related Issues

None (standalone fix)

---

## Appendix: Message Format Examples

### Telegram → AMQP Message

```json
{
  "headers": {
    "correlation_id": "tg_1234567890_123456",
    "causal": {},
    "source": "telegram_agent"
  },
  "payload": {
    "operation": "reasoning_request",
    "text": "hi",
    "chat_id": 123456789,
    "from": {},
    "timestamp": 1706544000,
    "source": "telegram"
  }
}
```

### S4 Response → TelegramAgent

```elixir
{:s4_response, "tg_1234567890_123456", %{
  "result" => "Processed: hi"
}}
```

### TelegramAgent → Telegram API

```json
{
  "chat_id": 123456789,
  "text": "Response: %{\"result\" => \"Processed: hi\"}",
  "parse_mode": "Markdown"
}
```
