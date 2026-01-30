# Planning Complete: Fix Telegram Reflex Arc

**Date:** 2025-01-29
**Item:** 031-fix-telegram-reflex-arc
**Status:** Ready for Implementation

## Summary

The planning phase is complete. The research findings have been validated through code analysis, and a comprehensive implementation plan has been created with 9 structured user stories.

## Root Cause Confirmed

The Telegram Reflex Arc is broken because:
- ✅ TelegramAgent successfully publishes messages to `cyb.commands` exchange with `s4.reason` routing key
- ✅ Messages arrive in `cyb.s4.llm` queue (bound to `s4.*`)
- ❌ **No AMQP consumer listens on `cyb.s4.llm` queue**
- ❌ Messages accumulate unconsumed, no response ever sent to TelegramAgent

## Key Discoveries

1. **S4 Service Exists:** `Cybernetic.VSM.System4.Service` provides intelligent LLM provider routing
2. **Response Handler Exists:** TelegramAgent has `handle_info({:s4_response, ...})` handler but it's never triggered
3. **Generic Consumer Doesn't Help:** Existing consumer reads from `cyb.consumer` queue, not `cyb.s4.llm`
4. **Topology is Correct:** Queue bindings are properly configured, messages just need a consumer

## Implementation Approach

**Minimal, Focused Fix:**
- Create new `Cybernetic.VSM.System4.AMQPConsumer` module
- Consumer listens on existing `cyb.s4.llm` queue
- Routes to `Cybernetic.VSM.System4.MessageHandler`
- Sends responses back to TelegramAgent using correlation ID
- Add consumer to application supervisor

**Why This Approach:**
- Zero risk to existing functionality (new module)
- Follows established patterns (based on generic Consumer)
- Testable (can unit test independently)
- Rollback ready (can disable without breaking other systems)

## User Stories

**Priority 1 (Must Have):**
- US-001: Create S4 AMQP Consumer module
- US-002: Implement message processing logic
- US-004: Register consumer in Application Supervisor

**Priority 2 (Important):**
- US-003: Format responses for Telegram
- US-005: Add timeout handling
- US-007: Write unit tests
- US-008: Write integration test
- US-009: Manual testing and verification

**Priority 3 (Nice to Have):**
- US-006: Add telemetry

## What's NOT Being Done

Explicitly out of scope to keep this change focused:
- Modifying existing AMQP Consumer
- Changing AMQP topology
- Implementing new response protocols
- Adding LLM integration (use existing S4 Service)
- Modifying TelegramAgent (it already works)
- Performance optimizations

## Next Steps

1. **Phase 1:** Implement US-001, US-002, US-003, US-004 (core functionality)
2. **Phase 2:** Implement US-005, US-006 (error handling and telemetry)
3. **Testing:** Implement US-007, US-008, US-009 (verification)

## Success Criteria

**Functional:**
- Telegram message "hi" → Response within 2 seconds
- Complete message flow in logs: S1 → AMQP → S4 → S1
- Zero unconsumed messages in `cyb.s4.llm` queue

**Technical:**
- All tests pass
- No compiler warnings
- Consumer restarts automatically on failure
- No memory leaks from pending responses

## Files Created

1. **plan.md** - Detailed implementation plan with phases, code samples, and verification steps
2. **prd.json** - Structured user stories with acceptance criteria (saved via wreckit system)

## Ready to Implement

All research complete. All decisions made. All open questions resolved.

The plan is clear, focused, and ready for implementation.
