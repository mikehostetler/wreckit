System archeology for cybernetic_amcp. No opinions, only traces.

PHASE 1 - Entry points:
HTTP/WS | lib/cybernetic/edge/gateway/endpoint.ex | Phoenix Endpoint
LiveView | lib/cybernetic/edge/gateway/home_live.ex | HomeLive
AMQP | lib/cybernetic/core/transport/amqp/connection.ex | AMQP Connection
LLM Provider | lib/cybernetic/vsm/system4/providers/req_llm_provider.ex | ReqLLMProvider
LLM Provider | lib/cybernetic/vsm/system4/providers/openai.ex | OpenAI Provider

PHASE 2 - Traces (reconstructed from runtime logs):
lib/cybernetic/edge/gateway/home_live.ex:7 (render) -> lib/cybernetic/edge/gateway/home_live.ex:397 -> lib/cybernetic/vsm/system4/providers/req_llm_provider.ex:161
lib/cybernetic/vsm/system4/router.ex:142 (select_chain_by_kind) -> lib/cybernetic/vsm/system4/service.ex:188 (get_provider_order) -> lib/cybernetic/core/resilience/adaptive_circuit_breaker.ex (get_state)
lib/cybernetic/core/transport/amqp/connection.ex -> lib/cybernetic/transport/amqp.ex

PHASE 3 - Shared modules:
lib/cybernetic/vsm/system4/router.ex (Tracing: HomeLive, Service calls)
lib/cybernetic/core/resilience/adaptive_circuit_breaker.ex (Tracing: Provider selection, System4 Router)
lib/cybernetic/core/security/nonce_bloom.ex (Tracing: Message validation, Security)

PHASE 4 - Orphans (Potential):
lib/cybernetic/archeology/overlay.ex (Only seen in file listings, not in active traces)
lib/cybernetic/core/crdt/graph_queries.ex (Only seen in file listings, not in active traces)
