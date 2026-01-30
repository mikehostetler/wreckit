# Holistic Tasks: Cybernetic VSM Platform

**Generated**: 2025-12-18
**Source**: spec.md, plan.md (32 issues consolidated)
**Total Issues**: 32 | **Total Tasks**: 150+

---

## Progress Summary

| Tier | Issues | Tasks | Completed | In Progress | Pending |
|------|--------|-------|-----------|-------------|---------|
| 1. Foundation | 7 | 40 | 36 | 0 | 4 |
| 2. Capabilities | 6 | 24 | 0 | 0 | 24 |
| 3. Intelligence | 7 | 28 | 0 | 0 | 28 |
| 4. Content | 5 | 20 | 0 | 0 | 20 |
| 5. Integration | 5 | 20 | 0 | 0 | 20 |
| 6. Ecosystem | 3 | 12 | 0 | 0 | 12 |
| **Total** | **32** | **144** | **36** | **0** | **108** |

---

## Legend

- `[x]` = Completed
- `[ ]` = Pending
- `[P]` = Parallelizable with other [P] tasks in same phase
- `[US#]` = Links to User Story in spec.md
- **Blocks**: Tasks that depend on this task
- **Depends**: Tasks this task depends on

---

# TIER 1: FOUNDATION (P0)

## Issue: 8x5 - Database Persistence ✅ COMPLETE

### T001: Create Ecto Repo Module
- [x] Create `lib/cybernetic/repo.ex` with Ecto.Repo
- **File**: `lib/cybernetic/repo.ex`
- **DoD**: Repo module compiles, RLS helper functions implemented
- **Commit**: 5646188d

### T002: Add Database Configuration
- [x] Create database config in `config/config.exs` and `config/runtime.exs`
- **Files**: `config/config.exs`, `config/runtime.exs`
- **DoD**: DATABASE_URL parsed, pool configured, query timeout set

### T003: Add Oban Configuration
- [x] Add Oban to deps and configure queues
- **Files**: `mix.exs`, `config/config.exs`
- **DoD**: Oban starts with 5 queues (default, critical, analysis, notifications, storage)

### T010: Create Tenants Migration
- [x] Create `priv/repo/migrations/20251217000001_create_tenants.exs`
- **DoD**: Tenants table with id, name, slug, settings, timestamps

### T011: Create System States Migration
- [x] Create `priv/repo/migrations/20251217000002_create_system_states.exs`
- **DoD**: system_states table with tenant_id FK, system (1-5), state jsonb

### T012: Create Episodes Migration
- [x] Create `priv/repo/migrations/20251217000003_create_episodes.exs`
- **DoD**: episodes table with tenant_id FK, title, content, embedding, analysis jsonb

### T013: Create Policies Migration
- [x] Create `priv/repo/migrations/20251217000004_create_policies.exs`
- **DoD**: policies table with tenant_id FK, name, rules jsonb, active boolean

### T014: Create Artifacts Migration
- [x] Create `priv/repo/migrations/20251217000005_create_artifacts.exs`
- **DoD**: artifacts table with tenant_id, path, content_type, size, metadata

### T015: Create Oban Tables Migration
- [x] Create `priv/repo/migrations/20251217000006_add_oban_tables.exs`
- **DoD**: Oban tables created via Oban.Migration

### T016: Enable Row-Level Security
- [x] Create `priv/repo/migrations/20251217000007_enable_row_level_security.exs`
- **DoD**: RLS enabled on tenant-scoped tables with policies

### T020: Create Tenant Schema
- [x] Create `lib/cybernetic/schemas/storage/tenant.ex`
- **DoD**: Schema with changeset, validation

### T021: Create SystemState Schema
- [x] Create `lib/cybernetic/schemas/vsm/system_state.ex`
- **DoD**: Schema with tenant belongs_to, system enum (1-5)

### T022: Create Episode Schema
- [x] Create `lib/cybernetic/schemas/vsm/episode.ex`
- **DoD**: Schema with tenant belongs_to, content, embedding, analysis

### T023: Create Policy Schema
- [x] Create `lib/cybernetic/schemas/vsm/policy.ex`
- **DoD**: Schema with tenant belongs_to, rules jsonb

### T024: Create Artifact Schema
- [x] Create `lib/cybernetic/schemas/storage/artifact.ex`
- **DoD**: Schema with tenant belongs_to, path, metadata

---

## Issue: 1o9 - Production Deployment ✅ COMPLETE

### T030: Create Base Docker Compose
- [x] Create `docker/docker-compose.yml`
- **DoD**: All services defined (app, postgres, redis, rabbitmq, ollama, prometheus, grafana, jaeger, otel)

### T031: Create Dockerfile
- [x] Create multi-stage `Dockerfile`
- **DoD**: Build and runtime stages, mix release

### T032: Create Entrypoint Script
- [x] Create `docker/scripts/entrypoint.sh`
- **DoD**: Runs migrations, starts app

### T033: Create Health Check Script
- [x] Create `docker/scripts/healthcheck.sh`
- **DoD**: Checks /health endpoint

### T034: Create Environment Template
- [x] Create `docker/.env.example`
- **DoD**: All required env vars documented

### T035: Create Dev Compose Override
- [x] Create `docker/docker-compose.dev.yml`
- **DoD**: Mounts source, enables hot reload, reduced resources

### T036: Create Prod Compose Override
- [x] Create `docker/docker-compose.prod.yml`
- **DoD**: Secrets required, replicas, resource limits, logging

---

## Issue: aum - Edge Gateway Controllers 🔄 PARTIAL

### T040: Implement SSE Events Controller
- [ ] [P] Create `lib/cybernetic/gateway/controllers/events_controller.ex`
- **File**: `lib/cybernetic/gateway/controllers/events_controller.ex`
- **DoD**: SSE streaming, topic subscription, heartbeat every 30s
- **Verify**: `curl -N http://localhost:4000/v1/events?topics=vsm.*` receives events

### T041: Add SSE Route
- [ ] Add GET /v1/events route to router
- **File**: `lib/cybernetic/gateway/router.ex`
- **Depends**: T040

### T042: Implement Telegram Controller
- [ ] [P] Create `lib/cybernetic/gateway/controllers/telegram_controller.ex`
- **File**: `lib/cybernetic/gateway/controllers/telegram_controller.ex`
- **DoD**: Webhook receives, validates X-Telegram-Bot-Api-Secret-Token, dispatches, rate limits per chat_id
- **Verify**: Test webhook payload accepted, rate limit triggers on burst

### T043: Add Telegram Route
- [ ] Add POST /telegram/webhook route
- **File**: `lib/cybernetic/gateway/router.ex`
- **Depends**: T042

---

## Issue: ilf - Phoenix Edge Gateway 🔄 PARTIAL

### T044: Implement Metrics Controller
- [ ] Create `lib/cybernetic/gateway/controllers/metrics_controller.ex`
- **File**: `lib/cybernetic/gateway/controllers/metrics_controller.ex`
- **DoD**: Prometheus format, counters/gauges/histograms via PromEx
- **Verify**: Prometheus can scrape /metrics

### T045: Complete PromEx Configuration
- [x] Configure PromEx for Phoenix/Ecto/Oban metrics
- **Files**: `lib/cybernetic/prom_ex.ex`, `config/config.exs`
- **DoD**: Telemetry events captured

### T046: Add Metrics Route
- [ ] Add GET /metrics route
- **File**: `lib/cybernetic/gateway/router.ex`
- **Depends**: T044

---

## Issue: 5jx - Storage Abstraction Layer ⏳ PENDING

### T050: Create Storage Adapter Behaviour
- [ ] [P] Create `lib/cybernetic/foundation/storage/behaviour.ex`
- **File**: `lib/cybernetic/foundation/storage/behaviour.ex`
- **DoD**: Behaviour with store/retrieve/delete/exists?/list/stream callbacks

### T051: Implement Local Adapter
- [ ] [P] Create `lib/cybernetic/foundation/storage/local.ex`
- **File**: `lib/cybernetic/foundation/storage/local.ex`
- **DoD**: File operations, path safety, streaming for files >1MB
- **Verify**: 10MB file streams without OOM

### T052: Implement S3 Adapter
- [ ] [P] Create `lib/cybernetic/foundation/storage/s3.ex`
- **File**: `lib/cybernetic/foundation/storage/s3.ex`
- **DoD**: ExAws S3 operations, multipart upload for files >5MB, streaming download
- **Verify**: Integration test with MinIO, 50MB file uploads successfully

### T053: Implement Memory Adapter
- [ ] [P] Create `lib/cybernetic/foundation/storage/memory.ex`
- **File**: `lib/cybernetic/foundation/storage/memory.ex`
- **DoD**: ETS-based, for testing

### T054: Create Storage Module
- [ ] Create `lib/cybernetic/foundation/storage.ex`
- **File**: `lib/cybernetic/foundation/storage.ex`
- **DoD**: Routes to configured adapter
- **Depends**: T050, T051, T052, T053

---

## Issue: fot - Async Worker Pattern 🔄 PARTIAL

### T060: Create Base Worker Behaviour
- [ ] [P] Create `lib/cybernetic/foundation/workers/behaviour.ex`
- **File**: `lib/cybernetic/foundation/workers/behaviour.ex`
- **DoD**: Shared behaviour with error handling, telemetry

### T061: Create Episode Analyzer Worker
- [ ] [P] Create `lib/cybernetic/foundation/workers/episode_analyzer.ex`
- **File**: `lib/cybernetic/foundation/workers/episode_analyzer.ex`
- **DoD**: Oban worker, analyzes episodes, updates analysis field
- **Queue**: analysis

### T062: Create Policy Evaluator Worker
- [ ] [P] Create `lib/cybernetic/foundation/workers/policy_evaluator.ex`
- **File**: `lib/cybernetic/foundation/workers/policy_evaluator.ex`
- **DoD**: Oban worker, evaluates policies against context
- **Queue**: critical

### T063: Create Notification Sender Worker
- [ ] Create `lib/cybernetic/foundation/workers/notification_sender.ex`
- **File**: `lib/cybernetic/foundation/workers/notification_sender.ex`
- **DoD**: Oban worker, sends notifications to external systems
- **Queue**: notifications

---

## Issue: wyv - Type Hints & Specs ⏳ PENDING

### T070: Add @spec to Repo Functions
- [ ] [P] Add @spec to all public functions in repo.ex
- **File**: `lib/cybernetic/repo.ex`

### T071: Add @spec to Schema Functions
- [ ] [P] Add @spec to all changeset functions
- **Files**: `lib/cybernetic/schemas/**/*.ex`

### T072: Add @type Definitions
- [ ] [P] Define @type for complex types
- **Files**: Various

### T073: Run Dialyzer
- [ ] Ensure dialyzer passes with no warnings
- **Command**: `mix dialyzer`
- **DoD**: Zero warnings
- **Depends**: T070, T071, T072

---

# TIER 2: CAPABILITIES (P1)

## Issue: 92b - Capability Layer ⏳ PENDING

### T100: Create Capability Schema
- [ ] [P] Create `lib/cybernetic/capabilities/schemas/capability.ex`
- **DoD**: Schema with id, name, description, embedding, inputs, outputs, provider, version

### T101: Create Capability Registry GenServer
- [ ] Create `lib/cybernetic/capabilities/registry.ex`
- **DoD**: GenServer with register/discover/match_semantic
- **Depends**: T100

### T102: Implement Semantic Discovery
- [ ] Create `lib/cybernetic/capabilities/discovery.ex`
- **DoD**: Embedding-based capability matching with threshold
- **Depends**: T101

### T103: Add Capability Migration
- [ ] Create migration for capabilities table
- **DoD**: Table with embedding column (vector type)

---

## Issue: 5pv - Planner & Collaboration ⏳ PENDING

### T110: Create Plan Schema
- [ ] [P] Create `lib/cybernetic/capabilities/schemas/plan.ex`
- **DoD**: Schema with id, goal, state, contributions, trace_id

### T111: Implement Plan State Machine
- [ ] Create `lib/cybernetic/capabilities/planner/state_machine.ex`
- **DoD**: States: pending, planning, executing, complete, failed
- **Depends**: T110

### T112: Implement AMQP Collaboration
- [ ] Create `lib/cybernetic/capabilities/planner/collaboration.ex`
- **DoD**: AMQP topic routing for plan requests/responses
- **Depends**: T111

### T113: Create Planner GenServer
- [ ] Create `lib/cybernetic/capabilities/planner.ex`
- **DoD**: Coordinates planning across collaborators
- **Depends**: T112

---

## Issue: 0n8 - Execution Framework ⏳ PENDING

### T120: Create Execution Context
- [ ] [P] Create `lib/cybernetic/capabilities/execution/context.ex`
- **DoD**: Struct with trace_id, parent_context, variables, timeout

### T121: Implement Handoff Protocol
- [ ] Create `lib/cybernetic/capabilities/execution/handoff.ex`
- **DoD**: initiate/accept/complete/rollback functions
- **Depends**: T120

### T122: Create Execution Supervisor
- [ ] Create `lib/cybernetic/capabilities/execution/supervisor.ex`
- **DoD**: Dynamic supervisor for execution processes
- **Depends**: T121

### T123: Integrate with OpenTelemetry
- [ ] Add trace propagation to execution
- **DoD**: Traces visible in Jaeger
- **Depends**: T122

---

## Issue: 3jg - Unified MCP Router ⏳ PENDING

### T130: Create MCP Server Registry
- [ ] Create `lib/cybernetic/capabilities/mcp/registry.ex`
- **DoD**: GenServer tracking registered MCP servers

### T131: Implement Tool Router
- [ ] Create `lib/cybernetic/capabilities/mcp/router.ex`
- **DoD**: Routes tool calls to appropriate server
- **Depends**: T130

### T132: Add MCP Authentication
- [ ] Implement auth middleware for MCP calls
- **DoD**: Bearer token validation
- **Depends**: T131

### T133: Expose Platform Tools via MCP
- [ ] Create MCP server exposing platform capabilities
- **DoD**: Tools available for external consumption
- **Depends**: T132

---

## Issue: ujc - System-4 Capability Integration ⏳ PENDING

### T140: Create S4 Intelligence Module
- [ ] Create `lib/cybernetic/capabilities/s4_integration.ex`
- **DoD**: S4 can discover and use registered capabilities

### T141: Implement Capability-Aware Tool Selection
- [ ] Add semantic matching to tool selection
- **DoD**: S4 selects best tool for task
- **Depends**: T140, T102

### T142: Create Result Aggregator
- [ ] Implement multi-tool result aggregation
- **DoD**: Combines results from multiple capability executions
- **Depends**: T141

---

## Issue: 25u - Goldrush LLM-CDN ⏳ PENDING

### T150: Create Request Fingerprinter
- [ ] Create `lib/cybernetic/capabilities/llm_cdn/fingerprint.ex`
- **DoD**: Deterministic fingerprint for LLM requests

### T151: Implement Cache Layer
- [ ] Create `lib/cybernetic/capabilities/llm_cdn/cache.ex`
- **DoD**: Redis-backed cache with TTL
- **Depends**: T150

### T152: Implement Request Deduplication
- [ ] Create `lib/cybernetic/capabilities/llm_cdn/dedup.ex`
- **DoD**: Concurrent requests share single upstream call
- **Depends**: T151

### T153: Integrate with ReqLLM
- [ ] Create `lib/cybernetic/capabilities/llm_cdn.ex`
- **DoD**: Full LLM-CDN with ReqLLM backend
- **Depends**: T152

---

# TIER 3: INTELLIGENCE (P1)

## Issue: q0s - Deterministic Cache at Edge ⏳ PENDING

### T200: Create Content-Addressable Store
- [ ] [P] Create `lib/cybernetic/intelligence/cache/content_addressed.ex`
- **DoD**: SHA256-based addressing

### T201: Implement Bloom Filter
- [ ] [P] Create `lib/cybernetic/intelligence/cache/bloom_filter.ex`
- **DoD**: Fast existence checks

### T202: Create Cache GenServer
- [ ] Create `lib/cybernetic/intelligence/cache/deterministic.ex`
- **DoD**: TTL + LRU eviction
- **Depends**: T200, T201

---

## Issue: 2b6 - CEP to Workflow Hooks ⏳ PENDING

### T210: Define Workflow Hook Behaviour
- [ ] [P] Create `lib/cybernetic/intelligence/cep/hook_behaviour.ex`
- **DoD**: Behaviour for workflow triggers

### T211: Create Goldrush Rule Adapter
- [ ] Create `lib/cybernetic/intelligence/cep/goldrush_adapter.ex`
- **DoD**: Goldrush events trigger workflow hooks
- **Depends**: T210

### T212: Implement Threshold-Based Activation
- [ ] Add threshold support to hooks
- **DoD**: Hooks trigger only when threshold met
- **Depends**: T211

---

## Issue: b3n - Zombie Detection & Drain ⏳ PENDING

### T220: Create Heartbeat Monitor
- [ ] Create `lib/cybernetic/intelligence/health/heartbeat.ex`
- **DoD**: Tracks process heartbeats

### T221: Implement Zombie Detector
- [ ] Create `lib/cybernetic/intelligence/health/zombie_detector.ex`
- **DoD**: Detects processes with no progress > 60s
- **Depends**: T220

### T222: Create Graceful Drain
- [ ] Implement drain procedure for zombie processes
- **DoD**: Zombies drained, state preserved
- **Depends**: T221

---

## Issue: ejx - Quantizer (PQ/VQ) ⏳ PENDING

### T230: Implement Product Quantization
- [ ] [P] Create `lib/cybernetic/intelligence/vectors/pq.ex`
- **DoD**: PQ encoder/decoder for high-dim vectors

### T231: Implement Vector Quantization
- [ ] [P] Create `lib/cybernetic/intelligence/vectors/vq.ex`
- **DoD**: Codebook learning for VQ

### T232: Create Quantizer Module
- [ ] Create `lib/cybernetic/intelligence/vectors/quantizer.ex`
- **DoD**: 4-8x compression with <5% recall loss
- **Depends**: T230, T231

---

## Issue: qiz - HNSW ANN ⏳ PENDING

### T240: Implement HNSW Graph Structure
- [ ] Create `lib/cybernetic/intelligence/vectors/hnsw/graph.ex`
- **DoD**: Multi-layer graph with M=16

### T241: Implement HNSW Search
- [ ] Create `lib/cybernetic/intelligence/vectors/hnsw/search.ex`
- **DoD**: Approximate nearest neighbor search
- **Depends**: T240

### T242: Implement HNSW Insert
- [ ] Create `lib/cybernetic/intelligence/vectors/hnsw/insert.ex`
- **DoD**: ef_construction=200
- **Depends**: T240

### T243: Create HNSW Module
- [ ] Create `lib/cybernetic/intelligence/vectors/hnsw.ex`
- **DoD**: Sub-millisecond search at 1M scale
- **Depends**: T241, T242

---

## Issue: 8yi - BeliefSet (Delta-CRDT) ⏳ PENDING

### T250: Define BeliefSet Structure
- [ ] [P] Create `lib/cybernetic/intelligence/beliefs/structure.ex`
- **DoD**: Delta-state CRDT structure

### T251: Implement Merge Semantics
- [ ] Create `lib/cybernetic/intelligence/beliefs/merge.ex`
- **DoD**: Conflict-free merge for beliefs
- **Depends**: T250

### T252: Implement Garbage Collection
- [ ] Add tombstone GC to BeliefSet
- **DoD**: Tombstones cleaned after propagation
- **Depends**: T251

### T253: Create BeliefSet Module
- [ ] Create `lib/cybernetic/intelligence/beliefs/beliefset.ex`
- **DoD**: Full CRDT implementation
- **Depends**: T252

---

## Issue: 0kc - Policy to WASM Pipeline ⏳ PENDING

### T260: Define Policy DSL
- [ ] [P] Create `lib/cybernetic/intelligence/policy/dsl.ex`
- **DoD**: Policy definition language

### T261: Implement WASM Compiler
- [ ] Create `lib/cybernetic/intelligence/policy/compiler.ex`
- **DoD**: Compiles policy DSL to WASM
- **Depends**: T260

### T262: Integrate Wasmex Runtime
- [ ] Create `lib/cybernetic/intelligence/policy/runtime.ex`
- **DoD**: Executes WASM policies sandboxed
- **Depends**: T261

### T263: Create Policy Pipeline
- [ ] Create `lib/cybernetic/intelligence/policy/wasm_pipeline.ex`
- **DoD**: Compile → deploy → evaluate
- **Depends**: T262

---

# TIER 4: CONTENT (P2)

## Issue: 526 - Semantic Containers ⏳ PENDING

### T300: Define Container Schema
- [ ] [P] Create `lib/cybernetic/content/schemas/semantic_container.ex`
- **DoD**: Schema with content, capabilities, policy, embedding

### T301: Create Container Builder
- [ ] Create `lib/cybernetic/content/semantic_container/builder.ex`
- **DoD**: Builds containers from raw content
- **Depends**: T300

### T302: Implement Container Storage
- [ ] Integrate with storage abstraction
- **DoD**: Containers stored/retrieved via storage layer
- **Depends**: T301, T054

---

## Issue: 3et - CMS Connectors ⏳ PENDING

### T310: Define CMS Adapter Behaviour
- [ ] [P] Create `lib/cybernetic/content/connectors/behaviour.ex`
- **DoD**: Behaviour with fetch/list/sync callbacks

### T311: Implement WordPress Connector
- [ ] [P] Create `lib/cybernetic/content/connectors/wordpress.ex`
- **DoD**: REST API integration

### T312: Implement Contentful Connector
- [ ] [P] Create `lib/cybernetic/content/connectors/contentful.ex`
- **DoD**: GraphQL integration

### T313: Implement Strapi Connector
- [ ] [P] Create `lib/cybernetic/content/connectors/strapi.ex`
- **DoD**: REST API integration

### T314: Create CMS Registry
- [ ] Create `lib/cybernetic/content/connectors/registry.ex`
- **DoD**: Multi-CMS configuration
- **Depends**: T310, T311, T312, T313

---

## Issue: r0m - CBCP: Bucket Control Plane ⏳ PENDING

### T320: Define Bucket Schema
- [ ] [P] Create `lib/cybernetic/content/cbcp/schemas/bucket.ex`
- **DoD**: Schema with name, policy, lifecycle

### T321: Implement Lifecycle Management
- [ ] Create `lib/cybernetic/content/cbcp/lifecycle.ex`
- **DoD**: Create/archive/delete buckets
- **Depends**: T320

### T322: Implement Access Policy
- [ ] Create `lib/cybernetic/content/cbcp/policy.ex`
- **DoD**: Per-bucket access control
- **Depends**: T321

---

## Issue: dv0 - Ingest Pipeline ⏳ PENDING

### T330: Create Fetcher Stage
- [ ] [P] Create `lib/cybernetic/content/ingest/fetcher.ex`
- **DoD**: HTTP/S3 content fetching

### T331: Create Normalizer Stage
- [ ] [P] Create `lib/cybernetic/content/ingest/normalizer.ex`
- **DoD**: Format cleaning, encoding normalization

### T332: Create Embedder Stage
- [ ] [P] Create `lib/cybernetic/content/ingest/embedder.ex`
- **DoD**: ReqLLM embedding generation

### T333: Create Indexer Stage
- [ ] [P] Create `lib/cybernetic/content/ingest/indexer.ex`
- **DoD**: HNSW index update

### T334: Create Pipeline Orchestrator
- [ ] Create `lib/cybernetic/content/ingest/pipeline.ex`
- **DoD**: Fetch → Normalize → Embed → Index
- **Depends**: T330, T331, T332, T333

---

## Issue: 3ek - Google Drive Connector ⏳ PENDING

### T340: Implement OAuth Flow
- [ ] Create `lib/cybernetic/content/connectors/google_drive/auth.ex`
- **DoD**: Google OAuth 2.0 integration

### T341: Implement Changes API
- [ ] Create `lib/cybernetic/content/connectors/google_drive/changes.ex`
- **DoD**: Incremental change polling
- **Depends**: T340

### T342: Create Drive Connector
- [ ] Create `lib/cybernetic/content/connectors/google_drive.ex`
- **DoD**: Full Drive integration
- **Depends**: T341

---

# TIER 5: INTEGRATIONS (P2)

## Issue: q8b - oh-my-opencode Deep Integration ⏳ PENDING

### T400: Create VSM State Bridge
- [ ] Create `lib/cybernetic/integrations/oh_my_opencode/bridge.ex`
- **DoD**: Full VSM state visibility for oh-my-opencode

### T401: Implement Bidirectional Events
- [ ] Create `lib/cybernetic/integrations/oh_my_opencode/events.ex`
- **DoD**: Event streaming both directions
- **Depends**: T400

### T402: Share Context Graphs
- [ ] Implement context graph sharing
- **DoD**: Shared CRDT graphs
- **Depends**: T401

---

## Issue: 6nl - Shared LLM Routing ⏳ PENDING

### T410: Create LLM Proxy
- [ ] Create `lib/cybernetic/integrations/oh_my_opencode/llm_proxy.ex`
- **DoD**: Proxies LLM requests from oh-my-opencode

### T411: Implement Request Dedup
- [ ] Integrate with LLM-CDN
- **DoD**: Cross-system deduplication
- **Depends**: T410, T153

### T412: Add Shared Cache
- [ ] Implement cache sharing
- **DoD**: Single cache for both systems
- **Depends**: T411

---

## Issue: kgq - MCP Tools for oh-my-opencode ⏳ PENDING

### T420: Expose Tools via MCP
- [ ] Create `lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex`
- **DoD**: Platform tools available via MCP

### T421: Add Rate Limiting
- [ ] Implement per-client rate limits
- **DoD**: Rate limits enforced
- **Depends**: T420

---

## Issue: yh4 - Live Stream Relay ⏳ PENDING

### T430: Implement Stream Ingestion
- [ ] Create `lib/cybernetic/integrations/streaming/ingest.ex`
- **DoD**: WebRTC/HLS ingestion

### T431: Add Real-Time Transcription
- [ ] Create `lib/cybernetic/integrations/streaming/transcription.ex`
- **DoD**: Live transcription via ReqLLM
- **Depends**: T430

### T432: Create Live Relay
- [ ] Create `lib/cybernetic/integrations/streaming/live_relay.ex`
- **DoD**: Full live stream relay
- **Depends**: T431

---

## Issue: 99m - Twitter Spaces Bridge ⏳ PENDING

### T440: Implement Audio Capture
- [ ] Create `lib/cybernetic/integrations/social/spaces/capture.ex`
- **DoD**: Spaces audio stream capture

### T441: Add Speaker Diarization
- [ ] Create `lib/cybernetic/integrations/social/spaces/diarization.ex`
- **DoD**: Speaker identification
- **Depends**: T440

### T442: Create Spaces Bridge
- [ ] Create `lib/cybernetic/integrations/social/twitter_spaces.ex`
- **DoD**: Full Spaces integration
- **Depends**: T441

---

# TIER 6: ECOSYSTEM (P3)

## Issue: 7ph - SDKs (Elixir/Rust/JS) ⏳ PENDING

### T500: Create Elixir SDK
- [ ] Create `sdk/elixir/cybernetic_client`
- **DoD**: Full-featured Elixir client

### T501: Create JavaScript SDK
- [ ] Create `sdk/js/cybernetic-client`
- **DoD**: Browser + Node.js client
- **Depends**: T500

### T502: Create Rust SDK
- [ ] Create `sdk/rust/cybernetic-client`
- **DoD**: High-performance Rust client
- **Depends**: T500

### T503: Generate API Documentation
- [ ] Generate docs for all SDKs
- **DoD**: API reference published
- **Depends**: T500, T501, T502

---

## Issue: 5nz - Rules Catalog & Marketplace ⏳ PENDING

### T510: Define Rule Format
- [ ] Create rule definition schema
- **DoD**: JSON Schema for rules

### T511: Create Rules Registry
- [ ] Create `lib/cybernetic/ecosystem/marketplace/rules_catalog.ex`
- **DoD**: Rule storage and versioning
- **Depends**: T510

### T512: Implement Rule Discovery
- [ ] Add semantic search for rules
- **DoD**: Find rules by capability
- **Depends**: T511

### T513: Create Marketplace API
- [ ] Create `lib/cybernetic/ecosystem/marketplace/api.ex`
- **DoD**: REST API for marketplace
- **Depends**: T512

---

## Issue: uuk - Frontend/UX Layer ⏳ PENDING

### T520: Create Search API
- [ ] Create `lib/cybernetic/ecosystem/frontend/search_api.ex`
- **DoD**: Semantic search endpoint

### T521: Create Chat API
- [ ] Create `lib/cybernetic/ecosystem/frontend/chat_api.ex`
- **DoD**: Chat with context endpoint
- **Depends**: T520

### T522: Implement VSM Visualization API
- [ ] Create `lib/cybernetic/ecosystem/frontend/vsm_api.ex`
- **DoD**: S1-S5 state visualization data
- **Depends**: T521

### T523: Create Frontend API Module
- [ ] Create `lib/cybernetic/ecosystem/frontend/api.ex`
- **DoD**: Unified frontend API
- **Depends**: T520, T521, T522

---

# TESTING TASKS (Cross-Tier)

## T900: Create Test Factories
- [ ] [P] Create `test/support/factory.ex`
- **DoD**: Factories for all schemas

## T901: Schema Unit Tests
- [ ] [P] Create tests for all schemas
- **Files**: `test/cybernetic/schemas/**/*_test.exs`
- **DoD**: Changeset validation tested

## T902: Storage Adapter Tests
- [ ] [P] Create tests for storage adapters
- **Files**: `test/cybernetic/foundation/storage/*_test.exs`
- **DoD**: All adapter operations tested

## T903: Controller Tests
- [ ] Create controller integration tests
- **Files**: `test/cybernetic/gateway/controllers/*_test.exs`
- **DoD**: All endpoints tested

## T904: Worker Tests
- [ ] Create Oban worker tests
- **Files**: `test/cybernetic/foundation/workers/*_test.exs`
- **DoD**: Enqueue/execute tested

## T905: Docker Compose E2E Test
- [ ] Test full Docker Compose stack
- **Command**: `docker compose up -d && ./scripts/test_endpoints.sh`
- **DoD**: All services healthy, endpoints respond

---

# DOCUMENTATION TASKS (Cross-Tier)

## T910: Update README
- [ ] [P] Update `README.md` with setup instructions
- **DoD**: New dev can follow

## T911: Create Runbook
- [ ] [P] Create `docs/RUNBOOK.md`
- **DoD**: Common operations documented

## T912: Create API Reference
- [ ] Generate API documentation
- **DoD**: All endpoints documented

## T913: Create Architecture Guide
- [ ] Create `docs/ARCHITECTURE.md`
- **DoD**: VSM tiers explained

---

# Task Dependencies Graph

```
T001-T024 (Database) ──────────────────────────────────┐
T030-T036 (Docker) ────────────────────────────────────┤
                                                       ▼
T040-T046 (Gateway) ◄──────────────────────────────────┤
T050-T054 (Storage) ◄──────────────────────────────────┤
T060-T063 (Workers) ◄──────────────────────────────────┤
T070-T073 (Specs) ◄────────────────────────────────────┘
         │
         ▼ TIER 1 COMPLETE
         │
T100-T153 (Capabilities) ◄─────────────────────────────┐
         │                                             │
         ▼ TIER 2 COMPLETE                             │
         │                                             │
T200-T263 (Intelligence) ◄─────────────────────────────┤
         │                                             │
         ▼ TIER 3 COMPLETE                             │
         │                                             │
T300-T342 (Content) ◄──────────────────────────────────┤
         │                                             │
         ▼ TIER 4 COMPLETE                             │
         │                                             │
T400-T442 (Integrations) ◄─────────────────────────────┤
         │                                             │
         ▼ TIER 5 COMPLETE                             │
         │                                             │
T500-T523 (Ecosystem) ◄────────────────────────────────┘
         │
         ▼ TIER 6 COMPLETE = PLATFORM COMPLETE
```
