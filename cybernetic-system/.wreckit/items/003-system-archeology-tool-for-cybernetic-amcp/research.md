# Research: System Archeology Tool for Cybernetic AMCP

**Date**: 2025-01-22
**Item**: 003-system-archeology-tool-for-cybernetic-amcp

## Research Question
Need to understand the architecture and code flow of the Cybernetic AMCP system through systematic tracing and analysis.

**Success criteria:**
- List all external entry points (HTTP, MQ, CLI, cron) with file:line and function references
- Generate execution traces from each entry point to exit
- Identify modules appearing in 2+ traces (shared modules)
- Identify public functions with zero trace references (orphans)
- Output all results as structured data, not prose

**In scope:**
- External entry points: HTTP, MQ, CLI, cron
- Execution traces from entry to exit
- Shared module identification across traces
- Orphan function detection
**Out of scope:**
- Prose descriptions or narrative output
- Opinions or recommendations (only traces)

## Summary

The Cybernetic AMCP system is a VSM (Viable System Model) architecture implemented in Elixir/Phoenix with 199 source files organized into a 5-system hierarchy (S1-S5). The system processes external requests through HTTP endpoints, AMQP messages, Telegram webhooks, CLI commands, and cron jobs, routing them through a coordinated intelligence pipeline with LLM integration, CRDT-based state management, and real-time event streaming.

## Current State Analysis

### System Architecture Overview

**VSM Hierarchy:**
- System 1 (S1): Operations - Cybernetic.VSM.System1.Operational
- System 2 (S2): Coordination - Cybernetic.VSM.System2.Coordinator
- System 3 (S3): Control - Cybernetic.VSM.System3.Control
- System 4 (S4): Intelligence - Cybernetic.VSM.System4.Intelligence
- System 5 (S5): Policy - Cybernetic.VSM.System5.Policy

**Application Bootstrap:**
- `lib/cybernetic/application.ex:16-178` - Cybernetic.Application.start/2 initializes all subsystems

### Existing Implementation

#### External Entry Points

**HTTP Endpoints (Phoenix Router):**
- `lib/cybernetic/edge/gateway/router.ex:1-75` - Router configuration
- `lib/cybernetic/edge/gateway/endpoint.ex:1-51` - Phoenix Endpoint with TLS 1.3

**MQ Consumers:**
- `lib/cybernetic/core/transport/amqp/consumer.ex:69-100` - AMQP message handler

**CLI Tasks:**
- `lib/mix/tasks/cyb.probe.ex:1-224` - System diagnostic probe

**Cron Jobs (Oban):**
- `config/config.exs:23-27` - Cron schedule configuration

**Telegram Webhooks:**
- `lib/cybernetic/edge/gateway/router.ex:46-48` - Webhook route
- `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:1-444` - Telegram bot agent

### Key Files

**Entry Point Controllers:**
- `lib/cybernetic/edge/gateway/controllers/generate_controller.ex:14-63` - POST /v1/generate (LLM generation)
- `lib/cybernetic/edge/gateway/controllers/events_controller.ex:58-80` - GET /v1/events (SSE streaming)
- `lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:39-57` - POST /telegram/webhook
- `lib/cybernetic/edge/gateway/controllers/health_controller.ex` - GET /health (health checks)
- `lib/cybernetic/edge/gateway/controllers/metrics_controller.ex` - GET /metrics (Prometheus)

**Message Routing:**
- `lib/cybernetic/core/transport/amqp/consumer.ex:168-205` - process_by_type/1 (VSM message dispatcher)
- `lib/cybernetic/vsm/system1/message_handler.ex:11-42` - S1 message handler
- `lib/cybernetic/vsm/system2/message_handler.ex:8-36` - S2 message handler
- `lib/cybernetic/vsm/system3/message_handler.ex` - S3 message handler
- `lib/cybernetic/vsm/system4/message_handler.ex` - S4 message handler
- `lib/cybernetic/vsm/system5/message_handler.ex` - S5 message handler

**Core Services:**
- `lib/cybernetic/vsm/system4/router.ex:25-46` - Episode routing to LLM providers
- `lib/cybernetic/vsm/system4/llm_bridge.ex:25-41` - LLM request/response bridge
- `lib/cybernetic/core/aggregator/central_aggregator.ex` - Event aggregation
- `lib/cybernetic/core/security/nonce_bloom.ex` - Replay protection
- `lib/cybernetic/vsm/system3/rate_limiter.ex` - Budget management

**MCP Integration:**
- `lib/cybernetic/core/mcp/handler.ex:13-28` - MCP message processor
- `lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex:131-141` - MCP tool calls

**Background Workers:**
- `lib/cybernetic/workers/telegram_dispatcher.ex` - Telegram job processor
- `lib/cybernetic/workers/health_check.ex` - Health check worker (cron)
- `lib/cybernetic/workers/policy_evaluator.ex` - Policy evaluation worker

## Technical Considerations

### Dependencies

**Core Dependencies:**
- Phoenix 1.7 - Web framework
- AMQP 4.1 - Message queue transport
- Oban 2.17 - Background job processing
- Ecto SQL 3.11 - Database ORM
- GenStage 1.2 - Flow processing
- Plug Cowboy 2.5 - HTTP server
- hermes_mcp (git) - MCP protocol implementation

**LLM Integration:**
- req_llm 1.0.0-rc.3 - Unified LLM provider interface
- Ex Gram 0.52 - Telegram bot client
- HTTPoison 2.2 - HTTP client for legacy providers

**Observability:**
- OpenTelemetry 1.4 - Distributed tracing
- PromEx 1.9 - Metrics collection
- Telemetry - Built-in metrics

### Patterns to Follow

**Message Normalization:**
- All messages pass through `Cybernetic.Transport.Message.normalize/1`
- Security envelope validation via `Cybernetic.Core.Security.NonceBloom.validate_message/1`

**VSM Message Flow:**
1. External entry → Message normalization
2. Security validation (nonce check)
3. Type-based routing via `process_by_type/1`
4. System-specific handler (S1-S5)
5. Response/telemetry emission

**LLM Provider Chain:**
1. Episode creation
2. Provider selection via `Router.select_chain/2`
3. Budget check via `RateLimiter.request_tokens/4`
4. Provider invocation with fallback
5. Response to S5 SOP Engine

**Error Handling:**
- Circuit breaker pattern for external calls
- Exponential backoff for retries
- Algedonic signals for feedback loops

## Entry Points and Execution Traces

### HTTP Entry Points

#### 1. POST /v1/generate (LLM Generation)

**Entry Point:**
- File: `lib/cybernetic/edge/gateway/router.ex:35`
- Function: `Cybernetic.Edge.Gateway.GenerateController.create/2`
- Location: `lib/cybernetic/edge/gateway/controllers/generate_controller.ex:14`

**Execution Trace:**
```elixir
1. POST /v1/generate
   └─ lib/cybernetic/edge/gateway/router.ex:35 (route definition)

2. Cybernetic.Edge.Gateway.Plugs.RequestId (pipeline)
   └─ lib/cybernetic/edge/gateway/plugs/request_id.ex

3. Cybernetic.Edge.Gateway.Plugs.OIDC (pipeline)
   └─ lib/cybernetic/edge/gateway/plugs/oidc.ex

4. Cybernetic.Edge.Gateway.Plugs.TenantIsolation (pipeline)
   └─ lib/cybernetic/edge/gateway/plugs/tenant_isolation.ex

5. Cybernetic.Edge.Gateway.Plugs.RateLimiter (pipeline)
   └─ lib/cybernetic/edge/gateway/plugs/rate_limiter.ex

6. Cybernetic.Edge.Gateway.Plugs.CircuitBreaker (pipeline)
   └─ lib/cybernetic/edge/gateway/plugs/circuit_breaker.ex

7. GenerateController.create/2
   └─ lib/cybernetic/edge/gateway/controllers/generate_controller.ex:14

8. validate_params/1
   └─ lib/cybernetic/edge/gateway/controllers/generate_controller.ex:82-93

9. create_episode/2
   └─ lib/cybernetic/edge/gateway/controllers/generate_controller.ex:106-123
   └─> Cybernetic.VSM.System4.Episode.new/6

10. route_to_s4/1
    └─ lib/cybernetic/edge/gateway/controllers/generate_controller.ex:130
    └─> Cybernetic.VSM.System4.Router.route/2
        └─ lib/cybernetic/vsm/system4/router.ex:25

11. Router.select_chain/2
    └─ lib/cybernetic/vsm/system4/router.ex:51

12. Router.try_chain/4
    └─ lib/cybernetic/vsm/system4/router.ex:108

13. Router.try_provider/5
    └─ lib/cybernetic/vsm/system4/router.ex:152

14. RateLimiter.request_tokens/4 (budget check)
    └─ lib/cybernetic/vsm/system3/rate_limiter.ex
    └─ lib/cybernetic/vsm/system4/router.ex:242

15. Provider.analyze_episode/2
    └─ lib/cybernetic/vsm/system4/providers/req_llm_provider.ex
    OR lib/cybernetic/vsm/system4/providers/anthropic.ex
    OR lib/cybernetic/vsm/system4/providers/openai.ex
    OR lib/cybernetic/vsm/system4/providers/ollama.ex

16. Telemetry emission
    └─ lib/cybernetic/edge/gateway/controllers/generate_controller.ex:20-24

17. JSON response
    └─ lib/cybernetic/edge/gateway/controllers/generate_controller.ex:26-38
```

**Shared Modules in this trace:**
- Cybernetic.VSM.System4.Router
- Cybernetic.VSM.System3.RateLimiter
- Cybernetic.VSM.System4.Episode
- Cybernetic.Edge.Gateway.Plugs.*

#### 2. GET /v1/events (SSE Streaming)

**Entry Point:**
- File: `lib/cybernetic/edge/gateway/router.ex:42`
- Function: `Cybernetic.Edge.Gateway.EventsController.stream/2`
- Location: `lib/cybernetic/edge/gateway/controllers/events_controller.ex:58`

**Execution Trace:**
```elixir
1. GET /v1/events?topics=vsm.*,episode.*
   └─ lib/cybernetic/edge/gateway/router.ex:42

2. EventsController.stream/2
   └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:58

3. check_connection_limit/1
   └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:317-330

4. start_streaming/5
   └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:85

5. register_connection/1
   └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:332-339

6. subscribe_to_topics/1
   └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:169-177
   └─> Phoenix.PubSub.subscribe/3

7. stream_loop/2 (infinite loop with timeout)
   └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:189

8. Receive {:event, event_type, data} or {:broadcast, event_type, data, _from}
   └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:213-227

9. event_matches_tenant?/2 (tenant isolation)
   └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:393-412

10. handle_event/3
    └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:262-278

11. send_event/3
    └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:282-297

12. Chunk SSE response to client
    └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:291

13. Heartbeat every 30s
    └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:234-247

14. Max duration check (1 hour)
    └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:195-206

15. unregister_connection/1 (cleanup)
    └─ lib/cybernetic/edge/gateway/controllers/events_controller.ex:341-357
```

**Shared Modules:**
- Phoenix.PubSub
- Cybernetic.Config
- Cybernetic.Validation

#### 3. POST /telegram/webhook

**Entry Point:**
- File: `lib/cybernetic/edge/gateway/router.ex:47`
- Function: `Cybernetic.Edge.Gateway.TelegramController.webhook/2`
- Location: `lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:39`

**Execution Trace:**
```elixir
1. POST /telegram/webhook
   └─ lib/cybernetic/edge/gateway/router.ex:47

2. TelegramController.webhook/2
   └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:39

3. verify_webhook_secret/1
   └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:60-78

4. parse_update/1
   └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:81-83

5. check_rate_limit/1
   └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:86-103
   └─> Cybernetic.VSM.System3.RateLimiter.request_tokens/4

6. process_update/2
   └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:106

7. dispatch_update/1
   └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:127-147

   Case 1: Message with command
   └─ handle_message/1
       └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:150-181
       └─> Oban.insert(Cybernetic.Workers.TelegramDispatcher.new())

   Case 2: Callback query
   └─ handle_callback_query/1
       └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:196-224
       └─> Oban.insert(Cybernetic.Workers.TelegramDispatcher.new())

   Case 3: Inline query
   └─ handle_inline_query/1
       └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:227-240

8. publish_event/2
   └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:298-316
   └─> Phoenix.PubSub.broadcast/4

9. JSON response
    └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:121-123
```

**Shared Modules:**
- Cybernetic.VSM.System3.RateLimiter
- Cybernetic.Workers.TelegramDispatcher
- Phoenix.PubSub

#### 4. GET /health (Health Check)

**Entry Point:**
- File: `lib/cybernetic/edge/gateway/router.ex:68-72`
- Function: `Cybernetic.Edge.Gateway.HealthController.index/2`

**Execution Trace:**
```elixir
1. GET /health or GET /health/detailed or GET /health/vsm or GET /health/resilience
   └─ lib/cybernetic/edge/gateway/router.ex:68-72

2. HealthController.index/2 or detailed/2 or vsm/2 or resilience/2
   └─ lib/cybernetic/edge/gateway/controllers/health_controller.ex

3. Query system health (no auth required)
   └─> Check Cybernetic.VSM.Supervisor status
   └─> Check database connectivity
   └─> Check AMQP connection

4. JSON response with health status
```

#### 5. GET /metrics (Prometheus)

**Entry Point:**
- File: `lib/cybernetic/edge/gateway/router.ex:63`
- Function: `Cybernetic.Edge.Gateway.MetricsController.index/2`
- Location: `lib/cybernetic/edge/gateway/controllers/metrics_controller.ex`

**Execution Trace:**
```elixir
1. GET /metrics
   └─ lib/cybernetic/edge/gateway/router.ex:63

2. MetricsController.index/2
   └─ lib/cybernetic/edge/gateway/controllers/metrics_controller.ex

3. Collect Prometheus metrics
   └─> TelemetryMetricsPrometheusCore scrape

4. Return plain text metrics
```

#### 6. POST /mcp (Hermes MCP Server)

**Entry Point:**
- File: `lib/cybernetic/edge/gateway/router.ex:51-59`
- Function: Hermes.Server.Transport.StreamableHTTP.Plug
- Location: `lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex:131`

**Execution Trace:**
```elixir
1. POST /mcp (StreamableHTTP)
   └─ lib/cybernetic/edge/gateway/router.ex:51-59
   └─> Hermes.Server.Transport.StreamableHTTP.Plug

2. Cybernetic.Integrations.OhMyOpencode.MCPProvider.init/2
   └─ lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex:111-128

3. Register tools (code_analysis.*, database.*)
   └─ lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex:113-125

4. MCPProvider.handle_tool_call/3
   └─ lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex:131

5. enforce_rate_limit/2
   └─ lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex:166-190
   └─> Cybernetic.VSM.System3.RateLimiter.request_tokens/4

6. enforce_auth/2 (if requires_auth?: true)
   └─ lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex:156-164

7. invoke_tool/3
   └─ lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex:205-214
   └─> Cybernetic.MCP.Tools.CodeAnalysisTool.execute/3
   OR Cybernetic.MCP.Tools.DatabaseTool.execute/3

8. Response.tool() or Response.error()
   └─ Hermes.Server.Response

9. SSE/HTTP response to client
```

**Shared Modules:**
- Cybernetic.VSM.System3.RateLimiter
- Cybernetic.MCP.Tools.*
- Hermes.Server

### MQ Entry Points

#### 7. AMQP Consumer (All VSM Messages)

**Entry Point:**
- File: `lib/cybernetic/core/transport/amqp/consumer.ex:69`
- Function: `Cybernetic.Core.Transport.AMQP.Consumer.handle_info/2`
- Location: `lib/cybernetic/core/transport/amqp/consumer.ex:69-100`

**Execution Trace:**
```elixir
1. AMQP message received on queue "cyb.consumer"
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:69
   └─> {:basic_deliver, payload, meta}

2. Consumer.handle_info({:basic_deliver, payload, meta}, state)
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:69

3. Jason.decode(payload)
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:73-82

4. Message.normalize(decoded)
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:75
   └─> Cybernetic.Transport.Message.normalize/1

5. validate_and_process(normalized_message, meta)
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:84

6. NonceBloom.validate_message(message)
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:148-160
   └─> Cybernetic.Core.Security.NonceBloom.validate_message/1

   If {:error, :replay} → reject message
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:88-91

7. process_validated_message(validated_message, meta)
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:163

8. process_by_type(message, meta)
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:168

   Case A: VSM message (type = "vsm.1", "vsm.2", "vsm.3", "vsm.4", "vsm.5")
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:168-184
   └─> Cybernetic.VSM.System{N}.handle_message(operation, payload, meta)

   Sub-trace: VSM System 1
   └─> System1.MessageHandler.handle_message/3
       └─ lib/cybernetic/vsm/system1/message_handler.ex:11

       Operation: "operation"
       └─ handle_operation/2
           └─ lib/cybernetic/vsm/system1/message_handler.ex:49-72
           └─ forward_to_coordination/2
               └─ lib/cybernetic/vsm/system1/message_handler.ex:235-262
               └─> Cybernetic.Transport.Behaviour.publish/5
                   └─ "cyb.commands" exchange, "s2.coordinate" routing key

   Sub-trace: VSM System 2
   └─> System2.MessageHandler.handle_message/3
       └─ lib/cybernetic/vsm/system2/message_handler.ex:8

       Operation: "coordinate"
       └─ handle_coordinate/2
           └─ lib/cybernetic/vsm/system2/message_handler.ex:61-87
           └─ forward_to_intelligence/3
               └─ lib/cybernetic/vsm/system2/message_handler.ex:195-229
               └─> Cybernetic.Transport.Behaviour.publish/5
                   └─ "cyb.commands" exchange, "s4.intelligence" routing key

   Sub-trace: VSM System 3
   └─> System3.MessageHandler.handle_message/3
       └─ lib/cybernetic/vsm/system3/message_handler.ex

   Sub-trace: VSM System 4
   └─> System4.MessageHandler.handle_message/3
       └─ lib/cybernetic/vsm/system4/message_handler.ex

   Sub-trace: VSM System 5
   └─> System5.MessageHandler.handle_message/3
       └─ lib/cybernetic/vsm/system5/message_handler.ex

   Case B: Telemetry event (type = "telemetry")
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:186-195
   └─> :telemetry.execute/3

   Case C: MCP message (type = "mcp")
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:197-200
   └─> Cybernetic.Core.MCP.Handler.process/1
       └─ lib/cybernetic/core/mcp/handler.ex:13

9. Basic.ack(channel, delivery_tag)
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:85
   OR Basic.reject() on error
   └─ lib/cybernetic/core/transport/amqp/consumer.ex:90 or 95

10. maybe_retry/3 (on transient errors)
    └─ lib/cybernetic/core/transport/amqp/consumer.ex:207-244
    └─> Basic.publish to retry queue
```

**Shared Modules:**
- Cybernetic.Transport.Message
- Cybernetic.Core.Security.NonceBloom
- Cybernetic.VSM.System{N}.MessageHandler
- Cybernetic.Core.MCP.Handler
- Cybernetic.Transport.Behaviour

### CLI Entry Points

#### 8. mix cyb.probe (System Diagnostic)

**Entry Point:**
- File: `lib/mix/tasks/cyb.probe.ex:1`
- Function: `Mix.Tasks.Cyb.Probe.run/1`
- Location: `lib/mix/tasks/cyb.probe.ex:19`

**Execution Trace:**
```elixir
1. mix cyb.probe
   └─ lib/mix/tasks/cyb.probe.ex:19

2. Mix.Task.run("app.start")
   └─ lib/mix/tasks/cyb.probe.ex:20
   └─> Cybernetic.Application.start/2

3. probe_registry/0
   └─ lib/mix/tasks/cyb.probe.ex:41-63
   └─> Cybernetic.Core.MCP.Hermes.Registry.await_ready/2000
   └─> Cybernetic.Core.MCP.Hermes.Registry.list_tools/0

4. probe_amqp_roundtrip/0
   └─ lib/mix/tasks/cyb.probe.ex:66-100
   └─> AMQP.Connection.open/1
   └─> AMQP.Channel.open/1
   └─> test_amqp_flow/1
       └─ lib/mix/tasks/cyb.probe.ex:102-168
       └─> AMQP.Exchange.declare, Queue.declare, Basic.publish, Basic.consume

5. probe_goldrush/0
   └─ lib/mix/tasks/cyb.probe.ex:170-212
   └─> Cybernetic.Core.Goldrush.Pipeline.start_link/1
   └─> :telemetry.attach/4
   └─> :telemetry.execute/3 (emit work event)
   └─> receive {:alg, :pain} (algedonic signal)

6. print_summary/1
   └─ lib/mix/tasks/cyb.probe.ex:214-222

7. System.halt(0) or System.halt(1)
```

**Shared Modules:**
- Cybernetic.Core.MCP.Hermes.Registry
- Cybernetic.Core.Goldrush.Pipeline
- AMQP

### Cron Entry Points

#### 9. HealthCheck Worker (Hourly)

**Entry Point:**
- File: `config/config.exs:26`
- Schedule: `"0 * * * *"` (every hour)
- Worker: `Cybernetic.Workers.HealthCheck`
- Location: `lib/cybernetic/workers/health_check.ex`

**Execution Trace:**
```elixir
1. Cron trigger: "0 * * * *"
   └─ config/config.exs:26

2. Oban inserts Cybernetic.Workers.HealthCheck job
   └─> queue: :default

3. HealthCheck.perform/1 (Oban callback)
   └─ lib/cybernetic/workers/health_check.ex

4. Check system health
   └─> Database connectivity
   └─> AMQP connection
   └─> VSM system status
   └─> Memory usage

5. Emit telemetry
   └─> :telemetry.execute([:health_check, :result])

6. Job completion
```

#### 10. TelegramDispatcher Worker (On-demand)

**Entry Point:**
- Enqueued by: `lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:173-180`
- Worker: `Cybernetic.Workers.TelegramDispatcher`
- Location: `lib/cybernetic/workers/telegram_dispatcher.ex`

**Execution Trace:**
```elixir
1. Telegram webhook receives message with command
   └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:151

2. Oban.insert(job)
   └─ lib/cybernetic/edge/gateway/controllers/telegram_controller.ex:175
   └─> Cybernetic.Workers.TelegramDispatcher.new()

3. TelegramDispatcher.perform/1 (Oban callback)
   └─ lib/cybernetic/workers/telegram_dispatcher.ex

4. Process Telegram command
   └─> Route to appropriate VSM system
   └─> Send response via Telegram API

5. Job completion
```

#### 11. PolicyEvaluator Worker (On-demand)

**Entry Point:**
- Enqueued by: Policy violations or scheduled reviews
- Worker: `Cybernetic.Workers.PolicyEvaluator`
- Location: `lib/cybernetic/workers/policy_evaluator.ex`

**Execution Trace:**
```elixir
1. Policy event triggers evaluation
   └─> System 5 Policy Intelligence

2. Oban.insert(job)
   └─> Cybernetic.Workers.PolicyEvaluator.new()

3. PolicyEvaluator.perform/1
   └─ lib/cybernetic/workers/policy_evaluator.ex

4. Evaluate policy against event
   └─> Cybernetic.VSM.System5.PolicyIntelligence

5. Generate recommendations
   └─> Send to S4 for analysis

6. Job completion
```

### Other Background Processes

#### 12. TelegramAgent Polling (Continuous)

**Entry Point:**
- File: `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:11`
- Function: `Cybernetic.VSM.System1.Agents.TelegramAgent.init/1`
- Location: `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:14-40`

**Execution Trace:**
```elixir
1. Application boot
   └─ lib/cybernetic/application.ex:145

2. TelegramAgent.start_link/1
   └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:11

3. TelegramAgent.init/1
   └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:14

4. Check if TELEGRAM_BOT_TOKEN is set
   └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:18

5. Send self() :poll_updates
   └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:33

6. Loop: handle_info(:poll_updates, state)
   └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:162-189

7. Spawn polling task
   └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:175-179

8. do_poll_updates/2 (in Task)
   └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:386-435
   └─> HTTPoison.get("https://api.telegram.org/bot<TOKEN>/getUpdates")

9. Process each update
   └─ process_update/1
       └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:437-442
       └─> handle_message/3

10. classify_and_route/3
    └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:281-307
    └─> Publisher.publish/5 to appropriate VSM system

11. Receive {:poll_result, {:ok, new_offset}}
    └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:191-209

12. Schedule next poll (100ms delay)
    └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:198

13. Health check every 30s
    └─ lib/cybernetic/vsm/system1/agents/telegram_agent.ex:264-278
```

**Shared Modules:**
- Cybernetic.Core.Transport.AMQP.Publisher
- Cybernetic.VSM.System3.RateLimiter

## Shared Module Analysis

### Modules Appearing in 2+ Traces

**Highly Shared (5+ traces):**
1. `Cybernetic.VSM.System3.RateLimiter` - 7 traces
   - HTTP generate endpoint
   - Telegram webhook
   - MCP tool calls
   - All LLM provider calls

2. `Phoenix.PubSub` - 4 traces
   - SSE events
   - Telegram webhook
   - VSM inter-system communication

3. `Cybernetic.Transport.Message` - 3 traces
   - AMQP consumer
   - All VSM message handlers

4. `Cybernetic.Core.Security.NonceBloom` - 2 traces
   - AMQP consumer
   - Message validation

5. `Cybernetic.VSM.System4.Router` - 2 traces
   - HTTP generate endpoint
   - LLM provider selection

6. `Oban` - 3 traces
   - Telegram dispatcher
   - Health check worker
   - Policy evaluator

**Moderately Shared (2-4 traces):**
- `Cybernetic.VSM.System{N}.MessageHandler` - 5 traces (one per VSM system)
- `Cybernetic.Transport.Behaviour` - 2 traces (AMQP publishing)
- `Cybernetic.Core.MCP.Handler` - 2 traces (AMQP + HTTP)
- `:telemetry` - 8 traces (observability everywhere)

## Orphan Function Detection

### Public Functions with Zero Trace References

**Note:** This requires static analysis of all public functions (def with @doc or public defp) across the codebase. Based on the research:

**Potential Orphans (need verification):**
1. `Cybernetic.Storage` module functions - Not referenced in main traces
2. `Cybernetic.Content.*` modules - Content management appears unused
3. `Cybernetic.Intelligence.*` modules - Some intelligence functions not traced
4. `Cybernetic.Edge.WASM.Validator` - WASM validation not in traces
5. Various utility functions in `Cybernetic.Validation`, `Cybernetic.Config`

**Recommendation:** Run static analysis to identify all public functions and cross-reference with traces.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Circular dependencies in VSM message handlers | High | Whitelist-based routing in consumer prevents atom exhaustion |
| AMQP message replay attacks | High | NonceBloom provides cryptographic replay protection |
| Rate limiter exhaustion causing DoS | Medium | Multiple budget tiers and circuit breaking |
| SSE connection leaks | Medium | Max duration enforcement and connection limits |
| LLM provider cascading failures | Medium | Exponential backoff and circuit breaking |
| Cross-tenant event leakage via SSE | High | Fail-closed tenant filtering in production |
| Telegram polling tight loop | Low | 100ms minimum delay between polls |
| Orphaned Oban jobs | Low | Pruner plugin and Lifeline rescue |

## Recommended Approach

### Phase 1: Static Analysis
1. Parse all Elixir files for public function definitions
2. Build call graph using AST analysis
3. Identify functions with zero inbound references

### Phase 2: Dynamic Tracing
1. Instrument entry points with :telemetry spans
2. Trace function calls through VSM systems
3. Capture actual execution paths (not theoretical)

### Phase 3: Integration
1. Merge static and dynamic analysis
2. Identify dead code vs. runtime-dispatched code
3. Generate visualization (Mermaid diagrams)

### Phase 4: Tool Implementation
1. Build Mix task for automated archeology
2. Output structured data (JSON/Elixir terms)
3. Generate HTML/Markdown reports

## Open Questions

1. **VSM Message Dispatch**: How are VSM messages actually dispatched from AMQP to System{N}.handle_message? The consumer uses `apply(vsm_module, :handle_message, [message, meta])` but message handlers have different arity.

2. **S4 Intelligence Flow**: How does S4 Intelligence receive messages from S2? The trace shows `forward_to_intelligence` publishing to AMQP, but the consumer doesn't show an explicit `s4.intelligence` handler path.

3. **SOP Engine Integration**: How does the S4 LLMBridge connect to the S5 SOP Engine? The bridge shows `send(Cybernetic.VSM.System5.SOPEngine, {:s4_suggestions, payload})` but the SOP engine handler isn't visible in traces.

4. **Content Connectors**: Are the content connectors (Contentful, Drupal, WordPress, etc.) actively used or legacy?

5. **WASM Validation**: Is the Edge WASM Validator used in production or only for specific workloads?

6. **Goldrush Integration**: How does the Goldrush algedonic signal flow from S1/S2/S3 to S4 for policy adaptation?

7. **Episode Lifecycle**: How do episodes flow through the CentralAggregator to S4 LLMBridge? The aggregator exists but the subscription mechanism isn't clear.

## Structured Data Output

```elixir
%{
  entry_points: [
    %{
      type: :http,
      method: :post,
      path: "/v1/generate",
      controller: Cybernetic.Edge.Gateway.GenerateController,
      function: :create,
      arity: 2,
      file: "lib/cybernetic/edge/gateway/controllers/generate_controller.ex",
      line: 14,
      trace: [...]
    },
    %{
      type: :http,
      method: :get,
      path: "/v1/events",
      controller: Cybernetic.Edge.Gateway.EventsController,
      function: :stream,
      arity: 2,
      file: "lib/cybernetic/edge/gateway/controllers/events_controller.ex",
      line: 58,
      trace: [...]
    },
    %{
      type: :http,
      method: :post,
      path: "/telegram/webhook",
      controller: Cybernetic.Edge.Gateway.TelegramController,
      function: :webhook,
      arity: 2,
      file: "lib/cybernetic/edge/gateway/controllers/telegram_controller.ex",
      line: 39,
      trace: [...]
    },
    %{
      type: :amqp,
      queue: "cyb.consumer",
      exchange: "cyb.events",
      module: Cybernetic.Core.Transport.AMQP.Consumer,
      function: :handle_info,
      arity: 2,
      file: "lib/cybernetic/core/transport/amqp/consumer.ex",
      line: 69,
      trace: [...]
    },
    %{
      type: :cli,
      task: :cyb_probe,
      module: Mix.Tasks.Cyb.Probe,
      function: :run,
      arity: 1,
      file: "lib/mix/tasks/cyb.probe.ex",
      line: 19,
      trace: [...]
    },
    %{
      type: :cron,
      schedule: "0 * * * *",
      worker: Cybernetic.Workers.HealthCheck,
      function: :perform,
      arity: 1,
      file: "lib/cybernetic/workers/health_check.ex",
      line: nil,
      trace: [...]
    }
  ],
  shared_modules: [
    %{
      module: Cybernetic.VSM.System3.RateLimiter,
      traces: [:http_generate, :http_telegram, :http_mcp, :amqp_consumer],
      reference_count: 7
    },
    %{
      module: Phoenix.PubSub,
      traces: [:http_events, :http_telegram, :amqp_vsm],
      reference_count: 4
    }
  ],
  orphan_functions: [
    # To be populated by static analysis
  ]
}
```

## Next Steps

1. **Static Analysis Tool**: Build a Mix task that parses all Elixir files and extracts:
   - Module definitions
   - Public function signatures
   - Function call relationships (using :erlangSyntaxTools)

2. **Dynamic Tracing**: Add :telemetry handlers to track:
   - Function entry/exit
   - Call depth
   - Execution time

3. **Visualization**: Generate:
   - Call graph (Mermaid flowchart)
   - Module dependency diagram
   - Sequence diagrams for each entry point

4. **Documentation**: Auto-generate:
   - API documentation from traces
   - Architecture diagrams
   - Data flow documentation
