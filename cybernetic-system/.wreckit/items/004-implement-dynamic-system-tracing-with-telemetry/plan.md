# Implement Dynamic System Tracing with :telemetry Implementation Plan

## Implementation Plan Title
Implement Dynamic System Tracing with :telemetry

## Overview
This implementation adds **dynamic execution tracing** to capture runtime call patterns that static analysis cannot detect, particularly around dynamic dispatch in VSM message handlers and cross-system communication via AMQP.

## Current State
The system has telemetry infrastructure but lacks dynamic tracing capabilities.

## Desired End State
A dynamic tracing system that captures runtime execution flow, correlates disjoint events, and outputs JSON compatible with static analysis.

## Phases

### Phase 1: Core Infrastructure - Dynamic Collector
Create the `Cybernetic.Archeology.DynamicCollector` GenServer.

### Phase 2: Instrumentation - Add Span Wrappers
Wrap VSM message handlers and internal bridges with `:telemetry.span/3`.

### Phase 3: Event Attachment - HTTP and AMQP Entry Points
Attach to existing Phoenix and AMQP telemetry events.

### Phase 4: Mix Task and Synthetic Traffic Generation
Create `Mix.Tasks.Cyb.Trace` task.

## What We're NOT Doing
- NOT Persisting Traces to Database
- NOT Tracing Database Queries
- NOT Running in Production

## Implementation Approach
Phased approach building core infrastructure first, then instrumentation, then event attachment, and finally the mix task.

## Testing Strategy
Unit tests for collector, integration tests for VSM handlers, and manual testing with synthetic traffic.

## References
- Research: `.wreckit/items/004-implement-dynamic-system-tracing-with-telemetry/research.md`