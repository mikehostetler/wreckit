# Holistic Implementation Plan: Cybernetic VSM Platform

**Status**: Active Development
**Last Updated**: 2025-12-18
**Source**: spec.md (32 issues consolidated)
**Constitution Check**: Aligned with v1.0.0 (ReqLLM mandatory)

---

## 1. Architecture Overview

```
                           TIER 6: ECOSYSTEM
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  ┌──────────────┐  ┌────────────────┐  ┌──────────────┐                  │
  │  │  SDKs [7ph]  │  │ Rules Catalog  │  │ Frontend/UX  │                  │
  │  │ Elixir/Rust/ │  │ Marketplace    │  │ Search+Chat  │                  │
  │  │ JavaScript   │  │    [5nz]       │  │    [uuk]     │                  │
  │  └──────────────┘  └────────────────┘  └──────────────┘                  │
  └────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                          TIER 5: INTEGRATIONS
  ┌────────────────────────────────▼─────────────────────────────────────────┐
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
  │  │ oh-my-opencode │  │  LLM Routing   │  │   MCP Tools    │              │
  │  │  Deep [q8b]    │  │  Shared [6nl]  │  │   Light [kgq]  │              │
  │  └────────────────┘  └────────────────┘  └────────────────┘              │
  │  ┌────────────────┐  ┌────────────────┐                                  │
  │  │ Live Stream    │  │ Twitter Spaces │                                  │
  │  │ Relay [yh4]    │  │ Bridge [99m]   │                                  │
  │  └────────────────┘  └────────────────┘                                  │
  └────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                            TIER 4: CONTENT
  ┌────────────────────────────────▼─────────────────────────────────────────┐
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
  │  │   Semantic     │  │ CMS Connectors │  │    CBCP        │              │
  │  │ Containers     │  │ WP/Contentful/ │  │ Bucket Control │              │
  │  │    [526]       │  │ Strapi [3et]   │  │   Plane [r0m]  │              │
  │  └────────────────┘  └────────────────┘  └────────────────┘              │
  │  ┌────────────────┐  ┌────────────────┐                                  │
  │  │ Ingest Pipeline│  │ Google Drive   │                                  │
  │  │ Fetch/Index    │  │ Changes API    │                                  │
  │  │    [dv0]       │  │    [3ek]       │                                  │
  │  └────────────────┘  └────────────────┘                                  │
  └────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                         TIER 3: INTELLIGENCE
  ┌────────────────────────────────▼─────────────────────────────────────────┐
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
  │  │ Deterministic  │  │  CEP Workflow  │  │    Zombie      │              │
  │  │  Cache [q0s]   │  │  Hooks [2b6]   │  │ Detection [b3n]│              │
  │  └────────────────┘  └────────────────┘  └────────────────┘              │
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
  │  │   Quantizer    │  │   HNSW ANN     │  │   BeliefSet    │              │
  │  │ PQ/VQ [ejx]    │  │    [qiz]       │  │  CRDT [8yi]    │              │
  │  └────────────────┘  └────────────────┘  └────────────────┘              │
  │  ┌────────────────┐                                                      │
  │  │  Policy WASM   │                                                      │
  │  │ Pipeline [0kc] │                                                      │
  │  └────────────────┘                                                      │
  └────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                         TIER 2: CAPABILITIES
  ┌────────────────────────────────▼─────────────────────────────────────────┐
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
  │  │  Capability    │  │    Planner     │  │   Execution    │              │
  │  │  Layer [92b]   │  │  System [5pv]  │  │ Framework [0n8]│              │
  │  └────────────────┘  └────────────────┘  └────────────────┘              │
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
  │  │  Unified MCP   │  │    S4 Cap      │  │   Goldrush     │              │
  │  │  Router [3jg]  │  │ Integ [ujc]    │  │  LLM-CDN [25u] │              │
  │  └────────────────┘  └────────────────┘  └────────────────┘              │
  └────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                    TIER 1: FOUNDATION (CURRENT FOCUS)
  ┌────────────────────────────────▼─────────────────────────────────────────┐
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
  │  │   Database     │  │    Docker      │  │ Edge Gateway   │              │
  │  │ Ecto/PG [8x5]  │  │  Deploy [1o9]  │  │ SSE/TG [aum]   │              │
  │  │       ✅       │  │       ✅       │  │      🔄        │              │
  │  └────────────────┘  └────────────────┘  └────────────────┘              │
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐              │
  │  │   Storage      │  │    Workers     │  │   Phoenix      │              │
  │  │ Adapter [5jx]  │  │  Oban [fot]    │  │ Gateway [ilf]  │              │
  │  │       ⏳       │  │      🔄        │  │      🔄        │              │
  │  └────────────────┘  └────────────────┘  └────────────────┘              │
  │  ┌────────────────┐                                                      │
  │  │  Type Hints    │                                                      │
  │  │  Specs [wyv]   │                                                      │
  │  │       ⏳       │                                                      │
  │  └────────────────┘                                                      │
  └──────────────────────────────────────────────────────────────────────────┘

EXISTING INFRASTRUCTURE (lib/cybernetic/):
├── transport/        AMQP, backpressure, circuit breaker
├── core/crdt/        Graph, cache, context graph
├── core/goldrush/    CEP engine, plugins
├── core/security/    Nonce, bloom, rate limiter
├── core/mcp/         Server, handler, Hermes
├── core/resilience/  Adaptive circuit breaker
└── core/aggregator/  Central aggregator
```

---

## 2. Technology Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| **Language** | Elixir | 1.16+ | Concurrency, fault tolerance |
| **Framework** | Phoenix | 1.7+ | Real-time, LiveView |
| **Database** | PostgreSQL | 16+ | RLS, JSONB, pgvector |
| **Queue** | Oban | 2.17+ | PostgreSQL-backed, reliable |
| **Message Bus** | RabbitMQ | 3.12+ | AMQP, topic routing |
| **Cache** | Redis | 7+ | Fast, pub/sub, rate limiting |
| **LLM** | ReqLLM | latest | 45+ providers, unified API (MANDATORY) |
| **Vectors** | HNSW (custom) | - | In-process, fast |
| **WASM** | Wasmex | latest | Policy execution |
| **Metrics** | PromEx | latest | Phoenix/Ecto/Oban metrics |
| **Tracing** | OpenTelemetry | - | Distributed tracing |
| **Containers** | Docker Compose | 24+ | Dev + Production |

---

## 3. Directory Structure (Target State)

```
lib/cybernetic/
├── application.ex              # OTP Application
├── repo.ex                     # ✅ Ecto Repo with RLS
├── prom_ex.ex                  # ✅ PromEx metrics
├── release.ex                  # ✅ Release tasks
│
├── schemas/                    # ✅ Ecto Schemas
│   ├── storage/
│   │   ├── tenant.ex           # ✅ Multi-tenant
│   │   └── artifact.ex         # ✅ Storage metadata
│   └── vsm/
│       ├── system_state.ex     # ✅ S1-S5 states
│       ├── episode.ex          # ✅ Intelligence episodes
│       └── policy.ex           # ✅ Policy decisions
│
├── transport/                  # ✅ EXISTING - AMQP layer
├── core/                       # ✅ EXISTING - Core modules
│
├── foundation/                 # Tier 1 - NEW
│   ├── storage/
│   │   ├── behaviour.ex        # Storage adapter behaviour
│   │   ├── local.ex            # Local filesystem
│   │   ├── s3.ex               # S3-compatible
│   │   └── memory.ex           # Testing adapter
│   └── workers/
│       ├── episode_analyzer.ex # Oban worker
│       ├── policy_evaluator.ex # Oban worker
│       └── notification.ex     # Oban worker
│
├── capabilities/               # Tier 2 - NEW
│   ├── registry.ex             # Capability registry [92b]
│   ├── discovery.ex            # Semantic matching [92b]
│   ├── planner/                # [5pv]
│   │   ├── state_machine.ex
│   │   └── collaboration.ex
│   ├── execution/              # [0n8]
│   │   ├── context.ex
│   │   └── handoff.ex
│   ├── mcp_router.ex           # [3jg]
│   ├── s4_integration.ex       # [ujc]
│   └── llm_cdn.ex              # [25u] Goldrush LLM-CDN
│
├── intelligence/               # Tier 3 - NEW
│   ├── cache/
│   │   └── deterministic.ex    # [q0s]
│   ├── cep/
│   │   └── workflow_hooks.ex   # [2b6]
│   ├── health/
│   │   └── zombie_detector.ex  # [b3n]
│   ├── vectors/
│   │   ├── quantizer.ex        # [ejx]
│   │   └── hnsw.ex             # [qiz]
│   ├── beliefs/
│   │   └── beliefset.ex        # [8yi]
│   └── policy/
│       └── wasm_pipeline.ex    # [0kc]
│
├── content/                    # Tier 4 - NEW
│   ├── semantic_container.ex   # [526]
│   ├── connectors/             # [3et]
│   │   ├── behaviour.ex
│   │   ├── wordpress.ex
│   │   ├── contentful.ex
│   │   ├── strapi.ex
│   │   └── google_drive.ex     # [3ek]
│   ├── cbcp/
│   │   └── bucket_control.ex   # [r0m]
│   └── ingest/                 # [dv0]
│       ├── fetcher.ex
│       ├── normalizer.ex
│       └── indexer.ex
│
├── integrations/               # Tier 5 - NEW
│   ├── oh_my_opencode/         # [q8b, 6nl, kgq]
│   │   ├── bridge.ex
│   │   ├── llm_proxy.ex
│   │   └── mcp_provider.ex
│   ├── streaming/
│   │   └── live_relay.ex       # [yh4]
│   └── social/
│       └── twitter_spaces.ex   # [99m]
│
├── ecosystem/                  # Tier 6 - NEW
│   ├── sdk/
│   │   └── generator.ex        # [7ph]
│   ├── marketplace/
│   │   ├── rules_catalog.ex    # [5nz]
│   │   └── registry.ex
│   └── frontend/
│       └── api.ex              # [uuk]
│
└── gateway/                    # Phoenix Web Layer
    ├── router.ex
    ├── endpoint.ex
    ├── controllers/
    │   ├── health_controller.ex
    │   ├── events_controller.ex    # SSE [aum]
    │   ├── telegram_controller.ex  # Webhook [aum]
    │   └── metrics_controller.ex   # Prometheus [ilf]
    └── channels/
        └── events_channel.ex

docker/                         # ✅ Created
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── Dockerfile
├── Dockerfile.dev
├── .env.example
└── scripts/
```

---

## 4. Component Design by Tier

### 4.1 Tier 1: Foundation (P0) - CURRENT FOCUS

#### 4.1.1 Database Persistence [8x5] ✅ COMPLETE
- Ecto.Repo with PostgreSQL adapter
- Row-Level Security for multi-tenant isolation
- Connection pooling (default: 10, prod: 20)
- Query timeout enforcement (30s)

**Files Created**:
- `lib/cybernetic/repo.ex`
- `priv/repo/migrations/20251217000001_create_tenants.exs`
- `priv/repo/migrations/20251217000002_create_system_states.exs`
- `priv/repo/migrations/20251217000003_create_episodes.exs`
- `priv/repo/migrations/20251217000004_create_policies.exs`
- `priv/repo/migrations/20251217000005_create_artifacts.exs`
- `priv/repo/migrations/20251217000006_add_oban_tables.exs`
- `priv/repo/migrations/20251217000007_enable_row_level_security.exs`

#### 4.1.2 Docker Deployment [1o9] ✅ COMPLETE
- Base compose with all services (postgres, redis, rabbitmq, ollama, prometheus, grafana, jaeger, otel)
- Dev overlay with live reload volumes
- Prod overlay with secrets, replicas, resource limits
- Health checks on all services

**Files Created**:
- `docker/docker-compose.yml`
- `docker/docker-compose.dev.yml`
- `docker/docker-compose.prod.yml`
- `docker/.env.example`
- `docker/scripts/entrypoint.sh`
- `docker/scripts/healthcheck.sh`

#### 4.1.3 Edge Gateway [aum, ilf] 🔄 IN PROGRESS

**SSE Streaming** - GET /v1/events
```elixir
defmodule Cybernetic.Gateway.Controllers.EventsController do
  @topics ~w(vsm.* episode.* policy.* artifact.*)

  def stream(conn, %{"topics" => topics}) do
    conn
    |> put_resp_header("content-type", "text/event-stream")
    |> put_resp_header("cache-control", "no-cache")
    |> send_chunked(200)
    |> subscribe_and_stream(topics)
  end
end
```

**Telegram Webhook** - POST /telegram/webhook
```elixir
defmodule Cybernetic.Gateway.Controllers.TelegramController do
  def webhook(conn, params) do
    with :ok <- verify_signature(conn),
         {:ok, update} <- parse_update(params),
         :ok <- dispatch_command(update) do
      json(conn, %{ok: true})
    end
  end
end
```

#### 4.1.4 Storage Abstraction [5jx] ⏳ PENDING

**Behaviour Definition**:
```elixir
defmodule Cybernetic.Foundation.Storage.Behaviour do
  @callback store(key :: String.t(), content :: binary(), opts :: keyword()) ::
    {:ok, metadata :: map()} | {:error, term()}
  @callback retrieve(key :: String.t(), opts :: keyword()) ::
    {:ok, content :: binary(), metadata :: map()} | {:error, :not_found | term()}
  @callback delete(key :: String.t()) :: :ok | {:error, term()}
  @callback exists?(key :: String.t()) :: boolean()
  @callback list(prefix :: String.t(), opts :: keyword()) ::
    {:ok, [String.t()]} | {:error, term()}
  @callback stream(key :: String.t()) :: Enumerable.t()
end
```

**Adapters**: Local filesystem, S3-compatible, Memory (testing)

#### 4.1.5 Background Workers [fot] 🔄 IN PROGRESS

**Oban Configuration** (already in config.exs):
```elixir
config :cybernetic, Oban,
  repo: Cybernetic.Repo,
  queues: [default: 10, critical: 20, analysis: 5, notifications: 5, storage: 3]
```

**Workers to implement**:
- `EpisodeAnalyzer` - S4 episode analysis
- `PolicyEvaluator` - S5 policy evaluation
- `NotificationSender` - External notifications

#### 4.1.6 Type Hints [wyv] ⏳ PENDING
- Add @spec to all public functions
- Define @type for complex types
- Ensure dialyzer passes with no warnings

---

### 4.2 Tier 2: Capabilities (P1)

#### 4.2.1 Capability Registry [92b]
```elixir
defmodule Cybernetic.Capabilities.Registry do
  @type capability :: %{
    id: String.t(),
    name: String.t(),
    description: String.t(),
    embedding: [float()],
    inputs: [type_spec()],
    outputs: [type_spec()],
    provider: module(),
    version: String.t()
  }

  def register(capability), do: ...
  def discover(query, opts \\ []), do: ...
  def match_semantic(embedding, threshold \\ 0.8), do: ...
end
```

#### 4.2.2 Planner System [5pv]
```elixir
defmodule Cybernetic.Capabilities.Planner.Collaboration do
  @topics %{
    plan_request: "planner.request",
    plan_response: "planner.response",
    plan_update: "planner.update",
    plan_complete: "planner.complete"
  }

  def request_plan(goal, context), do: ...
  def submit_contribution(plan_id, contribution), do: ...
  def finalize_plan(plan_id), do: ...
end
```

#### 4.2.3 Execution Framework [0n8]
```elixir
defmodule Cybernetic.Capabilities.Execution.Handoff do
  @type handoff :: %{
    id: String.t(),
    from_system: atom(),
    to_system: atom(),
    context: map(),
    trace_id: String.t(),
    timestamp: DateTime.t()
  }

  def initiate(from, to, context), do: ...
  def accept(handoff_id), do: ...
  def complete(handoff_id, result), do: ...
  def rollback(handoff_id, reason), do: ...
end
```

#### 4.2.4 Unified MCP Router [3jg]
```elixir
defmodule Cybernetic.Capabilities.MCPRouter do
  def call_tool(tool_name, args, opts \\ []) do
    with {:ok, server} <- find_server_for_tool(tool_name),
         {:ok, result} <- dispatch(server, tool_name, args, opts) do
      {:ok, result}
    end
  end

  def register_server(server_config), do: ...
  def list_tools(), do: ...
end
```

#### 4.2.5 Goldrush LLM-CDN [25u]
```elixir
defmodule Cybernetic.Capabilities.LLMCDN do
  @dedup_window_ms 5_000

  def request(provider, model, messages, opts \\ []) do
    fingerprint = compute_fingerprint(provider, model, messages)

    case get_cached(fingerprint) do
      {:ok, cached} -> {:ok, cached, :cache_hit}
      :miss ->
        case get_inflight(fingerprint) do
          {:ok, ref} -> await_inflight(ref)
          :none -> execute_and_cache(fingerprint, provider, model, messages, opts)
        end
    end
  end
end
```

Uses **ReqLLM** (mandatory per constitution) for provider abstraction.

---

### 4.3 Tier 3: Intelligence (P1)

#### 4.3.1 Deterministic Cache [q0s]
- Content-addressable storage
- Bloom filter for existence checks
- TTL with LRU eviction

#### 4.3.2 CEP Workflow Hooks [2b6]
- Goldrush rule → workflow trigger
- Event pattern matching
- Threshold-based activation

#### 4.3.3 Zombie Detection [b3n]
- Process heartbeat monitoring
- Hung process detection (no progress > 60s)
- Graceful drain and restart

#### 4.3.4 Vector Quantization [ejx]
- Product Quantization (PQ) for high-dim vectors
- Vector Quantization (VQ) for codebook learning
- 4-8x compression with <5% recall loss

#### 4.3.5 HNSW Index [qiz]
- Hierarchical Navigable Small World graphs
- M=16, ef_construction=200
- Sub-millisecond search at 1M scale

#### 4.3.6 BeliefSet CRDT [8yi]
- Delta-state CRDT for belief propagation
- Merge semantics for conflicting beliefs
- Garbage collection for tombstones

#### 4.3.7 Policy WASM [0kc]
- Compile policies to WASM
- Wasmex for Elixir execution
- Sandboxed, deterministic evaluation

---

### 4.4 Tier 4: Content (P2)

#### 4.4.1 Semantic Containers [526]
```elixir
defmodule Cybernetic.Content.SemanticContainer do
  @type t :: %__MODULE__{
    id: String.t(),
    content: binary(),
    content_type: String.t(),
    capabilities: [capability_ref()],
    policy: policy_ref(),
    metadata: map(),
    embedding: [float()],
    created_at: DateTime.t()
  }
end
```

#### 4.4.2 CMS Connectors [3et]
| CMS | API Type | Adapter |
|-----|----------|---------|
| WordPress | REST | `wordpress.ex` |
| Contentful | GraphQL | `contentful.ex` |
| Strapi | REST | `strapi.ex` |
| Sanity | GROQ | `sanity.ex` |
| Drupal | JSON:API | `drupal.ex` |
| Ghost | Content API | `ghost.ex` |

#### 4.4.3 CBCP [r0m]
- Bucket lifecycle management
- Access policy enforcement
- Cross-bucket operations

#### 4.4.4 Ingest Pipeline [dv0]
```
Fetch → Normalize → Extract → Embed → Containerize → Index
  │         │          │         │          │          │
  └── HTTP  └── Clean  └── NER   └── ReqLLM └── Wrap   └── HNSW
      S3       Format     Meta      embed      Policy      Store
```

#### 4.4.5 Google Drive [3ek]
- Changes API polling
- Incremental sync
- Shared drive support

---

### 4.5 Tier 5: Integrations (P2)

#### 4.5.1 oh-my-opencode Deep [q8b]
- Full VSM state visibility
- Bidirectional event streaming
- Shared context graphs

#### 4.5.2 Shared LLM Routing [6nl]
- ReqLLM provider abstraction
- Request deduplication across systems
- Shared cache layer

#### 4.5.3 MCP Tools [kgq]
- Tool exposure via MCP protocol
- Authentication/authorization
- Rate limiting per client

#### 4.5.4 Live Stream Relay [yh4]
- WebRTC/HLS ingestion
- Real-time transcription
- Event emission

#### 4.5.5 Twitter Spaces [99m]
- Spaces audio capture
- Speaker diarization
- Transcript streaming

---

### 4.6 Tier 6: Ecosystem (P3)

#### 4.6.1 SDKs [7ph]
- **Elixir**: Native, full-featured
- **JavaScript**: Browser + Node.js
- **Rust**: High-performance, embedded

#### 4.6.2 Rules Catalog [5nz]
- Rule definition format
- Version management
- Discovery and search

#### 4.6.3 Frontend/UX [uuk]
- Semantic search interface
- Chat with context
- VSM visualization

---

## 5. Data Model

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Tenant    │────<│ SystemState │     │   Episode   │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ id (uuid)   │     │ id (uuid)   │     │ id (uuid)   │
│ name        │     │ tenant_id   │     │ tenant_id   │
│ slug        │     │ system (1-5)│     │ title       │
│ settings    │     │ state (json)│     │ content     │
│ created_at  │     │ version     │     │ embedding   │
│ updated_at  │     │ created_at  │     │ analysis    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       │            ┌─────────────┐            │
       └───────────>│   Policy    │<───────────┘
                    ├─────────────┤
                    │ id (uuid)   │
                    │ tenant_id   │
                    │ name        │
                    │ rules (json)│
                    │ active      │
                    │ wasm_hash   │
                    │ created_at  │
                    └─────────────┘
                           │
                    ┌──────▼──────┐
                    │  Artifact   │
                    ├─────────────┤
                    │ id (uuid)   │
                    │ tenant_id   │
                    │ path        │
                    │ content_type│
                    │ size        │
                    │ metadata    │
                    │ created_at  │
                    └─────────────┘

Additional schemas (Tier 2+):
- Capability (id, name, embedding, provider, version)
- SemanticContainer (id, content_type, capabilities, policy, embedding)
- IngestJob (id, source, status, progress, metadata)
- BeliefSet (id, beliefs, vector_clock, tombstones)
```

---

## 6. API Contracts

### 6.1 SSE Events Endpoint
```
GET /v1/events?topics=system.state,episode.created
Accept: text/event-stream

Response (streaming):
event: system.state
data: {"system": 4, "state": "analyzing", "timestamp": "..."}

event: episode.created
data: {"id": "...", "title": "...", "created_at": "..."}

: heartbeat
```

### 6.2 Metrics Endpoint
```
GET /metrics
Accept: text/plain

Response:
# HELP cybernetic_requests_total Total HTTP requests
# TYPE cybernetic_requests_total counter
cybernetic_requests_total{method="GET",path="/v1/events"} 1234
```

### 6.3 Telegram Webhook
```
POST /telegram/webhook
Content-Type: application/json
X-Telegram-Bot-Api-Secret-Token: <secret>

{"update_id": 123456, "message": {"chat": {"id": -100123}, "text": "/status"}}

Response: 200 OK
```

### 6.4 LLM Proxy (Tier 5)
```
POST /v1/llm/chat
Content-Type: application/json
Authorization: Bearer <token>

{
  "provider": "anthropic",
  "model": "claude-3-sonnet",
  "messages": [{"role": "user", "content": "Hello"}]
}

Response:
{"id": "...", "choices": [...], "cache_hit": true}
```

---

## 7. Testing Strategy

| Level | Coverage | Tools |
|-------|----------|-------|
| Unit | 90%+ | ExUnit, Mox |
| Integration | 80%+ | ExUnit, Ecto.Sandbox |
| E2E | Critical paths | Docker Compose |

---

## 8. Performance Budgets

| Operation | p50 | p95 | p99 |
|-----------|-----|-----|-----|
| Health check | 5ms | 10ms | 20ms |
| Metrics scrape | 20ms | 50ms | 100ms |
| SSE connect | 50ms | 100ms | 200ms |
| DB query (simple) | 5ms | 20ms | 50ms |
| LLM cache hit | 5ms | 20ms | 50ms |
| LLM cache miss | 500ms | 2s | 5s |
| Vector search (1M) | 10ms | 30ms | 50ms |

---

## 9. Dependency Graph

```
TIER 1 (Foundation) ─────────────────────────────────────────────────────┐
│ 8x5 Database ───────────────────────────────────────┐                  │
│ 1o9 Docker ─────────────────────────────────────────┤                  │
│ aum Edge Gateway ───────────────────────────────────┼──► TIER 2        │
│ 5jx Storage ────────────────────────────────────────┤    Capabilities  │
│ fot Workers ────────────────────────────────────────┤                  │
│ ilf Phoenix Gateway ────────────────────────────────┤                  │
│ wyv Type Hints ─────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
TIER 2 (Capabilities) ◄─────────────┘
│ 92b Capability Layer ───────────────────────────────┐
│ 5pv Planner ────────────────────────────────────────┤
│ 0n8 Execution ──────────────────────────────────────┼──► TIER 3
│ 3jg MCP Router ─────────────────────────────────────┤    Intelligence
│ ujc S4 Integration ─────────────────────────────────┤
│ 25u Goldrush LLM-CDN ───────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────
                                    │
TIER 3 (Intelligence) ◄─────────────┘
│ q0s Deterministic Cache ────────────────────────────┐
│ 2b6 CEP Hooks ──────────────────────────────────────┤
│ b3n Zombie Detection ───────────────────────────────┼──► TIER 4
│ ejx Quantizer ──────────────────────────────────────┤    Content
│ qiz HNSW ───────────────────────────────────────────┤
│ 8yi BeliefSet ──────────────────────────────────────┤
│ 0kc Policy WASM ────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────
                                    │
TIER 4 (Content) ◄──────────────────┘
│ 526 Semantic Containers ────────────────────────────┐
│ 3et CMS Connectors ─────────────────────────────────┤
│ r0m CBCP ───────────────────────────────────────────┼──► TIER 5
│ dv0 Ingest Pipeline ────────────────────────────────┤    Integration
│ 3ek Google Drive ───────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────
                                    │
TIER 5 (Integration) ◄──────────────┘
│ q8b oh-my-opencode Deep ────────────────────────────┐
│ 6nl Shared LLM Routing ─────────────────────────────┤
│ kgq MCP Tools ──────────────────────────────────────┼──► TIER 6
│ yh4 Live Stream ────────────────────────────────────┤    Ecosystem
│ 99m Twitter Spaces ─────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────
                                    │
TIER 6 (Ecosystem) ◄────────────────┘
│ 7ph SDKs
│ 5nz Rules Catalog
│ uuk Frontend/UX
└─────────────────────────────────────────────────────────────────────────
```

---

## 10. Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| 32-issue scope | High | Tier-based prioritization, parallel agents |
| LLM provider lock-in | Medium | ReqLLM abstraction + local-first (Ollama) |
| Performance at scale | Medium | Caching at every layer, HNSW, quantization |
| Integration complexity | Medium | MCP standardization, clear contracts |
| Cross-tier dependencies | Medium | Foundation-first approach |
| Data consistency | Medium | PostgreSQL RLS, CRDT for distributed state |

---

## 11. Success Metrics

| Metric | Target |
|--------|--------|
| Tier 1 completion | 100% |
| Database query latency | p95 < 100ms |
| LLM cache hit rate | > 60% |
| SSE connection capacity | 10K concurrent |
| Vector search latency | < 50ms @ 1M vectors |
| Test coverage | > 80% |
| Dialyzer warnings | 0 |

---

## 12. Implementation Phases

### Phase 1: Foundation Complete (CURRENT)
- [x] Database persistence (8x5)
- [x] Docker deployment (1o9)
- [ ] Edge Gateway SSE/Telegram (aum, ilf)
- [ ] Storage abstraction (5jx)
- [ ] Workers (fot)
- [ ] Type hints (wyv)

### Phase 2: Capabilities
- [ ] Capability registry (92b)
- [ ] Planner system (5pv)
- [ ] Execution framework (0n8)
- [ ] MCP router (3jg)
- [ ] S4 integration (ujc)
- [ ] Goldrush LLM-CDN (25u)

### Phase 3: Intelligence
- [ ] Deterministic cache (q0s)
- [ ] CEP hooks (2b6)
- [ ] Zombie detection (b3n)
- [ ] Quantizer (ejx)
- [ ] HNSW (qiz)
- [ ] BeliefSet (8yi)
- [ ] Policy WASM (0kc)

### Phase 4: Content
- [ ] Semantic containers (526)
- [ ] CMS connectors (3et)
- [ ] CBCP (r0m)
- [ ] Ingest pipeline (dv0)
- [ ] Google Drive (3ek)

### Phase 5: Integrations
- [ ] oh-my-opencode integration (q8b, 6nl, kgq)
- [ ] Live stream relay (yh4)
- [ ] Twitter Spaces (99m)

### Phase 6: Ecosystem
- [ ] SDKs (7ph)
- [ ] Rules catalog (5nz)
- [ ] Frontend/UX (uuk)

---

## 13. Definition of Done (per Tier)

### Tier 1 DoD
- [ ] All migrations run successfully
- [ ] Docker compose starts all services
- [ ] Health checks pass
- [ ] SSE streaming works end-to-end
- [ ] Telegram webhook receives and responds
- [ ] Metrics endpoint exports data
- [ ] Storage adapters pass integration tests
- [ ] Oban workers execute successfully
- [ ] Test coverage ≥ 80%

### Tier 2+ DoD
- [ ] All components compile with no warnings
- [ ] All @spec annotations in place
- [ ] Dialyzer passes
- [ ] Integration tests pass
- [ ] Performance budgets met
- [ ] Documentation updated
