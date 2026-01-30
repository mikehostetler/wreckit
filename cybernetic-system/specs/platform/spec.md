# Holistic Platform Specification: Cybernetic VSM

**Status**: Active Development
**Priority**: P0-P3 (Tiered)
**Created**: 2025-12-17
**Last Updated**: 2025-12-18
**Total Issues**: 32 beads issues

---

## 1. Vision

Build a production-ready Viable System Model (VSM) platform that enables:
- Autonomous agent coordination through S1-S5 systems
- Real-time event streaming and intelligence gathering
- Multi-provider LLM integration with local-first approach
- Semantic content management with capability-aware discovery
- Integration with external systems (oh-my-opencode, CMS, social platforms)

---

## 2. Complete Issue Inventory

### Tier 1: Foundation (P0) - CURRENT FOCUS
| Beads ID | GH# | Description | Status |
|----------|-----|-------------|--------|
| 8x5 | - | Database Persistence (Ecto/PostgreSQL/RLS) | ✅ Done |
| 1o9 | #78 | Production Deployment (Docker Compose) | ✅ Done |
| aum | #75 | Edge Gateway controllers (SSE, Telegram, Metrics) | 🔄 Partial |
| 5jx | #76 | Storage Abstraction Layer (Adapter Pattern) | ⏳ Pending |
| fot | #77 | Async Worker Pattern for Background Processing | 🔄 Partial |
| ilf | #48 | Phoenix Edge Gateway implementation | 🔄 Partial |
| wyv | #80 | Add type hints, error handling, @spec annotations | ⏳ Pending |

### Tier 2: Core Capabilities (P1)
| Beads ID | GH# | Description | Status |
|----------|-----|-------------|--------|
| 92b | #63 | Capability Layer (Semantics-Aware Discovery) | ⏳ Pending |
| 5pv | #64 | Planner & Collaboration System (AMQP Topics) | ⏳ Pending |
| 0n8 | #65 | Execution Framework (Runic/Handoff) | ⏳ Pending |
| 3jg | #66 | Unified MCP Router (MCP Everywhere) | ⏳ Pending |
| ujc | #67 | System-4 Capability Integration | ⏳ Pending |
| 25u | #68 | Goldrush as LLM-CDN (Request Dedup & Caching) | ⏳ Pending |

### Tier 3: Intelligence & Processing (P1)
| Beads ID | GH# | Description | Status |
|----------|-----|-------------|--------|
| q0s | #37 | Deterministic Cache at Edge | ⏳ Pending |
| 2b6 | #38 | CEP to Workflow Hooks | ⏳ Pending |
| b3n | #39 | Zombie Detection & Drain | ⏳ Pending |
| ejx | #40 | Quantizer (PQ/VQ) | ⏳ Pending |
| qiz | #41 | HNSW ANN | ⏳ Pending |
| 8yi | #42 | BeliefSet (Delta-CRDT) | ⏳ Pending |
| 0kc | #43 | Policy to WASM Pipeline | ⏳ Pending |

### Tier 4: Content & Connectors (P2)
| Beads ID | GH# | Description | Status |
|----------|-----|-------------|--------|
| 526 | #69 | Semantic Containers (Content + Capabilities + Policy) | ⏳ Pending |
| 3et | #70 | CMS Connectors (WordPress/Contentful/Strapi/Sanity/Drupal/Ghost) | ⏳ Pending |
| r0m | #71 | CBCP: Cybernetic Bucket Control Plane | ⏳ Pending |
| dv0 | #73 | Ingest Pipeline (Fetch, Normalize, Containerize, Index) | ⏳ Pending |
| 3ek | #74 | Google Drive Connector (Changes API Integration) | ⏳ Pending |

### Tier 5: External Integrations (P2)
| Beads ID | GH# | Description | Status |
|----------|-----|-------------|--------|
| q8b | - | [Integration] Deep: oh-my-opencode as Frontend | ⏳ Pending |
| 6nl | - | [Integration] Medium: Shared LLM Routing + Caching | ⏳ Pending |
| kgq | - | [Integration] Light: MCP Tools for oh-my-opencode | ⏳ Pending |
| yh4 | #44 | Live Stream Relay (Astro Demo) | ⏳ Pending |
| 99m | #45 | Twitter Spaces Bridge (MVP) | ⏳ Pending |

### Tier 6: SDK & Ecosystem (P3)
| Beads ID | GH# | Description | Status |
|----------|-----|-------------|--------|
| 7ph | #46 | SDKs (Elixir/Rust/JS) | ⏳ Pending |
| 5nz | #47 | Rules Catalog & Marketplace | ⏳ Pending |
| uuk | #72 | Frontend/UX Layer (Semantic Search & Chat) | ⏳ Pending |

---

## 3. User Stories by Tier

### Tier 1: Foundation

#### US1.1: Database Persistence [8x5] ✅
**As a** platform operator
**I want** persistent storage for all VSM system states
**So that** operational data survives restarts and can be queried historically

**Acceptance Criteria:**
- [x] PostgreSQL with Ecto Repo configured
- [x] Row-Level Security for multi-tenant isolation
- [x] Migrations for tenants, system_states, episodes, policies, artifacts
- [x] Connection pooling with configurable limits
- [x] Query timeout enforcement (30s default)

#### US1.2: Containerized Deployment [1o9] ✅
**As a** DevOps engineer
**I want** single-command deployment of the entire platform stack
**So that** I can deploy consistently across environments

**Acceptance Criteria:**
- [x] Docker Compose with all services
- [x] Dev and prod override files
- [x] Health checks for all services
- [x] Environment template (.env.example)
- [x] Entrypoint with migration support

#### US1.3: Real-Time Event Streaming [aum]
**As a** connected client
**I want** to receive real-time events via SSE
**So that** I can react immediately to platform changes

**Acceptance Criteria:**
- [ ] SSE endpoint at GET /v1/events
- [ ] Topic-based subscription
- [ ] Heartbeat/keepalive
- [ ] Backpressure handling

#### US1.4: External Messaging [aum]
**As a** platform user
**I want** Telegram bot integration
**So that** I can interact via messaging

**Acceptance Criteria:**
- [ ] Telegram webhook endpoint
- [ ] Signature verification
- [ ] Rate limiting per chat_id
- [ ] Command dispatch

#### US1.5: Observability Metrics [aum, ilf]
**As a** platform operator
**I want** Prometheus metrics
**So that** I can monitor health and performance

**Acceptance Criteria:**
- [ ] /metrics endpoint
- [ ] Request counters, latencies, error rates
- [ ] PromEx integration for Phoenix/Ecto/Oban

#### US1.6: Storage Abstraction [5jx]
**As a** platform developer
**I want** unified storage interface
**So that** backends can be swapped without code changes

**Acceptance Criteria:**
- [ ] Adapter behaviour with store/retrieve/delete/exists?/list
- [ ] Local filesystem adapter
- [ ] S3-compatible adapter
- [ ] Memory adapter for testing
- [ ] Streaming for files > 1MB

#### US1.7: Background Processing [fot]
**As a** platform developer
**I want** async task execution
**So that** request handlers stay responsive

**Acceptance Criteria:**
- [x] Oban configuration with queues
- [ ] Episode analyzer worker
- [ ] Policy evaluator worker
- [ ] Notification sender worker

#### US1.8: Code Quality [wyv]
**As a** developer
**I want** type hints and @spec annotations
**So that** code is well-documented and dialyzer-compatible

**Acceptance Criteria:**
- [ ] @spec on all public functions
- [ ] @type definitions for complex types
- [ ] Dialyzer passes with no warnings

---

### Tier 2: Core Capabilities

#### US2.1: Capability Discovery [92b]
**As a** system component
**I want** semantic capability discovery
**So that** I can compose workflows dynamically

**Acceptance Criteria:**
- [ ] Capability registry
- [ ] Semantic matching
- [ ] Capability-based authorization

#### US2.2: Planner System [5pv]
**As a** System 3 Control
**I want** AMQP-based planning
**So that** complex workflows can be coordinated

**Acceptance Criteria:**
- [ ] AMQP topic routing
- [ ] Plan state machine
- [ ] Collaboration protocol

#### US2.3: Execution Framework [0n8]
**As a** workflow executor
**I want** Runic/Handoff patterns
**So that** execution is reliable and traceable

**Acceptance Criteria:**
- [ ] Execution context
- [ ] Handoff protocol
- [ ] Trace propagation

#### US2.4: Unified MCP Router [3jg]
**As a** tool consumer
**I want** MCP routing everywhere
**So that** tools are consistently accessible

**Acceptance Criteria:**
- [ ] MCP server registry
- [ ] Tool routing
- [ ] Cross-system dispatch

#### US2.5: System-4 Integration [ujc]
**As a** S4 Intelligence
**I want** capability-aware operation
**So that** I can leverage available tools

**Acceptance Criteria:**
- [ ] S4 capability discovery
- [ ] Tool selection
- [ ] Result aggregation

#### US2.6: Goldrush LLM-CDN [25u]
**As a** LLM consumer
**I want** request deduplication and caching
**So that** costs are minimized

**Acceptance Criteria:**
- [ ] Request fingerprinting
- [ ] Cache layer
- [ ] Deduplication window

---

### Tier 3: Intelligence & Processing

#### US3.1: Deterministic Cache [q0s]
**As a** edge service
**I want** deterministic caching
**So that** repeated requests are instant

#### US3.2: CEP Workflow Hooks [2b6]
**As a** event processor
**I want** CEP integration
**So that** events trigger workflows

#### US3.3: Zombie Detection [b3n]
**As a** system operator
**I want** zombie process detection
**So that** hung processes are cleaned up

#### US3.4: Quantizer [ejx]
**As a** vector processor
**I want** PQ/VQ quantization
**So that** vectors are storage-efficient

#### US3.5: HNSW ANN [qiz]
**As a** search consumer
**I want** approximate nearest neighbor
**So that** vector search is fast

#### US3.6: BeliefSet CRDT [8yi]
**As a** S4 Intelligence
**I want** delta-CRDT belief sets
**So that** beliefs converge across nodes

#### US3.7: Policy WASM [0kc]
**As a** S5 Policy
**I want** WASM policy execution
**So that** policies are portable and sandboxed

---

### Tier 4: Content & Connectors

#### US4.1: Semantic Containers [526]
**As a** content manager
**I want** content + capabilities + policy bundles
**So that** content is self-describing

#### US4.2: CMS Connectors [3et]
**As a** content producer
**I want** CMS integration
**So that** existing content is accessible

#### US4.3: CBCP [r0m]
**As a** bucket manager
**I want** control plane for storage buckets
**So that** content is organized

#### US4.4: Ingest Pipeline [dv0]
**As a** content ingester
**I want** fetch/normalize/index pipeline
**So that** content is processed consistently

#### US4.5: Google Drive [3ek]
**As a** Google Drive user
**I want** Changes API integration
**So that** drive content syncs

---

### Tier 5: External Integrations

#### US5.1: oh-my-opencode Deep [q8b]
**As a** oh-my-opencode user
**I want** deep VSM integration
**So that** my IDE has full platform access

#### US5.2: Shared LLM Routing [6nl]
**As a** oh-my-opencode user
**I want** shared LLM caching
**So that** costs are reduced

#### US5.3: MCP Tools [kgq]
**As a** oh-my-opencode user
**I want** MCP tool access
**So that** platform tools are available

#### US5.4: Live Stream Relay [yh4]
**As a** streamer
**I want** Astro demo relay
**So that** live content is processed

#### US5.5: Twitter Spaces [99m]
**As a** Spaces host
**I want** audio bridge
**So that** Spaces are transcribed

---

### Tier 6: SDK & Ecosystem

#### US6.1: SDKs [7ph]
**As a** third-party developer
**I want** Elixir/Rust/JS SDKs
**So that** I can integrate easily

#### US6.2: Rules Catalog [5nz]
**As a** rule author
**I want** marketplace
**So that** I can share rules

#### US6.3: Frontend/UX [uuk]
**As a** end user
**I want** search and chat UI
**So that** I can interact with the platform

---

## 4. Functional Requirements Summary

### FR1: Foundation Layer ✅ Partial
- FR1.1: Ecto Repo with PostgreSQL 15+ ✅
- FR1.2: Multi-tenant RLS isolation ✅
- FR1.3: Oban background job processing ✅
- FR1.4: Storage abstraction (local/S3/memory) ⏳
- FR1.5: Edge Gateway with SSE streaming ⏳
- FR1.6: Telegram webhook integration ⏳
- FR1.7: Prometheus metrics export ⏳

### FR2: Capability Layer ⏳
- FR2.1: Capability registry with CRDT state
- FR2.2: Semantic capability matching
- FR2.3: MCP router for tool dispatch
- FR2.4: Capability-based access control
- FR2.5: Cross-system workflow composition

### FR3: Intelligence Layer ⏳
- FR3.1: ReqLLM provider abstraction
- FR3.2: Goldrush request deduplication
- FR3.3: Deterministic edge caching
- FR3.4: HNSW approximate nearest neighbor
- FR3.5: PQ/VQ vector quantization
- FR3.6: Delta-CRDT belief sets

### FR4: Content Layer ⏳
- FR4.1: Semantic container format
- FR4.2: CMS adapter interface
- FR4.3: Ingest pipeline stages
- FR4.4: Content normalization
- FR4.5: Index management

### FR5: Integration Layer ⏳
- FR5.1: oh-my-opencode bridge
- FR5.2: LLM routing proxy
- FR5.3: MCP tool server
- FR5.4: Live stream relay
- FR5.5: Social platform bridges

### FR6: Ecosystem Layer ⏳
- FR6.1: SDK generation
- FR6.2: Rules definition format
- FR6.3: Marketplace API
- FR6.4: Frontend components

---

## 5. Non-Functional Requirements

### NFR1: Performance
- Database queries < 100ms (p95)
- LLM cache hit rate > 60%
- Event delivery < 100ms
- Vector search < 50ms for 1M vectors

### NFR2: Reliability
- 99.9% uptime for core services
- Zero data loss on restart
- Graceful degradation without LLM providers
- Circuit breakers for all external calls

### NFR3: Security
- TLS for all external connections
- RLS for tenant isolation
- Webhook signature validation
- Rate limiting on all endpoints

### NFR4: Scalability
- Horizontal scaling for web/workers
- 10K concurrent SSE connections
- 1M+ semantic containers
- Multi-region ready

---

## 6. Dependency Graph

```
TIER 1: Foundation (CURRENT)
├── 8x5 Database ────────────────────┐
├── 1o9 Docker ──────────────────────┤
├── aum Edge Gateway ────────────────┼──► TIER 2: Capabilities
├── 5jx Storage ─────────────────────┤    ├── 92b Capability Layer
├── fot Workers ─────────────────────┤    ├── 5pv Planner
├── ilf Phoenix Gateway ─────────────┤    ├── 0n8 Execution
└── wyv Type Hints ──────────────────┘    ├── 3jg MCP Router
                                          ├── ujc S4 Integration
                                          └── 25u Goldrush ────────┐
                                                                   │
TIER 3: Intelligence ◄─────────────────────────────────────────────┘
├── q0s Deterministic Cache
├── 2b6 CEP Hooks
├── b3n Zombie Detection
├── ejx Quantizer
├── qiz HNSW
├── 8yi BeliefSet
└── 0kc Policy WASM ─────────────────┐
                                      │
TIER 4: Content ◄─────────────────────┘
├── 526 Semantic Containers
├── 3et CMS Connectors
├── r0m CBCP
├── dv0 Ingest Pipeline
└── 3ek Google Drive ────────────────┐
                                      │
TIER 5: Integration ◄─────────────────┘
├── q8b oh-my-opencode Deep
├── 6nl Shared LLM Routing
├── kgq MCP Tools
├── yh4 Live Stream
└── 99m Twitter Spaces ──────────────┐
                                      │
TIER 6: Ecosystem ◄───────────────────┘
├── 7ph SDKs
├── 5nz Rules Catalog
└── uuk Frontend/UX
```

---

## 7. Progress Summary

| Tier | Issues | Completed | In Progress | Pending |
|------|--------|-----------|-------------|---------|
| 1. Foundation | 7 | 2 | 3 | 2 |
| 2. Capabilities | 6 | 0 | 0 | 6 |
| 3. Intelligence | 7 | 0 | 0 | 7 |
| 4. Content | 5 | 0 | 0 | 5 |
| 5. Integration | 5 | 0 | 0 | 5 |
| 6. Ecosystem | 3 | 0 | 0 | 3 |
| **Total** | **32** | **2** | **3** | **27** |

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 32-issue scope | High | Tier-based prioritization, parallel agents |
| LLM provider dependencies | Medium | ReqLLM abstraction + local-first |
| Performance at scale | Medium | Caching, HNSW, quantization |
| Integration complexity | Medium | MCP standardization |
| Cross-tier dependencies | Medium | Foundation-first approach |

---

## 9. Open Questions

1. ~~Database choice?~~ **Resolved: PostgreSQL with Ecto**
2. ~~LLM abstraction?~~ **Resolved: ReqLLM**
3. Vector database strategy? **Consider pgvector vs dedicated**
4. Rules marketplace pricing? **TBD**
5. SDK language priority? **Elixir first, then JS, then Rust**
