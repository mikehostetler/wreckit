<!--
Sync Impact Report:
- Version: 2.0.0 → 2.1.0 (Added providers and CI/CD)
- Changes in 2.1.0:
  - Added Groq provider (ultra-fast inference)
  - Added OpenRouter provider (multi-model gateway)
  - Added provider selection by task type table
  - Expanded CI/CD with full GitHub Actions workflows
  - Added Docker build/test job to CI
  - Added CD workflow for staging/production deploys
- Previous Changes (2.0.0):
  - Complete rewrite for cybernetic-amcp
  - Elixir/Phoenix/OTP specific principles
  - VSM Architecture (S1-S5 Systems)
  - Local-First LLM Strategy
  - AMQP Message Patterns
  - Edge Gateway Design
- Templates Status:
  ⚠ plan-template.md - Update Constitution Check for Elixir
  ⚠ spec-template.md - Generic, works as-is
  ⚠ tasks-template.md - Update for ExUnit patterns
- Deferred: None
- Last Updated: 2025-12-18
-->

# Project Constitution: cybernetic-amcp

**Project**: Cybernetic AMCP - VSM-based Operational Intelligence Platform
**Stack**: Elixir 1.16+ / Phoenix 1.7+ / OTP 26+
**Architecture**: Viable System Model (S1-S5) with AMQP messaging

---

## Core Principles

### I. Beads Integration for Work Memory - MANDATORY

**All long-running work and discovered tasks MUST be tracked as Beads issues:**

- `tasks.md` is for intent, structure, and indexing (NOT for storing the full backlog)
- Beads stores the actual work with dependencies, notes, and discoveries
- Each task in `tasks.md` MUST reference its Beads issue ID: `- [ ] (cybernetic-amcp-xxx) T001 ...`
- Implementation MUST be driven from `bd ready` (not just markdown checkboxes)
- Discoveries during implementation MUST create new Beads issues (not expand tasks.md)

**Beads Workflow:**
1. Before `/speckit.specify`: Search Beads for prior work (`bd search`, `bd list`)
2. During `/speckit.plan`: Create epic issues for each phase
3. After `/speckit.tasks`: Create Beads task issues and link IDs in `tasks.md`
4. During `/speckit.implement`: Drive from `bd ready`, update both Beads and `tasks.md`
5. End of session: Run session close protocol (`bd sync`, `git push`)

**Rationale:** Beads provides persistent memory across sessions that survives context limits, enabling long-running projects with AI agents. The 33 existing beads issues represent the complete roadmap.

---

### II. Test-First Development with ExUnit - MANDATORY

**All Elixir code MUST be developed using Test-Driven Development:**

- Tests MUST be written before implementation code
- Tests MUST fail initially (Red phase)
- Implementation MUST make tests pass (Green phase)
- Code MUST be refactored after passing (Refactor phase)
- Test coverage MUST be ≥90% for all modules
- Test coverage MUST be 100% for security-critical code (auth, policy enforcement)

**Elixir Test Requirements:**
- **ExUnit** for all unit and integration tests
- **Mox** for mocking external dependencies (behaviours only)
- **StreamData** for property-based tests on complex transformations
- **Wallaby** for browser-based E2E tests (if UI added)
- **ExVCR** for recording/replaying HTTP interactions (LLM calls)

**Test Organization:**
```
test/
├── cybernetic/           # Unit tests mirror lib/ structure
│   ├── vsm/
│   │   ├── system1_test.exs
│   │   ├── system4_test.exs
│   │   └── ...
│   └── edge/
├── cybernetic_web/       # Controller/channel tests
├── integration/          # Cross-module integration
└── support/
    ├── factory.ex        # ExMachina factories
    ├── conn_case.ex
    └── data_case.ex
```

**100% Pass Gate:**
- A task is **NOT complete** if any test fails
- Existing tests MUST NOT regress
- Flaky tests MUST be fixed immediately (not skipped)

**Rationale:** Elixir's pattern matching and immutability make TDD natural. ExUnit's async testing enables fast feedback loops.

---

### III. OTP Design Principles - MANDATORY

**All Elixir code MUST follow OTP conventions:**

**Supervision Tree Design:**
- Every long-running process MUST be supervised
- Supervision strategies MUST match failure domains:
  - `:one_for_one` - Independent workers
  - `:one_for_all` - Tightly coupled processes
  - `:rest_for_one` - Ordered dependencies
- Child specs MUST define restart strategies (`:permanent`, `:transient`, `:temporary`)

**GenServer Patterns:**
- State MUST be minimal and reconstructable
- `handle_call` for synchronous requests requiring response
- `handle_cast` for fire-and-forget commands
- `handle_info` for system messages and timeouts
- `terminate/2` MUST clean up resources

**Process Architecture:**
```
Cybernetic.Application
├── Cybernetic.Repo (Ecto)
├── Cybernetic.VSM.Supervisor
│   ├── Cybernetic.VSM.System1.Supervisor (Operations)
│   ├── Cybernetic.VSM.System2.Coordinator (Coordination)
│   ├── Cybernetic.VSM.System3.Auditor (Control)
│   ├── Cybernetic.VSM.System4.Intelligence (S4 Router)
│   └── Cybernetic.VSM.System5.PolicyEngine (Policy)
├── Cybernetic.Edge.Gateway.Endpoint (Phoenix)
├── Cybernetic.AMQP.ConnectionManager
└── Cybernetic.Workers.Supervisor (Oban)
```

**Let It Crash Philosophy:**
- Processes SHOULD crash on unexpected errors
- Supervisors MUST handle restarts with backoff
- State recovery MUST be from persistent storage (DB, ETS, DETS)
- NO defensive programming for "impossible" states

**Rationale:** OTP's supervision trees provide fault tolerance. Letting processes crash and restart is more reliable than complex error handling.

---

### IV. VSM Architecture Compliance - MANDATORY

**All features MUST map to the Viable System Model:**

**System Definitions:**
| System | Role | Implementation |
|--------|------|----------------|
| **S1** | Operations | Domain-specific workers, actual work execution |
| **S2** | Coordination | Anti-oscillation, conflict resolution between S1s |
| **S3** | Control | Resource allocation, performance monitoring |
| **S4** | Intelligence | Environmental scanning, adaptation, LLM analysis |
| **S5** | Policy | Identity, purpose, ultimate authority |

**Message Flow Rules:**
- S1 → S3: Operational reports (metrics, status)
- S3 → S1: Resource allocation, directives
- S4 → S3: Environmental intelligence, recommendations
- S3 → S4: Queries for analysis
- S5 → All: Policy decisions, identity constraints
- S2 ↔ S1s: Coordination signals (horizontal)

**AMQP Topic Structure:**
```
vsm.s1.{domain}.{action}     # S1 operational events
vsm.s2.coordination.{type}   # S2 anti-oscillation
vsm.s3.control.{directive}   # S3 control signals
vsm.s4.intelligence.{query}  # S4 analysis requests
vsm.s5.policy.{decision}     # S5 policy broadcasts
```

**Rationale:** VSM provides a proven model for viable, self-organizing systems. Strict adherence ensures architectural coherence.

---

### V. Message Contract Stability - MANDATORY

**All AMQP messages MUST have stable, versioned contracts:**

**Message Envelope:**
```elixir
%{
  version: "1.0",
  type: "vsm.s4.intelligence.episode_analysis",
  correlation_id: "uuid",
  timestamp: ~U[2025-12-17 00:00:00Z],
  source: "system4.router",
  payload: %{...}
}
```

**Versioning Rules:**
- Message schemas MUST be documented in `lib/cybernetic/contracts/`
- Breaking changes MUST increment major version
- Old versions MUST be supported for 3 minor releases
- Consumers MUST handle unknown fields gracefully (ignore, don't fail)

**Contract Testing:**
- All message producers MUST have contract tests
- All message consumers MUST validate against schema
- Schema changes MUST be reviewed for backward compatibility

**Rationale:** AMQP decouples systems; stable contracts prevent integration failures.

---

### VI. Local-First LLM Strategy - MANDATORY

**LLM requests MUST prioritize local inference:**

**Implementation: ReqLLM**
All LLM interactions MUST use [ReqLLM](https://github.com/agentjido/req_llm) - unified Elixir library supporting 45+ providers and 665+ models.

```elixir
# mix.exs
{:req_llm, "~> 0.1"}
```

**Provider Chain (in order):**
1. **Ollama** (local) - Primary, no API costs, privacy-preserving
2. **Groq** - Ultra-fast inference, low latency
3. **OpenRouter** - Multi-model gateway, cost optimization
4. **OpenAI** - Fallback for complex tasks
5. **Anthropic** - Fallback for analysis tasks
6. **Together AI** - Fallback for bulk operations

**Configuration:**
```elixir
config :cybernetic, :s4,
  default_chain: [
    ollama: [model: "llama3.2:3b", timeout: 120_000],
    groq: [model: "llama-3.3-70b-versatile", timeout: 30_000],
    openrouter: [model: "meta-llama/llama-3.2-3b-instruct:free"],
    openai: [model: "gpt-4o-mini"],
    anthropic: [model: "claude-3-haiku"]
  ]

# ReqLLM usage
ReqLLM.generate_text(:ollama, "llama3.2:3b", messages: messages)
ReqLLM.stream_text(:groq, "llama-3.3-70b-versatile", messages: messages)
ReqLLM.generate_object(:openai, "gpt-4o-mini", schema: schema, messages: messages)
```

**Provider Selection by Task Type:**
| Task Type | Primary | Fallback | Rationale |
|-----------|---------|----------|-----------|
| Code generation | Ollama | Groq | Privacy, speed |
| Episode analysis | Groq | OpenRouter | Speed critical |
| Complex reasoning | OpenAI | Anthropic | Quality critical |
| Bulk processing | OpenRouter | Together | Cost optimization |
| Structured output | OpenAI | Anthropic | Schema validation |

**ReqLLM Features to Use:**
- `generate_text/3` - Simple text completion
- `stream_text/3` - Streaming responses (SSE)
- `generate_object/4` - Structured output with schema validation
- Built-in usage/cost tracking (USD calculations)
- Automatic parameter translation between providers

**Failover Rules:**
- Timeout on local → Try next provider
- Rate limit hit → Try next provider
- All providers fail → Return structured error, queue for retry
- NEVER block on LLM failure; degrade gracefully

**Caching (Goldrush):**
- Identical prompts MUST return cached responses
- Cache key: hash of (model, prompt, parameters)
- Cache TTL: Configurable per request type
- Cache invalidation: Manual or time-based

**Rationale:** ReqLLM provides a unified, well-maintained interface for 45+ LLM providers. Local-first reduces costs, improves latency, and preserves data privacy. Cloud fallback ensures availability.

---

### VII. Graceful Degradation via Supervision - MANDATORY

**System MUST remain operational when components fail:**

**Degradation Hierarchy:**
| Component | Failure Mode | Degradation |
|-----------|--------------|-------------|
| PostgreSQL | Connection lost | Queue writes, serve from cache |
| RabbitMQ | Broker down | Local queue, retry on reconnect |
| Redis | Cache miss | Compute fresh, slower response |
| Ollama | Model unavailable | Fallback to cloud LLM |
| Cloud LLM | API error | Return cached or heuristic result |
| S4 Intelligence | Analysis timeout | Flag for manual review |

**Circuit Breaker (Fuse library):**
```elixir
# All external calls MUST use circuit breakers
Fuse.ask(:ollama_fuse, fn ->
  Cybernetic.VSM.System4.Providers.Ollama.generate(prompt)
end)
```

**Health Endpoints:**
- `/health` - Basic liveness (always 200 if process alive)
- `/ready` - Readiness (checks DB, AMQP, Redis connections)
- `/live` - Detailed status with component health

**Rationale:** OTP supervision + circuit breakers provide enterprise-grade reliability without complex error handling code.

---

### VIII. Elixir Quality Standards - MANDATORY

**All code MUST meet Elixir community standards:**

**Static Analysis:**
- **Credo** - Style and consistency (strict mode)
- **Dialyzer** - Type checking via typespecs
- **Sobelow** - Security analysis for Phoenix
- **mix format** - Code formatting (enforced in CI)

**Required Typespecs:**
```elixir
@spec generate(prompt :: String.t(), opts :: keyword()) ::
  {:ok, result :: map()} | {:error, reason :: term()}
```
- All public functions MUST have @spec
- All structs MUST have @type
- Dialyzer MUST pass with no warnings

**Documentation:**
- All public modules MUST have @moduledoc
- All public functions MUST have @doc
- Examples SHOULD be doctests where practical
- Complex algorithms MUST have inline comments explaining "why"

**Code Organization:**
```
lib/
├── cybernetic/
│   ├── application.ex        # OTP Application
│   ├── repo.ex               # Ecto Repo
│   ├── vsm/                   # VSM Systems (S1-S5)
│   │   ├── system1/          # Operations
│   │   ├── system2/          # Coordination
│   │   ├── system3/          # Control
│   │   ├── system4/          # Intelligence (LLM)
│   │   └── system5/          # Policy
│   ├── edge/                  # Edge Gateway
│   │   └── gateway/          # Phoenix controllers
│   ├── storage/              # Storage abstraction
│   ├── workers/              # Oban background jobs
│   └── contracts/            # Message schemas
├── cybernetic_web/           # Phoenix web layer (if separate)
└── mix.exs
```

**Rationale:** Elixir's tooling (Credo, Dialyzer) catches errors before runtime. Typespecs serve as machine-checked documentation.

---

## Edge Gateway Design

### Phoenix Endpoint Configuration

**Routes:**
```elixir
# Public (no auth)
get "/health", HealthController, :index
get "/metrics", MetricsController, :index

# API v1 (authenticated)
scope "/v1", Cybernetic.Edge.Gateway do
  pipe_through [:api, :authenticated]

  post "/generate", GenerateController, :create
  get "/events", EventsController, :stream  # SSE
end

# Webhooks (signature verified)
scope "/webhooks" do
  post "/telegram", TelegramController, :webhook
end
```

**SSE Streaming:**
- Use `Phoenix.Controller.send_chunked/2` for Server-Sent Events
- Heartbeat every 30 seconds to keep connection alive
- Topic-based filtering via query params
- Graceful reconnection with Last-Event-ID

**Rate Limiting:**
- Plug-based rate limiting per endpoint
- Configurable limits per authentication level
- Redis-backed for distributed deployments

---

## Performance & Scalability

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Health check | < 10ms | p99 |
| Generate (cached) | < 50ms | p95 |
| Generate (Ollama) | < 5s | p95 |
| Generate (cloud) | < 10s | p95 |
| SSE connect | < 100ms | p95 |
| AMQP publish | < 5ms | p95 |

### Scalability

- **Horizontal:** Stateless Phoenix nodes behind load balancer
- **Database:** Connection pooling via DBConnection (10-50 per node)
- **AMQP:** Connection per node, channels per consumer
- **Background Jobs:** Oban with PostgreSQL (scales with DB)

---

## Development Workflow

### Git Workflow

- **Branching:** Feature branches from `main`
- **Naming:** `###-feature-name` (e.g., `001-database-setup`)
- **Commits:** Conventional commits (feat, fix, docs, chore, test, refactor)
- **Merge:** Squash merge after CI passes

### CI/CD Pipeline (GitHub Actions)

**CI Workflow** (`.github/workflows/ci.yml`):
```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
      rabbitmq:
        image: rabbitmq:3.12-alpine
        ports: ['5672:5672']

    steps:
      - uses: actions/checkout@v4
      - uses: erlef/setup-beam@v1
        with:
          otp-version: '26.2'
          elixir-version: '1.16'
      - run: mix deps.get
      - run: mix compile --warnings-as-errors
      - run: mix format --check-formatted
      - run: mix credo --strict
      - run: mix dialyzer
      - run: mix sobelow --config
      - run: mix test --cover
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost/cybernetic_test
          RABBITMQ_URL: amqp://guest:guest@localhost
          REDIS_URL: redis://localhost:6379

  docker:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker/docker-compose.yml build
      - run: docker compose -f docker/docker-compose.yml up -d
      - run: sleep 10 && curl -f http://localhost:4000/health
      - run: docker compose -f docker/docker-compose.yml down
```

**CD Workflow** (`.github/workflows/deploy.yml`):
```yaml
name: Deploy
on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')
    steps:
      - uses: actions/checkout@v4
      - name: Build and push Docker image
        run: |
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}
      - name: Deploy to staging
        if: github.ref == 'refs/heads/main'
        run: echo "Deploy to staging environment"
      - name: Deploy to production
        if: startsWith(github.ref, 'refs/tags/v')
        run: echo "Deploy to production environment"
```

**Required CI Gates (All MUST pass):**
- ✅ Compilation (warnings as errors)
- ✅ Formatting (`mix format --check-formatted`)
- ✅ Linting (`mix credo --strict`)
- ✅ Type checking (`mix dialyzer`)
- ✅ Security scan (`mix sobelow`)
- ✅ Unit tests (≥90% coverage)
- ✅ Docker build and health check

### Local Development

```bash
# Setup
mix setup                    # deps.get + ecto.setup + assets

# Development
mix phx.server               # Start Phoenix
iex -S mix phx.server        # Start with IEx

# Testing
mix test                     # Run all tests
mix test --only integration  # Integration only
mix test.watch               # Watch mode

# Quality
mix quality                  # format + credo + dialyzer
```

---

## Governance

### Constitution Authority

This constitution supersedes all other development practices. When conflicts arise, **the constitution takes precedence**.

### Amendment Process

**Patch (2.0.x):** Clarifications, typos → 1 approval
**Minor (2.x.0):** New guidance, expanded principles → 2 approvals + discussion
**Major (x.0.0):** Principle changes, breaking governance → Team consensus

### Compliance Verification

**Every PR MUST verify:**
- [ ] Tests written first (TDD cycle)
- [ ] ExUnit tests pass (100%)
- [ ] Dialyzer passes (no warnings)
- [ ] Credo passes (strict mode)
- [ ] @spec on all public functions
- [ ] Beads issue updated

**Every Release MUST verify:**
- [ ] All CI gates passing
- [ ] Sobelow clean (no vulnerabilities)
- [ ] Health endpoints responding
- [ ] AMQP connections stable

---

**Version**: 2.1.0 | **Ratified**: 2025-12-17 | **Last Amended**: 2025-12-18
