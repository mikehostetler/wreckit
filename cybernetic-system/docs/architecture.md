# System Architecture

## Viable System Model (VSM)

The Cybernetic aMCP Framework implements Stafford Beer's Viable System Model, a cybernetic approach to organizational structure that ensures viability and adaptability.

### VSM Layers

#### System 1: Operations
- **Purpose**: Handle day-to-day operational tasks
- **Components**: 
  - Telegram bot agent
  - Task execution
  - Basic request handling
- **Location**: `lib/cybernetic/vsm/system1/`

#### System 2: Coordination
- **Purpose**: Prevent conflicts and ensure harmony between operations
- **Components**:
  - Load balancing
  - Resource allocation
  - Conflict resolution
- **Location**: `lib/cybernetic/vsm/system2/`

#### System 3: Control
- **Purpose**: Manage resources and optimize performance
- **Components**:
  - Rate limiting
  - Circuit breakers
  - Resource monitoring
- **Location**: `lib/cybernetic/vsm/system3/`

#### System 4: Intelligence
- **Purpose**: Environmental scanning and strategic intelligence
- **Components**:
  - AI provider routing
  - LLM integration
  - Pattern recognition
- **Location**: `lib/cybernetic/vsm/system4/`

#### System 5: Policy
- **Purpose**: Strategic direction and governance
- **Components**:
  - Policy enforcement
  - SOP management
  - Strategic decisions
- **Location**: `lib/cybernetic/vsm/system5/`

## Message Flow

```
User Request → S1 (Operations)
     ↓
S2 (Coordination) ← checks conflicts
     ↓
S3 (Control) ← applies rate limits
     ↓
S4 (Intelligence) ← routes to AI
     ↓
S5 (Policy) ← applies governance
     ↓
Response → User
```

## Technology Stack

### Core Technologies
- **Language**: Elixir/Erlang OTP
- **Message Queue**: RabbitMQ (AMQP)
- **State Management**: CRDTs
- **Telemetry**: OpenTelemetry
- **Metrics**: Prometheus + Grafana

### AI Providers
- Anthropic Claude
- OpenAI GPT
- Together AI
- Ollama (local)

### Infrastructure
- Docker/Docker Compose
- Kubernetes
- PostgreSQL
- Redis