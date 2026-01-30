# Research: System Audit & Resilience Check

**Date**: 2025-01-22
**Item**: 002-system-audit-resilience-check

## Research Question

Need to verify operational status and resilience of the Cybernetic AMCP system components.

**Motivation:** System reliability assurance and confidence verification.

**Success criteria:**
- Verify all 5 VSM systems (S1-S5) are operational
- Check resilience of Ralph Wiggum loops (TelegramAgent, etc.)
- Provide a confidence report

## Summary

The Cybernetic aMCP system implements Stafford Beer's Viable System Model with 5 hierarchical layers (S1-S5) for distributed AI orchestration. The system has comprehensive health monitoring infrastructure already in place through `Cybernetic.Health.Monitor` and multiple validation scripts.

The "Ralph Wiggum loops" refer to autonomous polling and processing loops, primarily the TelegramAgent which implements a resilient polling mechanism with exponential backoff, circuit breaker patterns, and health checks. The system already has extensive audit capabilities through:

1. **Health Monitor** (`lib/cybernetic/health/monitor.ex`) - Checks all 5 VSM systems every 5 seconds
2. **Comprehensive Production Tests** (`test/test_production_comprehensive.exs`) - 30-test validation suite
3. **System Validation** (`test/system_validation.exs`) - 9-component health check
4. **Circuit Breaker Alerts** (`lib/cybernetic/core/resilience/circuit_breaker_alerts.ex`) - Monitors provider health

The audit task can be accomplished by creating a dedicated audit script that aggregates these existing checks and provides a confidence report.

## Current State Analysis

### Existing Implementation

**Health Monitoring System**
The system has a fully functional health monitoring service at `lib/cybernetic/health/monitor.ex:1-348` that:
- Checks all 5 VSM systems every 5 seconds (line 10: `@check_interval 5_000`)
- Monitors RabbitMQ, Redis, Prometheus, disk space, and memory usage
- Provides `status()` and `detailed_status()` APIs (lines 27-37)
- Tracks component failures with threshold-based alerts (line 12: `@unhealthy_threshold 3`)
- Broadcasts status changes via telemetry (lines 338-346)

**VSM System Architecture**
All 5 VSM systems are implemented as GenServers with supervisor trees:

- **System 1 - Operations** (`lib/cybernetic/vsm/system1/operational.ex:1-54`): Entry points and AMQP workers
- **System 2 - Coordination** (`lib/cybernetic/vsm/system2/coordinator.ex:1-214`): Resource allocation with aging algorithm
- **System 3 - Control** (`lib/cybernetic/vsm/system3/control.ex:1-30`): Resource management and policy enforcement
- **System 4 - Intelligence** (`lib/cybernetic/vsm/system4/intelligence.ex:1-54`): LLM reasoning and scenario simulation
- **System 5 - Policy** (`lib/cybernetic/vsm/system5/policy.ex:1-99`): Identity, goal setting, and policy versioning

The VSM supervisor (`lib/cybernetic/vsm/supervisor.ex:1-26`) starts all systems with `:rest_for_one` strategy (line 23), ensuring dependent systems restart together.

**Ralph Wiggum Loops (TelegramAgent)**
The TelegramAgent at `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:1-444` implements a resilient polling loop with:

1. **Autonomous Polling** (lines 162-189): Self-scheduling `handle_info(:poll_updates, state)` loop
2. **Exponential Backoff** (lines 355-367): `calculate_poll_delay/1` with jitter (2s base, 30s max)
3. **Health Monitoring** (lines 264-278): `check_health` verifies polling every 30 seconds
4. **Crash Recovery** (lines 252-262): Handles `{:EXIT, pid, reason}` for polling task crashes
5. **Failure Tracking** (line 26): `polling_failures` counter with backoff escalation
6. **Telemetry Events** (lines 233-237): Emits failure metrics for monitoring

**Circuit Breaker Resilience**
The system includes adaptive circuit breakers (`lib/cybernetic/core/resilience/adaptive_circuit_breaker.ex`) with:
- 14 Prometheus metrics for monitoring
- Multi-level alerting system (`lib/cybernetic/core/resilience/circuit_breaker_alerts.ex:1-300`)
- Health score tracking (line 16: `@critical_health_threshold 0.2`)
- Alert cooldowns (line 14: `@alert_cooldown_ms 300_000`)

**Existing Validation Scripts**
- `test/test_production_comprehensive.exs` - 30 tests covering all system components
- `test/system_validation.exs` - 9 validation checks for core processes
- `scripts/prove/prove_entire_system.exs` - 10-component architecture validation
- `scripts/prove/prove_loop.exs` - Demonstrates the Ralph Wiggum loop processing

### Key Files

- `lib/cybernetic/vsm/supervisor.ex:1-26` - Root VSM supervisor starting all 5 systems
- `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:1-444` - Ralph Wiggum loop implementation with resilient polling
- `lib/cybernetic/health/monitor.ex:1-348` - Health monitoring service checking all VSM layers
- `lib/cybernetic/application.ex:1-296` - Application supervisor with health children configuration (lines 253-262)
- `test/test_production_comprehensive.exs:1-623` - Comprehensive 30-test production validation suite
- `lib/cybernetic/core/resilience/circuit_breaker_alerts.ex:1-300` - Circuit breaker alerting system
- `scripts/prove/prove_loop.exs:1-41` - Ralph Wiggum loop demonstration script

## Technical Considerations

### Dependencies

**Internal Modules to Integrate:**
- `Cybernetic.Health.Monitor` - Core health checking API
- `Cybernetic.VSM.System1-5.*` - All VSM system modules for status verification
- `Cybernetic.Core.Resilience.CircuitBreakerAlerts` - Provider health status
- `Cybernetic.Health.Collector` - Metrics aggregation
- `Cybernetic.Transport.InMemory` - Message transport for testing

**External Dependencies:**
- `:telemetry` - Event emission and monitoring
- AMQP/RabbitMQ - Message queue for inter-system communication
- Prometheus/Grafana - Metrics collection (optional for audit)

### Patterns to Follow

**Health Check Pattern** (from `lib/cybernetic/health/monitor.ex:193-221`):
```elixir
defp check_vsm_layers do
  layers = [:system1, :system2, :system3, :system4, :system5]
  # Check Process.whereis for each system
  # Return map of layer => :healthy | :down | :unhealthy
end
```

**Ralph Wiggum Loop Pattern** (from `lib/cybernetic/vsm/system1/agents/telegram_agent.ex:162-189`):
- Self-scheduling with `Process.send_after(self(), :poll_updates, delay)`
- Spawn supervised tasks with `spawn_link` for work
- Trap exits with `Process.flag(:trap_exit, true)`
- Exponential backoff on failures
- Health check timers for recovery

**Audit Script Pattern** (from `test/test_production_comprehensive.exs:15-123`):
- Group tests by category
- Use structured results: `{name, passed?, description}`
- Print detailed summary with pass/fail counts
- Return appropriate exit codes

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **VSM system not started** | High | Check application startup, verify supervisor tree before audit |
| **TelegramAgent polling dead** | Medium | Health check runs every 30s (line 276: `Process.send_after(self(), :check_health, 30_000)`), audit should check `last_poll_success` timestamp |
| **AMQP connection down** | High | Monitor emits `check_rabbitmq()` results (line 133), include in audit |
| **Circuit breaker open** | Medium | Alert system monitors provider health (line 80-89), check alert status |
| **Memory leak** | Low | Health monitor checks memory usage (line 267-281), include in report |
| **Test isolation issues** | Low | Use dedicated audit script, don't interfere with running system |

## Recommended Approach

Based on the research, the system audit and resilience check should be implemented as:

1. **Create a dedicated audit script** at `scripts/audit/system_resilience_audit.exs` that:
   - Starts the application if not running
   - Checks all 5 VSM systems via `Process.whereis/1`
   - Queries `Cybernetic.Health.Monitor.detailed_status()` for component health
   - Verifies TelegramAgent polling health (check `last_poll_success` from state)
   - Tests message flow through each system
   - Checks circuit breaker status via `Cybernetic.Core.Resilience.CircuitBreakerAlerts.get_alert_status()`
   - Generates a confidence report with pass/fail metrics

2. **Leverage existing validation scripts**:
   - Reuse test patterns from `test/test_production_comprehensive.exs`
   - Adapt VSM system checks from `lib/cybernetic/health/monitor.ex:check_vsm_layers/0`
   - Include telemetry events to track audit execution

3. **Confidence scoring**:
   - Calculate score based on: (VSM systems operational) + (TelegramAgent health) + (Circuit breakers closed) + (Infrastructure healthy)
   - Use thresholds: 90%+ = High Confidence, 70-90% = Medium, <70% = Low
   - Include detailed breakdown for each component

4. **Output format**:
   - Structured JSON for programmatic consumption
   - Human-readable report with emoji indicators (matching existing scripts)
   - Exit code 0 for healthy, 1 for degraded, 2 for critical

5. **Ralph Wiggum loop resilience testing**:
   - Inject test message to TelegramAgent
   - Monitor `polling_failures` counter
   - Verify exponential backoff is working
   - Check that `last_poll_success` is recent (<60 seconds)
   - Test crash recovery by sending abnormal exit signal

## Open Questions

1. **Audit frequency**: Should this be a one-time manual script or scheduled cron job? (Recommend: manual for now, can be automated later)

2. **Confidence threshold**: What score constitutes "operational" for production deployment? (Recommend: 90%+ for high confidence)

3. **Telegram bot token**: Does the audit require TELEGRAM_BOT_TOKEN to be set, or can it test without external dependencies? (Recommend: Test internal loop resilience even without token)

4. **Integration point**: Should this be integrated into CI/CD pipeline or standalone? (Recommend: Standalone script that can be called from CI)

5. **Reporting**: Store audit results in database or just console output? (Recommend: Console output + optional JSON export for dashboards)

## Implementation Notes

The audit can be implemented entirely using existing infrastructure - no new dependencies required. The main work is:
1. Creating the audit script (est. 200-300 lines)
2. Adding confidence scoring logic (est. 50 lines)
3. Formatting output report (est. 100 lines)

Total effort: 4-6 hours for full implementation with comprehensive reporting.
