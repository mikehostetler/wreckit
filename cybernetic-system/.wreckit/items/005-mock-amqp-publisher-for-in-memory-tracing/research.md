# Research: Implement Mock AMQP Publisher for Tracing

**Date**: 2025-01-22
**Item**: 005-mock-amqp-publisher-for-in-memory-tracing

## Research Question
How can we enable full dynamic tracing of the VSM system in a test environment without relying on external RabbitMQ infrastructure, while avoiding crashes when publishing messages?

**Motivation:**
Item 004 successfully implemented dynamic tracing but crashed when VSM systems attempted to publish messages to other systems because the AMQP Publisher wasn't running in `minimal_test_mode`. This prevents capturing the full "conversation" between systems (e.g., S1 -> S2 -> S4).

**Success criteria:**
- Implement a Mock Publisher that registers as `Cybernetic.Core.Transport.AMQP.Publisher`
- Prevent crashes when VSM systems call `GenServer.call(Publisher, {:publish, ...})`
- Route messages in-memory to target VSM systems (synchronous dispatch)
- Emit telemetry spans for mock publishes to maintain trace continuity
- Integrate seamlessly with `Mix.Tasks.Cyb.Trace` task

## Current State Analysis

### The Crash
When running `mix cyb.trace` in minimal test mode, the application starts without the AMQP supervision tree. However, VSM message handlers (e.g., `System1.MessageHandler`) attempt to forward messages to other systems using `Cybernetic.Core.Transport.AMQP.Publisher`:

```elixir
# lib/cybernetic/vsm/system1/message_handler.ex:260
GenServer.call(Cybernetic.Core.Transport.AMQP.Publisher, {:publish, ...})
```

This fails with `** (EXIT) no process` because the process isn't started.

### Architecture
- **Publisher Interface**: Expects a GenServer registered as `Cybernetic.Core.Transport.AMQP.Publisher` handling `{:publish, exchange, routing_key, payload, opts}` calls.
- **Routing Logic**: Messages are routed via routing keys (e.g., `"s2.coordinate"`, `"s4.intelligence"`) to specific exchanges (e.g., `"cyb.commands"`).
- **Target Systems**: 
  - `s1.*` -> `Cybernetic.VSM.System1.MessageHandler`
  - `s2.*` -> `Cybernetic.VSM.System2.MessageHandler`
  - `s3.*` -> `Cybernetic.VSM.System3.MessageHandler`
  - `s4.*` -> `Cybernetic.VSM.System4.MessageHandler`
  - `s5.*` -> `Cybernetic.VSM.System5.MessageHandler`

### Existing Components to Leverage
- **DynamicCollector**: Already captures `:telemetry` spans. The mock publisher should emit spans compatible with this collector.
- **Trace Task**: `Mix.Tasks.Cyb.Trace` already sets up the environment and generates traffic. It needs to be updated to start the MockPublisher.
- **TrafficGenerator**: Generates initial messages but relies on the system to propagate them.

## Technical Considerations

### 1. Mock Publisher Implementation
The Mock Publisher must be a GenServer that:
- Starts with name `Cybernetic.Core.Transport.AMQP.Publisher`
- Implements `handle_call({:publish, ...}, ...)`
- Parses routing keys to identify the target module
- Invokes `TargetModule.handle_message/3` directly
- Emits `[:cyb, :amqp, :publish]` telemetry events to simulate real AMQP behavior

### 2. In-Memory Routing Map
We need a mapping from routing keys to handler modules:
- `"s1."` prefix -> `Cybernetic.VSM.System1.MessageHandler`
- `"s2."` prefix -> `Cybernetic.VSM.System2.MessageHandler`
- `"s3."` prefix -> `Cybernetic.VSM.System3.MessageHandler`
- `"s4."` prefix -> `Cybernetic.VSM.System4.MessageHandler`
- `"s5."` prefix -> `Cybernetic.VSM.System5.MessageHandler`

### 3. Trace Continuity
To maintain the trace visualization:
- The mock publisher must extract the `trace_id` from the options/metadata
- Pass it to the target handler
- Emit a span for the "publish" operation so the trace shows the hop

### 4. Integration Point
The Mock Publisher should be started in `Mix.Tasks.Cyb.Trace.run/1` *before* traffic generation begins, but only if the real publisher isn't running.

## Key Files

- **Publisher Interface**: `lib/cybernetic/core/transport/amqp/publisher.ex`
- **Trace Task**: `lib/mix/tasks/cyb.trace.ex`
- **System 1 Handler**: `lib/cybernetic/vsm/system1/message_handler.ex` (Example of publishing)
- **Application**: `lib/cybernetic/application.ex` (Where real publisher is skipped in test mode)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Naming Conflict** | High | Check `Process.whereis` before starting mock. Only start if real publisher is missing. |
| **Infinite Loops** | Medium | Use `Process.spawn` or `Task.start` for dispatch to avoid deadlocks in synchronous calls. |
| **Trace ID Loss** | Medium | Ensure metadata passed to `handle_message` preserves the `trace_id` from the publish call. |
| **Test Pollution** | Low | The mock is ephemeral and only lives during the trace task execution. |

## Recommended Approach

1.  **Create `Cybernetic.Archeology.MockPublisher`**: A specialized GenServer for this purpose.
2.  **Implement Synchronous Dispatch**: Use `apply(module, :handle_message, ...)` within the mock to immediately trigger the next step in the VSM chain.
3.  **Update Trace Task**: Modify `lib/mix/tasks/cyb.trace.ex` to start this mock.

This approach effectively "short-circuits" the distributed architecture into a local, synchronous call stack for the purpose of tracing, which is exactly what we want for a self-contained audit.
