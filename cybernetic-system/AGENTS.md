# Code Review Rules: Cybernetic AMCP

**Stack**: Elixir 1.16+ / Phoenix 1.7+ / OTP 26+
**Architecture**: Viable System Model (S1-S5) with AMQP messaging

---

## Elixir Quality Standards (MANDATORY)

### Typespecs & Documentation
- All public functions MUST have `@spec`
- All structs MUST have `@type`
- All public modules MUST have `@moduledoc`
- All public functions MUST have `@doc`
- Use doctests where practical for examples

### Code Style
- 2-space indentation
- `snake_case` for functions and variables
- `PascalCase` for modules (e.g., `Cybernetic.VSM.System4.Service`)
- `SCREAMING_SNAKE_CASE` for module attributes/constants
- Format with `mix format` before commit
- Pass `mix credo --strict` with zero errors

### Pattern Matching
- Prefer pattern matching over conditionals
- Use guards for type checking in function heads
- Destructure in function arguments, not body
- Use `with` for happy-path chaining, not nested `case`

---

## OTP Design Principles (MANDATORY)

### Supervision
- Every long-running process MUST be supervised
- Use appropriate restart strategy:
  - `:one_for_one` - Independent workers
  - `:one_for_all` - Tightly coupled processes
  - `:rest_for_one` - Ordered dependencies
- Child specs MUST define restart (`:permanent`, `:transient`, `:temporary`)

### GenServer Patterns
- State MUST be minimal and reconstructable
- `handle_call` for sync requests requiring response
- `handle_cast` for fire-and-forget commands
- `handle_info` for system messages and timeouts
- `terminate/2` MUST clean up resources

### Let It Crash
- Processes SHOULD crash on unexpected errors
- NO defensive programming for "impossible" states
- State recovery from persistent storage (DB, ETS, DETS)

---

## VSM Architecture Compliance

### System Mapping
All features MUST map to the Viable System Model:
- **S1 (Operations)**: Domain-specific workers, actual work execution
- **S2 (Coordination)**: Anti-oscillation, conflict resolution between S1s
- **S3 (Control)**: Resource allocation, performance monitoring
- **S4 (Intelligence)**: Environmental scanning, adaptation, LLM analysis
- **S5 (Policy)**: Identity, purpose, ultimate authority

### AMQP Topic Structure
```
vsm.s1.{domain}.{action}     # S1 operational events
vsm.s2.coordination.{type}   # S2 anti-oscillation
vsm.s3.control.{directive}   # S3 control signals
vsm.s4.intelligence.{query}  # S4 analysis requests
vsm.s5.policy.{decision}     # S5 policy broadcasts
```

---

## Message Contract Stability

### Message Envelope
All AMQP messages MUST include:
```elixir
%{
  version: "1.0",
  type: "vsm.s4.intelligence.episode_analysis",
  correlation_id: "uuid",
  timestamp: ~U[...],
  source: "system4.router",
  payload: %{...}
}
```

### Versioning Rules
- Breaking changes MUST increment major version
- Consumers MUST handle unknown fields gracefully (ignore, don't fail)
- Old versions supported for 3 minor releases

---

## LLM Integration (ReqLLM)

### Provider Chain (Priority Order)
1. **Ollama** (local) - Primary, no API costs
2. **Groq** - Ultra-fast inference
3. **OpenRouter** - Multi-model gateway
4. **OpenAI/Anthropic** - Fallback

### Rules
- Use `ReqLLM` for all LLM interactions
- NEVER block on LLM failure; degrade gracefully
- Cache identical prompts (Goldrush)
- Timeout on local → try next provider

---

## Error Handling & Resilience

### Circuit Breakers
All external calls MUST use circuit breakers (Fuse):
```elixir
Fuse.ask(:ollama_fuse, fn ->
  Cybernetic.VSM.System4.Providers.Ollama.generate(prompt)
end)
```

### Graceful Degradation
| Component | Failure Mode | Degradation |
|-----------|--------------|-------------|
| PostgreSQL | Connection lost | Queue writes, serve from cache |
| RabbitMQ | Broker down | Local queue, retry on reconnect |
| Ollama | Model unavailable | Fallback to cloud LLM |
| Cloud LLM | API error | Return cached or heuristic result |

---

## Testing Requirements

### TDD (Red-Green-Refactor)
- Tests MUST be written before implementation
- Tests MUST fail initially (Red)
- Implementation makes tests pass (Green)
- Refactor after passing

### Coverage
- ≥90% for all modules
- 100% for security-critical code (auth, policy)

### Test Organization
- **ExUnit** for unit and integration tests
- **Mox** for mocking (behaviours only)
- **StreamData** for property-based tests
- **ExVCR** for HTTP recording (LLM calls)

### Rules
- A task is NOT complete if any test fails
- Existing tests MUST NOT regress
- Flaky tests MUST be fixed immediately (not skipped)

---

## Security

### Never Commit
- Hardcoded credentials
- API keys or secrets
- `.env` files (use `.env.example`)

### Requirements
- Input validation on all endpoints
- Tenant isolation via RLS
- Webhook signatures verified
- Rate limiting on public endpoints

---

## Git & Commits

### Conventional Commits
Format: `type(scope): description`
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance
- `ci:` - CI/CD changes

Example: `fix(core/amqp): reconnect on channel error`

### PR Requirements
- Clear description
- Linked issues
- Test coverage for changes
- All CI gates passing

---

## CI Gates (All MUST Pass)

- [ ] Compilation (warnings as errors)
- [ ] Formatting (`mix format --check-formatted`)
- [ ] Linting (`mix credo --strict`)
- [ ] Type checking (`mix dialyzer`)
- [ ] Security scan (`mix sobelow`)
- [ ] Unit tests (≥90% coverage)

---

## Code Organization

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
│   ├── storage/              # Storage abstraction
│   ├── workers/              # Oban background jobs
│   └── contracts/            # Message schemas
```

---

**Source**: `.specify/memory/constitution.md` v2.1.0
