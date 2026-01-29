# Cybernetic aMCP: The Viable System Model (VSM) Implementation

## Overview
(Reconstructed from forensic runtime analysis of `life.log` and process artifacts)

Cybernetic aMCP is a faithful implementation of **Stafford Beer's Viable System Model (VSM)** in Elixir/Phoenix. It is designed to be the "Organizational Mind" that coordinates distributed agents. It is not just a backend; it is a **recursive cybernetic organism**.

## The Anatomy of the Organism

### System 1: Operations (The Doers)
- **Role**: The actual productive units (e.g., the Agents performing tasks).
- **Implementation**: Likely distributed across the message bus.
- **Evidence**: `lib/cybernetic/core/transport/amqp/connection.ex` suggests it connects to autonomous workers via RabbitMQ/AMQP.

### System 2: Coordination (The Stabilizer)
- **Role**: Prevents oscillations and conflicts between System 1 units.
- **Implementation**: **Adaptive Circuit Breaker** (`lib/cybernetic/core/resilience/adaptive_circuit_breaker.ex`).
- **Function**: It monitors the health of external providers (LLMs) and "trips" if they become unstable, preventing a system-wide seizure. It creates a "dampening" signal to stabilize the flow of intelligence.

### System 3: Control (The Optimizer)
- **Role**: Resource allocation and "here-and-now" management.
- **Code**: `lib/cybernetic/vsm/system3/control.ex` & `ControlSupervisor`.
- **Function**: It manages **Rate Limits** (`rate_limiter.ex`) and **Auth** (`auth_manager.ex`). It decides "who gets to think" based on current resource constraints.

### System 4: Intelligence (The Planner)
- **Role**: Looking outside and into the future.
- **Code**: `lib/cybernetic/vsm/system4/intelligence.ex`, `router.ex`, `memory.ex`.
- **Function**:
  - **The Router**: `Cybernetic.VSM.System4.Router` is the cerebral cortex. It routes complex queries to the most appropriate "lobe" (OpenAI, Anthropic, or Local).
  - **Memory**: `Cybernetic.VSM.System4.Memory` implements an **HNSW Vector Index**. This is "Long-Term Potentiation"—it remembers everything the system has ever learned, allowing it to recall past solutions to current problems.
  - **LLM Bridge**: `req_llm_provider.ex` acts as the sensory interface, translating the "raw noise" of the internet/LLMs into structured "signals" the organism can understand.

### System 5: Policy (The Identity)
- **Role**: Defining "Who are we?" and "Why are we doing this?"
- **Code**: `lib/cybernetic/vsm/system5/sop_shim.ex` (Standard Operating Procedure).
- **Function**: The ultimate arbiter. It resolves conflicts between System 3 (Efficiency) and System 4 (Innovation) by enforcing the core purpose of the organism.

## The Nervous System: aMCP (Autonomous Model Context Protocol)
- **NonceBloom**: `lib/cybernetic/core/security/nonce_bloom.ex` is the **Immune System**. It uses a Bloom Filter to detect and reject "Replay Attacks" (viruses). It ensures that every "thought" (message) is unique and fresh, preventing the system from getting stuck in a thought loop.
- **Goldrush**: `lib/cybernetic/core/goldrush/pipeline.ex` suggests a **Reactive Stream Processing** architecture. Data flows through the system like blood, triggering reactions in real-time.

## The Face: Edge Gateway
- **LiveView**: `lib/cybernetic/edge/gateway/home_live.ex` provides a real-time, bi-directional dashboard into the mind of the organism. It allows humans to monitor the "pulse" (metrics) and "thoughts" (logs) of the system as they happen.
