# Cybernetic aMCP: The Viable System Model Framework

## Core Identity
Cybernetic aMCP is an Elixir/Phoenix application that implements Stafford Beer's **Viable System Model (VSM)** to create a resilient, autonomous intelligence framework. It serves as the "nervous system" for distributed agents.

## Forensic Architecture Reconstruction
(Reconstructed from runtime logs and forensic traces)

### 1. The VSM Structure (The Body)
The system is explicitly organized into VSM subsystems:
- **System 3 (Control/Optimization)**:
  - `Cybernetic.VSM.System3.Control`
  - `Cybernetic.VSM.System3.ControlSupervisor`
  - Purpose: Manages resource allocation, rate limiting (`RateLimiter`), and operational stability.
- **System 4 (Intelligence/Planning)**:
  - `Cybernetic.VSM.System4.Intelligence`
  - `Cybernetic.VSM.System4.Router`
  - `Cybernetic.VSM.System4.Memory`
  - Purpose: Looks outward. Connects to LLMs (`OpenAI`, `ReqLLMProvider`), manages long-term memory (HNSW Vector Index), and plans future actions.
- **System 5 (Policy/Identity)**:
  - `Cybernetic.VSM.System5.SOPShim` (Standard Operating Procedure)
  - Purpose: Defines the ultimate goals and identity of the system.

### 2. The Nervous System (Transport & Resilience)
- **aMCP (Autonomous Model Context Protocol)**:
  - Implemented via `Cybernetic.Core.MCP`.
  - Transports: Uses `AMQP` (RabbitMQ) for asynchronous messaging between subsystems (`Cybernetic.Transport.AMQP`).
  - **NonceBloom**: A specialized security module (`Cybernetic.Core.Security.NonceBloom`) that prevents replay attacks on the message bus, ensuring message integrity.
  - **Adaptive Circuit Breaker**: (`Cybernetic.Core.Resilience.AdaptiveCircuitBreaker`) A sophisticated resilience mechanism that protects external dependencies (like LLM APIs) from overload.

### 3. The Edge (Interface)
- **Phoenix LiveView**: The system has a visual dashboard.
  - `Cybernetic.Edge.Gateway.HomeLive`: The main control interface.
  - `Cybernetic.Edge.Gateway.Endpoint`: The HTTP/WebSocket entry point.
- **Goldrush**: (`Cybernetic.Core.Goldrush.Pipeline`) A reactive stream processing engine, likely used for real-time data ingestion and event handling.

### 4. Integration
It integrates with external AI providers (`OpenAI`) and uses `ReqLLMProvider` as a flexible HTTP client for various LLM APIs. It features a `CodeAnalysisTool` and `DatabaseTool`, suggesting it can introspect and modify code/data.

---

## Key Reconstructed Files
- `lib/cybernetic/vsm/system4/router.ex`: The central intelligence router.
- `lib/cybernetic/core/resilience/adaptive_circuit_breaker.ex`: The stability engine.
- `lib/cybernetic/core/security/nonce_bloom.ex`: The immune system.
- `lib/cybernetic/edge/gateway/home_live.ex`: The face of the system.
