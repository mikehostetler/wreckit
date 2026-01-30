# Research: Implement Dynamic System Tracing with :telemetry

**Date**: 2025-01-22
**Item**: 004-implement-dynamic-system-tracing-with-telemetry

## Research Question

Static analysis (Item 003) missed dynamic dispatch patterns and dependencies that only become visible at runtime.

**Motivation:** Dynamic tracing will capture the actual execution paths that static analysis cannot see, particularly for dynamic dispatch patterns. This will help validate archeology findings by comparing dynamic traces against static call graphs to identify 'invisible' dependencies.

**Success criteria:**
- Traces capture execution flow from HTTP/AMQP entry points to deep internal functions
- Disjoint events (HTTP request -> AMQP publish -> AMQP consume) are correlated via Trace IDs into a single cohesive story
- Output JSON is compatible with static analysis format for easy comparison
- Traces identify dependencies that were invisible to static analysis

**Technical constraints:**
- Must use :telemetry for instrumentation
- Must attach to existing telemetry events (Phoenix, Ecto, Oban)
- Must add new :telemetry.span/3 spans to critical gaps (VSM message handlers, internal service bridges)
- Collector must use GenServer + ETS for in-memory buffering
- Spans must be grouped by trace_id
- Output format must be JSON compatible with existing static analysis format

**In scope:**
- Creating Cybernetic.Archeology.DynamicTracer module
- Attaching to existing telemetry events
- Adding new telemetry spans to identified gaps
- Implementing ephemeral trace collector (GenServer + ETS)
- Creating mix cyb.trace task
- Generating synthetic traffic for testing
- Outputting traces to dynamic-traces.json

## Summary

The Cybernetic AMCP system already has extensive :telemetry instrumentation and OpenTelemetry integration, providing a solid foundation for dynamic tracing. However, the current telemetry is primarily used for metrics (counters, distributions, summaries) rather than execution flow tracing. The static archeology tool (Item 003) successfully identified 11 entry points but missed dynamic dispatch patterns that only appear at runtime.

To implement dynamic tracing, we need to:
1. **Create a DynamicTracer module** that uses `:telemetry.span/3` to capture execution flow
2. **Leverage existing telemetry events** from Phoenix (HTTP), AMQP (messaging), and Ecto/Oban (database/jobs)
3. **Add span wrappers** around VSM message handlers and internal bridges to capture cross-system messaging
4. **Implement an ephemeral collector** using GenServer + ETS that groups spans by trace_id
5. **Generate synthetic traffic** through existing test patterns to trigger traces
6. **Output in compatible JSON format** matching the static analysis output structure

The key challenge is correlating disjoint events (HTTP → AMQP publish → AMQP consume) using trace IDs propagated through AMQP headers (already implemented in `Cybernetic.Core.Transport.AMQP.Tracing`). The system already has OpenTelemetry context propagation via `Cybernetic.Telemetry.OTEL`, which we can leverage.

## Current State Analysis

### Existing Telemetry Infrastructure

**Telemetry Events and Attachments:**
- **Phoenix Endpoint**: `lib/cybernetic/edge/gateway/endpoint.ex:30` - Uses `Plug.Telemetry` with event prefix `[:cybernetic, :edge, :endpoint]`
- **AMQP Transport**: Multiple telemetry events for publish/consume operations
  - `[:cyb, :amqp, :publish]` - Message publishing with exchange/routing_key metadata
  - `[:cyb, :amqp, :consume]` - Message consumption with queue metadata
  - `[:cyb, :amqp, :retry]` and `[:cyb, :amqp, :poison]` - Error handling
- **VSM Systems**: Each VSM system (S1-S5) emits telemetry events
  - `[:vsm, :s1, :operation]` - System 1 operations
  - `[:vsm, :s2, :coordination]` - System 2 coordination
  - `[:vsm, :s3, :control]` - System 3 rate limiting
  - `[:vsm, :s4, :intelligence]` - System 4 intelligence processing
  - `[:vsm, :s5, :policy]` - System 5 policy evaluation

**Batched Collector Pattern:**
- `lib/cybernetic/telemetry/batched_collector.ex` - GenServer-based batched collector with ETS buffering
- Attaches to 20+ telemetry events (lines 181-217)
- Batches events in memory with configurable flush interval (5s default)
- Provides a solid reference implementation for the ephemeral trace collector

**OpenTelemetry Integration:**
- `lib/cybernetic/telemetry/otel.ex` - Comprehensive OTEL helpers
- `lib/cybernetic/core/transport/amqp/tracing.ex` - AMQP tracing with span creation
- Already implements trace context injection/extraction for AMQP headers
- Uses W3C Trace Context and B3 propagation formats

### Entry Points from Static Analysis

From `archeology-results.json`:
- **11 Entry Points**:
  - 1 AMQP consumer (`Cybernetic.Core.Transport.AMQP.Consumer.handle_info/2`)
  - 2 CLI tasks (`cyb.probe`, `cyb.archeology`)
  - 1 Telegram agent (`Cybernetic.VSM.System1.Agents.TelegramAgent`)
  - 7 MCP endpoints (via Hermes MCP server)

### VSM Message Handlers (Critical Gaps)

**System Message Handlers** - Dynamic dispatch points not captured by static analysis:
- `lib/cybernetic/vsm/system1/message_handler.ex` - System 1 operational handler (lines 11-47)
- `lib/cybernetic/vsm/system2/message_handler.ex` - System 2 coordination handler (lines 8-41)
- `lib/cybernetic/vsm/system3/message_handler.ex` - System 3 control handler
- `lib/cybernetic/vsm/system4/message_handler.ex` - System 4 intelligence handler
- `lib/cybernetic/vsm/system5/message_handler.ex` - System 5 policy handler

These handlers use pattern matching on the `operation` parameter to dynamically route to different handler functions - a pattern static analysis cannot follow.

### Internal Service Bridges

**Integration Bridges** - Cross-system communication points:
- `lib/cybernetic/integrations/oh_my_opencode/vsm_bridge.ex` - VSM state bridge for oh-my-opencode integration
  - `push_state/2` - Push VSM state to remote (line 82)
  - `pull_state/2` - Pull remote state (line 89)
  - Bidirectional state synchronization via CRDT

### HTTP Entry Points

**Phoenix Router** (`lib/cybernetic/edge/gateway/router.ex`):
- `POST /v1/generate` → `GenerateController.create/2` - LLM generation endpoint
- `GET /v1/events` → `EventsController.stream/2` - SSE events endpoint
- `POST /telegram/webhook` → `TelegramController.webhook/2` - Telegram bot
- `GET /metrics` → `MetricsController.index/2` - Prometheus metrics
- `GET /health*` → `HealthController` - Health check endpoints

### Test Patterns for Synthetic Traffic

**Integration Test Structure** (`test/integration/`):
- `vsm_messaging_test.exs` - Direct MessageHandler calls (lines 27-73)
- `otel_trace_propagation_test.exs` - Trace context propagation (lines 34-95)
- Test pattern: Call handler directly with operation type and payload
- Example: `S1Handler.handle_message("operation", message, %{})`

**Probe Task** (`lib/mix/tasks/cyb.probe.ex`):
- Generates synthetic AMQP traffic for testing (lines 102-168)
- Creates test message with nonce/timestamp
- Publishes to test exchange, consumes, validates roundtrip
- Good reference for traffic generation pattern

### Static Analysis Output Format

From `archeology-results.json`:
```json
{
  "summary": {
    "entry_point_count": 11,
    "trace_count": 11,
    "shared_module_count": 0,
    "orphan_function_count": 725
  },
  "entry_points": [...],
  "traces": [
    {
      "entry_point_id": "amqp_0",
      "functions": [
        {
          "module": "Elixir.Cybernetic.Core.Transport.AMQP.Consumer",
          "function": "handle_info",
          "arity": 2,
          "file": "...",
          "line": 120,
          "type": "public"
        }
      ],
      "depth": 3,
      "metadata": {...}
    }
  ]
}
```

## Technical Considerations

### Dependencies

**Existing Dependencies** (from `mix.exs`):
- `:telemetry` - Core telemetry library (already in deps)
- `:opentelemetry` and `:opentelemetry_api` - For trace context management
- `:telemetry_metrics` - For metrics definitions
- `:jason` - For JSON encoding
- No new dependencies required!

**Internal Modules to Integrate With:**
- `Cybernetic.Telemetry.OTEL` - Trace context helpers (inject/extract)
- `Cybernetic.Core.Transport.AMQP.Tracing` - AMQP span instrumentation
- `Cybernetic.Archeology.Catalog` - Function metadata (for matching traces to catalog)
- Existing telemetry events from Phoenix, Ecto, Oban

### Patterns to Follow

**1. Ephemeral GenServer + ETS Pattern** (from `Cybernetic.Telemetry.BatchedCollector`):
```elixir
defmodule Cybernetic.Archeology.DynamicCollector do
  use GenServer

  defstruct [:trace_table, :active_traces, :max_traces]

  def init(opts) do
    # Create ETS table for in-memory buffering
    trace_table = :ets.new(:dynamic_traces, [:named_table, :public, :bag])

    # Attach to telemetry events
    attach_handlers()

    {:ok, %__MODULE__{
      trace_table: trace_table,
      active_traces: %{},
      max_traces: Keyword.get(opts, :max_traces, 1000)
    }}
  end
end
```

**2. Telemetry Span Pattern** (from existing VSM handlers):
```elixir
def handle_message(operation, payload, meta) do
  # Wrap handler in telemetry span
  :telemetry.span(
    [:cybernetic, :archeology, :vsm_handler],
    %{system: :s1, operation: operation},
    fn ->
      # Existing handler logic
      result = do_handle_message(operation, payload, meta)

      # Return measurements and metadata
      {result, %{payload_size: byte_size(inspect(payload))}}
    end
  )
end
```

**3. Trace ID Correlation** (from `Cybernetic.Core.Transport.AMQP.Tracing`):
- Extract trace_id from AMQP headers using `Cybernetic.Telemetry.OTEL.extract_context/1`
- Inject trace_id into AMQP headers using `Cybernetic.Telemetry.OTEL.inject_context/1`
- Group spans by trace_id in the collector

**4. Mix Task Pattern** (from `Mix.Tasks.Cyb.Archeology`):
- Use `Mix.Task` behavior
- Support `--format` and `--output` options
- Write to JSON file matching static analysis format
- Provide verbose logging mode

### Data Structures

**Span Structure** (compatible with static analysis):
```elixir
%{
  trace_id: "trace_id_from_context_or_generated",
  span_id: "unique_span_id",
  parent_span_id: "parent_span_id_or_nil",
  module: "Elixir.Cybernetic.VSM.System1.MessageHandler",
  function: "handle_message",
  arity: 3,
  file: "lib/cybernetic/vsm/system1/message_handler.ex",
  line: 11,
  timestamp: System.system_time(:microsecond),
  duration_us: 1234,
  metadata: %{
    operation: "operation",
    system: :s1,
    entry_point_type: :amqp
  }
}
```

**Trace Grouping** (output format):
```json
{
  "traces": [
    {
      "trace_id": "abc123...",
      "entry_point": {
        "type": "amqp",
        "module": "...",
        "function": "handle_info",
        "arity": 2
      },
      "spans": [
        {
          "trace_id": "abc123...",
          "span_id": "span1",
          "parent_span_id": null,
          "module": "...",
          "function": "...",
          "timestamp": 1234567890,
          "duration_us": 1000,
          "metadata": {}
        }
      ],
      "span_count": 15
    }
  ],
  "summary": {
    "trace_count": 5,
    "total_spans": 75,
    "entry_points_covered": ["amqp", "http", "cli"]
  }
}
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Telemetry overhead** - Spans may slow down production system | High | - Use `:telemetry.span/3` which has minimal overhead<br>- Add feature flag to disable dynamic tracing in production<br>- Limit trace collection to sampling (e.g., 1% of requests) |
| **Trace ID propagation breaks** - AMQP headers may not contain trace context | Medium | - Generate fallback trace IDs if context extraction fails<br>- Validate trace context before starting span<br>- Log warnings for missing trace context |
| **Infinite loops in span collection** - Spans may trigger more spans | Medium | - Use `:telemetry.detach/1` to prevent recursive attachment<br>- Add depth limiting in collector (max 50 spans per trace)<br>- Filter out self-events |
| **Memory exhaustion** - ETS table grows unbounded | High | - Set hard limit on trace count (e.g., 1000 traces)<br>- Implement LRU eviction when limit reached<br>- Auto-flush to disk when threshold exceeded |
| **Format incompatibility** - Dynamic traces don't match static analysis format | Low | - Use `Cybernetic.Archeology.Catalog` for metadata lookup<br>- Ensure field names match exactly (`module`, `function`, `arity`, `file`, `line`)<br>- Validate output format against static analysis schema |
| **Synthetic traffic doesn't trigger real code paths** | Medium | - Use integration test patterns that call real handlers<br>- Test with both HTTP requests and AMQP messages<br>- Cover all operation types in VSM message handlers |

## Recommended Approach

### Phase 1: Foundation (Core Infrastructure)
1. **Create DynamicCollector module** (`lib/cybernetic/archeology/dynamic_collector.ex`)
   - Implement GenServer with ETS table for span buffering
   - Add `start_trace/0`, `stop_trace/0`, `get_traces/0` APIs
   - Implement trace grouping by trace_id
   - Add memory limits and LRU eviction

2. **Add telemetry span wrappers** to critical gaps
   - VSM message handlers (S1-S5): Wrap `handle_message/3` with `:telemetry.span/3`
   - Internal bridges: Wrap `push_state/2`, `pull_state/2` in VSMBridge
   - Add span metadata: operation type, system, payload size

3. **Implement trace ID correlation**
   - Extract trace_id from OpenTelemetry context using `Cybernetic.Telemetry.OTEL.current_ids/0`
   - Generate fallback trace IDs using UUID/nanoid if no OTEL context
   - Propagate trace_id through AMQP headers (already implemented)

### Phase 2: Event Attachment
4. **Attach to existing telemetry events**
   - Phoenix endpoint events: `[:cybernetic, :edge, :endpoint, :stop]`
   - AMQP events: `[:cyb, :amqp, :publish]`, `[:cyb, :amqp, :consume]`
   - Ecto events: `[:my_app, :repo, :query]` (if database queries are relevant)
   - Oban events: `[:oban, :job, :stop]` (for background jobs)

5. **Create span handlers**
   - `handle_phoenix_request/4` - Capture HTTP endpoint calls
   - `handle_amqp_publish/4` - Capture AMQP publishes
   - `handle_amqp_consume/4` - Capture AMQP consumes
   - Extract metadata: module, function, file, line from stacktrace

### Phase 3: Mix Task and Testing
6. **Implement Mix.Tasks.Cyb.Trace** (`lib/mix/tasks/cyb.trace.ex`)
   - Add task aliases: `mix cyb.trace`, `mix cyb.trace --format=json`
   - Start collector, wait for traces, stop collector, output JSON
   - Support `--duration` flag (how long to collect traces)
   - Support `--output` flag (write to file)

7. **Generate synthetic traffic**
   - Create test module `lib/mix/tasks/cyb/traffic_generator.ex`
   - Pattern from `test/integration/vsm_messaging_test.exs`
   - Generate HTTP requests to `/v1/generate`
   - Generate AMQP messages for each VSM system
   - Trigger all operation types in message handlers

8. **Validate output format**
   - Ensure JSON matches `archeology-results.json` structure
   - Validate that `module`, `function`, `arity` fields match catalog
   - Test comparison between static and dynamic traces

### Phase 4: Integration and Validation
9. **Add to Application supervisor** (if needed)
   - Optional: Add DynamicCollector to children in `lib/cybernetic/application.ex`
   - Better: Start on-demand from mix task to avoid production overhead

10. **Document and test**
    - Add `@moduledoc` examples to all modules
    - Write integration tests for trace collection
    - Validate trace ID correlation across HTTP → AMQP → AMQP flows

## Open Questions

1. **Sampling Strategy**: What percentage of requests should we trace? 1%? 10%? All requests in test mode?
   - Recommendation: 100% in test/dev, 1% in production (configurable via `config :cybernetic, :trace_sampling_rate`)

2. **Trace ID Generation**: Should we rely solely on OpenTelemetry trace IDs, or generate our own?
   - Recommendation: Use OTEL trace IDs when available, fallback to nanoid/UUID

3. **Span Depth Limit**: Should we limit span depth to prevent infinite loops?
   - Recommendation: Yes, max 50 spans per trace (matches static analysis `ARCHAEOLOGY_MAX_DEPTH`)

4. **Background Job Tracing**: Should we trace Oban job executions?
   - Recommendation: Yes, attach to `[:oban, :job, :stop]` event to capture background work

5. **Database Query Tracing**: Should we trace Ecto queries?
   - Recommendation: No, too much noise. Focus on application-level tracing, not ORM internals

6. **Production Overhead**: Should DynamicCollector run in production?
   - Recommendation: No, keep it dev/test only. Use sampling if production tracing is needed

7. **Trace Persistence**: Should traces be persisted to disk or kept in-memory only?
   - Recommendation: In-memory only (ephemeral), flush to JSON file on demand via mix task

8. **Exit Strategy**: How to handle process exits during trace collection?
   - Recommendation: Use `Process.monitor/2` for traced processes, close trace on `:DOWN` message

## Key Files

**Existing Telemetry Infrastructure:**
- `lib/cybernetic/telemetry/otel.ex:1-211` - OpenTelemetry helpers (trace_id extraction, context propagation)
- `lib/cybernetic/telemetry/batched_collector.ex:1-398` - GenServer + ETS pattern reference
- `lib/cybernetic/telemetry/metrics.ex:1-261` - Telemetry event definitions

**Entry Points:**
- `lib/cybernetic/edge/gateway/router.ex:1-75` - HTTP routes (POST /v1/generate, GET /v1/events, etc.)
- `lib/cybernetic/edge/gateway/endpoint.ex:1-51` - Phoenix endpoint with Plug.Telemetry (line 30)
- `lib/cybernetic/core/transport/amqp/consumer.ex:120+` - AMQP consumer entry point

**VSM Message Handlers (Critical for span wrapping):**
- `lib/cybernetic/vsm/system1/message_handler.ex:11-47` - S1 handler with operation dispatch
- `lib/cybernetic/vsm/system2/message_handler.ex:8-41` - S2 coordination handler
- `lib/cybernetic/vsm/system4/message_handler.ex` - S4 intelligence handler
- `lib/cybernetic/vsm/system5/message_handler.ex` - S5 policy handler

**Internal Bridges:**
- `lib/cybernetic/integrations/oh_my_opencode/vsm_bridge.ex:82-98` - push_state/pull_state APIs

**Test Patterns (for synthetic traffic):**
- `test/integration/vsm_messaging_test.exs:27-73` - Direct handler invocation pattern
- `test/integration/otel_trace_propagation_test.exs:34-95` - Trace context validation
- `lib/mix/tasks/cyb.probe.ex:102-168` - AMQP traffic generation

**Static Analysis (for format compatibility):**
- `lib/cybernetic/archeology/tracer.ex:1-116` - Static trace generation (compare structure)
- `lib/cybernetic/archeology/catalog.ex` - Function metadata catalog
- `lib/mix/tasks/cyb.archeology.ex:1-180` - Mix task pattern reference

**AMQP Tracing (for trace ID propagation):**
- `lib/cybernetic/core/transport/amqp/tracing.ex:18-63` - traced_publish with context injection
- `lib/cybernetic/core/transport/amqp/tracing.ex:68-98` - traced_consume with context extraction

## Implementation Checklist

- [ ] Create `Cybernetic.Archeology.DynamicCollector` module (GenServer + ETS)
- [ ] Implement `:telemetry.span/3` wrappers for VSM message handlers
- [ ] Implement `:telemetry.span/3` wrappers for internal bridges (VSMBridge)
- [ ] Attach to Phoenix endpoint telemetry events
- [ ] Attach to AMQP publish/consume telemetry events
- [ ] Attach to Ecto/Oban telemetry events (optional)
- [ ] Implement trace ID correlation using OTEL context
- [ ] Add span handlers with metadata extraction
- [ ] Implement memory limits and LRU eviction in collector
- [ ] Create `Mix.Tasks.Cyb.Trace` task with flags
- [ ] Create synthetic traffic generator module
- [ ] Validate output JSON format matches static analysis
- [ ] Test trace correlation across HTTP → AMQP → AMQP flows
- [ ] Write integration tests for trace collection
- [ ] Document usage in @moduledoc

## Success Metrics

**Functional Requirements:**
- ✅ Captures execution flow from HTTP/AMQP entry points
- ✅ Correlates disjoint events via trace_id
- ✅ Outputs JSON compatible with static analysis format
- ✅ Identifies dependencies invisible to static analysis

**Non-Functional Requirements:**
- ✅ Minimal overhead (<5% performance impact with tracing disabled)
- ✅ Memory bounded (max 1000 traces in ETS table)
- ✅ No production impact (opt-in via mix task)
- ✅ Compatible with existing telemetry infrastructure
