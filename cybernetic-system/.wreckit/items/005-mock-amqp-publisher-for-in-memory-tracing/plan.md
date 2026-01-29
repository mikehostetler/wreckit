# Mock AMQP Publisher for In-Memory Tracing Implementation Plan

## Implementation Plan Title
Mock AMQP Publisher for In-Memory Tracing

## Overview
Implement a Mock AMQP Publisher GenServer that enables full dynamic tracing of VSM system message flows without requiring external RabbitMQ infrastructure.

## Current State
When `minimal_test_mode` is enabled, VSM message handlers crash because the AMQP Publisher is not started.

## Desired End State
A trace task that runs without crashes and produces complete traces of inter-system communication.

## Phases

### Phase 1: Create Mock Publisher GenServer
Create `Cybernetic.Archeology.MockPublisher` that registers as the AMQP publisher.

### Phase 2: Integrate with Mix.Tasks.Cyb.Trace
Update the trace task to start the mock publisher.

### Phase 3: Verify Full Message Flow Tracing
Verify end-to-end tracing works without crashes.

## What We're NOT Doing
- Replacing the real AMQP publisher in production
- Modifying the existing AMQP publisher implementation

## Implementation Approach
Create a "pass-through" GenServer that intercepts publish calls and synchronously dispatches them to target handlers.

## Testing Strategy
Unit tests for routing logic and integration tests for the full trace flow.

## References
- Research: `.wreckit/items/005-mock-amqp-publisher-for-in-memory-tracing/research.md`