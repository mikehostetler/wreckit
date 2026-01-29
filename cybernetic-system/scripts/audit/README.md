# System Resilience Audit

This directory contains audit scripts for verifying the operational status and resilience of the Cybernetic AMCP system.

## System Resilience Audit (`system_resilience_audit.exs`)

A comprehensive audit that verifies:
- All 5 VSM systems (S1-S5) are operational
- Ralph Wiggum loops (TelegramAgent) are resilient
- Infrastructure components are healthy
- Provides a confidence report with scoring

### Usage

#### Against Running System
```bash
# Make sure the Cybernetic application is running first
iex -S mix
# In another terminal:
mix run scripts/audit/system_resilience_audit.exs
```

#### Standalone Mode (Minimal)
```bash
# Runs audit in minimal test mode (no external dependencies)
MIX_ENV=test mix run scripts/audit/system_resilience_audit.exs
```

### Exit Codes
- `0` - HIGH confidence (90%+) - All systems operational
- `1` - MEDIUM confidence (70-90%) - Some degradation detected
- `2` - LOW confidence (<70%) - Critical issues detected

### What It Checks

#### VSM Systems Audit
- ✅ S1 Operations (Cybernetic.VSM.System1.Operational)
- ✅ S2 Coordination (Cybernetic.VSM.System2.Coordinator)
- ✅ S3 Control (Cybernetic.VSM.System3.Control)
- ✅ S4 Intelligence (Cybernetic.VSM.System4.Service)
- ✅ S5 Policy (Cybernetic.VSM.System5.Policy)

#### Ralph Wiggum Loops Audit
- TelegramAgent polling health
- Polling failures counter
- Time since last successful poll
- Exponential backoff mechanism
- Crash recovery (exit trapping)
- Health monitoring timer

#### Infrastructure Audit
- RabbitMQ connectivity
- Redis connectivity
- Disk space usage
- Memory usage

#### Circuit Breakers Audit
- Active circuit breaker alerts
- Provider health states
- Circuit breaker status (open/closed)

### Confidence Scoring

The confidence score is calculated as a weighted average:

| Category | Weight | Description |
|----------|--------|-------------|
| VSM Systems | 40% | All 5 systems operational |
| Ralph Wiggum Loops | 30% | Polling active and healthy |
| Infrastructure | 20% | Critical services available |
| Circuit Breakers | 10% | No active alerts |

### Sample Output

```
======================================================================
🔍 CYBERNETIC AMCP SYSTEM RESILIENCE AUDIT
======================================================================
Verifying VSM systems, Ralph Wiggum loops, and infrastructure health

Cybernetic application detected locally

📊 VSM SYSTEMS AUDIT
----------------------------------------------------------------------
  ✅ S1 Operations: UP - Running
  ✅ S2 Coordination: UP - Running
  ✅ S3 Control: UP - Running
  ✅ S4 Intelligence: UP - Running
  ✅ S5 Policy: UP - Running

  Summary: 5/5 systems operational

🔄 RALPH WIGGUM LOOPS AUDIT
----------------------------------------------------------------------
  ✅ TelegramAgent: UP - Polling healthy
     └─ Polling Failures: 0
     └─ Last Success: 2025-01-22 09:30:15Z
     └─ Time Since Success: 3s
  ✅ Polling Active: Yes

  Resilience Mechanisms:
    ✅ Exponential backoff: Backoff logic verified (0:2000ms, 1:4000ms, 2:8000ms)
    ✅ Crash recovery: Exit trapping enabled (crash recovery active)
    ✅ Health monitoring: Health check state tracking present

  Summary: 3/3 resilience checks passed

🏗️  INFRASTRUCTURE AUDIT
----------------------------------------------------------------------
  ✅ RabbitMQ: HEALTHY
  ✅ Redis: HEALTHY
  ✅ Disk Space: HEALTHY
  ✅ Memory Usage: HEALTHY

  Summary: 4/4 infrastructure components healthy

⚡ CIRCUIT BREAKERS AUDIT
----------------------------------------------------------------------
  Active Alerts: 0

  Summary: All circuits closed

======================================================================
📈 CONFIDENCE REPORT
======================================================================

  Overall Confidence: 100% 🟢 HIGH
  ┌─ VSM Systems: PASS
  ├─ Ralph Wiggum Loops: PASS
  ├─ Infrastructure: PASS
  └─ Circuit Breakers: PASS

  Breakdown:
  • VSM Systems: 5/5 operational
  • Ralph Wiggum: 3/3 checks passed
  • Infrastructure: 4/4 healthy
  • Circuit Breakers: 0 active alerts

  ✅ All systems operational - no action required

======================================================================

✅ Audit passed with HIGH confidence
```

### Integration with CI/CD

The audit script can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run System Audit
  run: |
    MIX_ENV=test mix run scripts/audit/system_resilience_audit.exs
  # Exit codes can be used to fail the pipeline
```

### Troubleshooting

#### "Cybernetic application is not running"
- Start the application first: `iex -S mix` or `mix start`
- Or use test mode: `MIX_ENV=test mix run scripts/audit/system_resilience_audit.exs`

#### "VSM systems are down"
- Check supervisor logs for crash reasons
- Verify configuration is correct
- Ensure required dependencies (RabbitMQ, Redis) are running

#### "TelegramAgent polling is degraded"
- Verify TELEGRAM_BOT_TOKEN is set
- Check network connectivity to Telegram API
- Review polling failures in logs
