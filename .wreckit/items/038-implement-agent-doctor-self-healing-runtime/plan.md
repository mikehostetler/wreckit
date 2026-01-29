# Implement The Agent Doctor (Self-Healing Runtime) Implementation Plan

## Implementation Plan Title
Implement The Agent Doctor (Self-Healing Runtime)

## Overview
Implement a recursive self-healing capability where the runtime can catch system errors (git locks, npm failures, invalid JSON) and spawn a specialized "Doctor Agent" to fix the environment and resume execution. This system will automatically detect recoverable errors during agent execution, apply targeted repairs, and retry with exponential backoff - all without manual intervention.

## Current State
The wreckit codebase has diagnostic and repair capabilities through `src/doctor.ts`, but these are currently manual CLI commands. The agent execution layers catch errors but only log them and mark items as failed, with no automatic recovery attempts.

**What exists:**
- Diagnostic system in `src/doctor.ts`
- Git mutex in `src/git/index.ts`
- FileLock with stale lock detection in `src/fs/lock.ts`
- Agent execution with AgentResult structure

**What's missing:**
- Automatic error detection during agent execution
- Automatic healing invocation
- Retry mechanism with exponential backoff

## Desired End State
The Agent Doctor system will provide:
1. Automatic Error Detection for git locks, npm failures, JSON corruption
2. Targeted Healing procedures applied based on error type
3. Intelligent Retry with exponential backoff
4. Full Audit Trail in `.wreckit/healing-log.jsonl`

## What We're NOT Doing
- NOT implementing LLM-based diagnosis (pattern matching only)
- NOT modifying core agent behavior
- NOT healing in parallel mode initially

## Implementation Approach
Layered architecture wrapping existing execution:
1. Error Detection Engine (`src/agent/errorDetector.ts`)
2. Healing Procedures Module (`src/agent/healer.ts`)
3. Self-Healing Runner Wrapper (`src/agent/healingRunner.ts`)
4. Orchestrator Integration (`src/commands/orchestrator.ts`)

---

## Phases

### Phase 1: Core Error Detection & Healing (MVP)
Implement the foundational error detection and healing infrastructure for git locks and npm failures.

#### Success Criteria
- [ ] Unit tests for error detector pass
- [ ] Git lock removal verified
- [ ] npm install healing verified

### Phase 2: Orchestrator Integration
Integrate the self-healing runner into the orchestrator for batch operations.

#### Success Criteria
- [ ] Batch execution uses healing runner
- [ ] --no-healing flag works

### Phase 3: JSON Corruption Recovery
Implement JSON validation and repair using the backup system.

#### Success Criteria
- [ ] Corrupt JSON files restored from backup

---

## Testing Strategy
- **Unit Tests:** Error detector pattern matching, healer procedures.
- **Integration Tests:** End-to-end healing flow (fail -> heal -> retry -> success).
- **Manual Testing:** Synthetic git locks and npm failures.

## Migration Notes
No data migration required. Config section `doctor` is optional.

## References
- Research: `.wreckit/items/038-implement-agent-doctor-self-healing-runtime/research.md`
- Doctor Module: `src/doctor.ts`