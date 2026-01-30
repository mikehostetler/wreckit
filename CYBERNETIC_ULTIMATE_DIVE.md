# Cybernetic aMCP: The Global Organism

## 1. The Core Philosophy
Cybernetic aMCP is an implementation of **Stafford Beer's Viable System Model (VSM)** designed for the age of autonomous agents. It treats a software project not as a folder of files, but as a **living organism** that must maintain stability while evolving in a complex environment.

## 2. The Five Systems of Cybernetic

### System 1: Operations (The Distributed Agents)
- **Primary Units**: Individual Wreckit task instances.
- **Trace**: `lib/cybernetic/core/transport/amqp/connection.ex`
- **Function**: The basic productive units. They perform the work (e.g., fixing bugs, adding features). Each unit is autonomous but connected via the AMQP message bus.

### System 2: Coordination (Resilience & Damping)
- **Primary Units**: Adaptive Circuit Breaker.
- **Trace**: `lib/cybernetic/core/resilience/adaptive_circuit_breaker.ex`
- **Function**: Prevents the agents from "seizing up." If an external provider (like the OpenAI API) becomes unstable, System 2 trips the breaker, coordinating a system-wide slowdown to prevent catastrophic failure.

### System 3: Control (Tactical Optimization)
- **Primary Units**: ControlSupervisor & RateLimiter.
- **Trace**: `lib/cybernetic/vsm/system3/control.ex`
- **Function**: Manages the "Here and Now." It handles **Auth** and **Rate Limiting**, ensuring that agents don't exceed their token budgets or interfere with each other's workspaces.

### System 4: Intelligence (The External Observer)
- **Primary Units**: Intelligence Router & Vector Memory.
- **Trace**: `lib/cybernetic/vsm/system4/router.ex` & `memory.ex`
- **Function**: The "Radar." It looks outside at the LLM ecosystem and into the system's own past (via **HNSW Vector Index**). It routes complex problems to the best intelligence "lobes" and retrieves past solutions to avoid reinventing the wheel.

### System 5: Policy (Identity & Ethos)
- **Primary Units**: SOPShim (Standard Operating Procedure).
- **Trace**: `lib/cybernetic/vsm/system5/sop_shim.ex`
- **Function**: The "High Command." It holds the Standard Operating Procedures. When System 3 (Operational efficiency) and System 4 (Innovative planning) conflict, System 5 provides the ultimate direction based on the project's core mission.

## 3. The "Wreckit Inside" Discovery
Cybernetic "has Wreckit inside" because it uses Wreckit's **Dreamer Agent** as its primary mechanism for **System 4 (Intelligence)**.
- Cybernetic provides the **VSM structure** (the brain).
- Wreckit provides the **Dreamer** (the curiosity) and the **Orchestrator** (the metabolism).
- Together, they form a **Closed Loop**: Cybernetic organizes the project's "life," while Wreckit "dreams" of ways to make that life better and then executes them in **Sprite VM sandboxes**.
