# Scripts Directory

Collection of utility scripts for testing, validation, and demonstration of the Cybernetic aMCP Framework.

## 📁 Directory Structure

```
scripts/
├── demo/           # Feature demonstrations
├── prove/          # System validation proofs
└── test/           # Integration and unit tests
```

## 🎯 Demo Scripts

Showcase system capabilities and features:

- `demo_policy_intelligence.exs` - S5 Policy Intelligence demonstrations
- `demo_s4_routing.exs` - Intelligent routing between AI providers

## ✅ Prove Scripts

Validate system components and deployment:

- `prove_entire_system.exs` - Complete system validation
- `prove_deployment.exs` - Deployment verification
- `prove_circuit_breaker_system.exs` - Circuit breaker validation
- `prove_telegram_vao.exs` - Telegram bot integration proof
- `prove_reactive_system.exs` - Reactive system validation

## 🧪 Test Scripts

Integration and functional tests:

- `test_integration.exs` - Full integration test suite
- `test_health.exs` - Health monitoring tests
- `test_telemetry_flow.exs` - Telemetry pipeline validation
- `test_s4_circuit_breaker.exs` - S4 circuit breaker tests
- `verify_deployment.exs` - Deployment verification
- `verify_final.exs` - Final system validation

## 🚀 Usage

```bash
# Run a demo script
mix run scripts/demo/demo_s4_routing.exs

# Validate the entire system
mix run scripts/prove/prove_entire_system.exs

# Run integration tests
mix run scripts/test/test_integration.exs
```

## 📝 Notes

- All scripts use the Elixir Mix environment
- Ensure RabbitMQ and required services are running
- Set required environment variables (API keys) before running provider tests