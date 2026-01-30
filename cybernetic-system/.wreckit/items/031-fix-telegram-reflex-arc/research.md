# Research: Fix Telegram Reflex Arc (Input -> Response Loop)

**Date**: 2025-01-29
**Item**: 031-fix-telegram-reflex-arc

## Research Question

The Telegram Agent receives messages (Input confirmed via logs) but does not reply (Output confirmed working via manual script). The 'Reflex Arc' connects incoming messages to System 4 (Intelligence) and routes the response back to Telegram. Currently, messages enter the system and vanish into the void.

## Summary

The Telegram Agent successfully receives and polls messages from Telegram API, but the response loop is broken due to a missing AMQP consumer for the `s4.reason` routing key. When TelegramAgent receives a message that requires intelligence processing, it publishes to AMQP with routing key `s4.reason` and tracks a pending response with a correlation ID. However, there is no consumer listening on the `cyb.s4.llm` queue that's bound to `s4.*`, so the message is never processed by System 4 Intelligence, and consequently no response is ever sent back to TelegramAgent via the `{:s4_response, correlation_id, response}` message pattern.

The fix requires implementing the AMQP consumer for System 4 (likely via the existing `Cybernetic.Core.Transport.AMQP.Consumer` or a dedicated consumer) that:
1. Consumes from the `cyb.s4.llm` queue
2. Routes messages to `Cybernetic.VSM.System4.Intelligence`
3. Sends responses back to the TelegramAgent using the correlation ID

## Current State Analysis

### Existing Implementation

**Message Flow (Current - Broken):**
1. TelegramAgent polls Telegram API → receives message
2. TelegramAgent.classify_and_route() determines routing key (e.g., "s4.reason" for complex queries)
3. TelegramAgent publishes to `cyb.commands` exchange with routing key `s4.reason`
4. Message goes to `cyb.s4.llm` queue (bound to `s4.*`)
5. **PROBLEM: No consumer listening on `cyb.s4.llm` queue**
6. TelegramAgent waits for `{:s4_response, correlation_id, response}` message that never arrives
7. No response sent to Telegram user

**Message Flow (Expected):**
1. TelegramAgent receives message
2. Publishes to `cyb.commands` with routing key `s4.reason`
3. Consumer on `cyb.s4.llm` queue receives message
4. Consumer routes to `Cybernetic.VSM.System4.MessageHandler.handle_message()`
5. S4 Intelligence processes the message
6. Response sent back to TelegramAgent via `send(TelegramAgent, {:s4_response, correlation_id, response})`
7. TelegramAgent sends response to Telegram user via API

### Key Files

#### Telegram Agent
- `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:274-301` - `classify_and_route/3` determines routing key based on message content
  - Line 278: Policy questions → `s3.policy`
  - Line 282: Identity questions → `s5.identity`
  - Line 286: Complex reasoning → `s4.reason`
  - Line 292: Coordination → `s2.coordinate`
  - Line 296: Simple echo → `s1.echo` (works - sends immediate response)

- `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:107-132` - `handle_cast({:incoming_msg,...})` publishes to AMQP
  - Line 114-122: Publishes to `cyb.commands` exchange with routing key
  - Line 125-129: Tracks pending response in `state.pending_responses[correlation_id]`

- `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:145-160` - `handle_info({:s4_response,...})` expects response
  - **THIS CODE EXISTS BUT IS NEVER TRIGGERED** because no consumer sends this message
  - Line 148-150: Looks up chat_id from pending_responses and sends reply

#### AMQP Infrastructure
- `lib/cybernetic/core/transport/amqp/publisher.ex:140` - Queue binding setup
  - `{"cyb.s4.llm", commands_exchange, "s4.*"}` - Queue is bound correctly
  - Messages with routing key `s4.reason` should arrive here

- `lib/cybernetic/core/transport/amqp/consumer.ex:1-245` - Generic AMQP consumer
  - Line 13: Consumes from `@queue "cyb.consumer"` (NOT from `cyb.s4.llm`)
  - Line 168-184: `process_by_type()` routes VSM messages by extracting system number from type field
  - **PROBLEM: This consumer doesn't listen on `cyb.s4.llm` queue**

- `lib/cybernetic/core/transport/amqp/topology.ex:118` - Queue bindings
  - `{"cyb.vsm.s4", "vsm.s4.intelligence", "s4.#"}` - Alternative binding
  - Shows intent for S4 to consume `s4.*` messages

#### System 4 Intelligence
- `lib/cybernetic/vsm/system4/intelligence.ex:1-54` - S4 GenServer
  - Line 12-45: `handle_cast({:transport_message, message, opts})` - Can receive transport messages
  - Line 42: Calls `Cybernetic.VSM.System4.MessageHandler.handle_message()`

- `lib/cybernetic/vsm/system4/message_handler.ex:1-218` - S4 Message handler
  - Line 23-55: `do_handle_message()` routes by operation type
  - Line 196-216: `process_intelligence_analysis()` processes intelligence requests
  - **MISSING: No code to send response back to TelegramAgent**

#### Application Startup
- `lib/cybernetic/application.ex:128-132` - S4 services started
  - `Cybernetic.VSM.System4.LLMBridge` - No consumer logic
  - `Cybernetic.VSM.System4.Service` - Unknown implementation
  - **NO AMQP CONSUMER FOR S4 QUEUE**

## Technical Considerations

### Dependencies

**Internal Modules to Integrate:**
1. `Cybernetic.Core.Transport.AMQP.Consumer` - Generic consumer (needs to consume from `cyb.s4.llm`)
2. `Cybernetic.VSM.System4.Intelligence` - S4 GenServer that processes messages
3. `Cybernetic.VSM.System4.MessageHandler` - Message handler for S4 operations
4. `Cybernetic.VSM.System1.Agents.TelegramAgent` - Expects `{:s4_response, correlation_id, response}` messages

**External Dependencies:**
- AMQP broker (RabbitMQ) - Must have `cyb.commands` exchange and `cyb.s4.llm` queue
- Telegram Bot API - For sending responses

### Patterns to Follow

**Existing Message Response Pattern:**
- TelegramAgent uses correlation ID to track pending responses (line 114-129)
- Expects `{:s4_response, correlation_id, response}` message (line 145-160)
- This pattern should be used by S4 to send responses

**VSM Message Handling Pattern:**
- All VSM systems have `handle_message(message, meta)` function
- System1: `lib/cybernetic/vsm/system1/operational.ex:19-52`
- System2: `lib/cybernetic/vsm/system2/coordinator.ex:185-212`
- System4: `lib/cybernetic/vsm/system4/intelligence.ex:47-52`

**AMQP Message Flow Pattern:**
- Publisher: `Cybernetic.Core.Transport.AMQP.Publisher.publish(exchange, routing_key, payload, opts)`
- Consumer: `Cybernetic.Core.Transport.AMQP.Consumer` consumes from single queue
- Consumer extracts VSM system from `type` field: `"vsm.s4.intelligence"` → system "4"
- Consumer calls `apply(vsm_module, :handle_message, [message, meta])`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing S4 functionality | High | Add consumer as new service, don't modify existing S4 Intelligence GenServer |
| Message loss during deployment | Medium | Ensure queue is durable and messages persist until consumed |
| Circular dependency between S1 and S4 | Low | Use correlation ID pattern, avoid direct process messaging |
| No response from S4 intelligence service | High | Implement timeout and fallback to generic error message |
| AMQP consumer not started | High | Add to Application supervisor with proper error handling |

## Recommended Approach

### Phase 1: Add AMQP Consumer for S4 (Minimal Fix)

1. **Create S4 AMQP Consumer** in `lib/cybernetic/vsm/system4/amqp_consumer.ex`:
   - Similar to existing consumer but specifically for `cyb.s4.llm` queue
   - Consumes messages from `cyb.s4.llm` queue bound to `cyb.commands` exchange with `s4.*` routing key
   - Extracts operation from routing key or message payload
   - Calls `Cybernetic.VSM.System4.MessageHandler.handle_message()`

2. **Update S4 Message Handler** to send responses back:
   - After processing, extract correlation_id from message metadata
   - Send response to TelegramAgent: `send(Cybernetic.VSM.System1.Agents.TelegramAgent, {:s4_response, correlation_id, response})`
   - Use timeout to prevent hanging

3. **Add Consumer to Application Supervisor**:
   - Add to `lib/cybernetic/application.ex` children list
   - Ensure it starts after AMQP connection is established

### Phase 2: Enhance Error Handling

1. **Add timeout handling** in TelegramAgent for pending responses
2. **Add fallback responses** when S4 processing fails
3. **Add telemetry** for tracking message flow through the reflex arc

### Phase 3: Testing

1. **Integration test**: Send "hi" message, verify response
2. **Measure latency**: Ensure <2s response time
3. **Test error paths**: Verify error messages are logged and sent to user

## Open Questions

1. **Should S4 send responses via AMQP or direct process messaging?**
   - Current code expects direct messaging: `send(TelegramAgent, {:s4_response, ...})`
   - Alternative: Publish response to `cyb.responses` exchange that TelegramAgent consumes
   - **Recommendation**: Use direct messaging for simplicity, matching existing code pattern

2. **What should S4 return for intelligence requests?**
   - Current `process_intelligence_analysis()` returns analysis result map (line 202-210)
   - Needs to be formatted as text response for Telegram
   - **Recommendation**: Add `format_telegram_response/1` helper in S4 message handler

3. **Should we modify the existing Consumer or create a new S4-specific consumer?**
   - Existing consumer reads from `cyb.consumer` queue
   - S4 messages go to `cyb.s4.llm` queue
   - **Recommendation**: Create S4-specific consumer to avoid modifying working code

4. **What happens to S4 messages that aren't from Telegram?**
   - System may send S4 messages from other sources
   - Consumer should handle both Telegram and non-Telegram messages
   - **Recommendation**: Check for correlation_id, only send Telegram response if present

5. **Is there an existing `Cybernetic.VSM.System4.Service` module?**
   - Referenced in application.ex but not found in lib/
   - May need to be created or may be an alias
   - **Recommendation**: Verify if this exists or should be created as part of this fix
