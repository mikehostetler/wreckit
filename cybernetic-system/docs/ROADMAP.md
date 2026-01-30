# Roadmap

Source: `blackbox_roadmap_with_backlog.json`. Phases reflect delivery priority. Update with `python3 scripts/roadmap/generate.py`.

## Now
- Replay Protection at Edge — In Progress
  - NonceBloom + TTL; counters exported. DoD: Duplicate/non-fresh blocked; replay_rejects_total visible.
- Telegram Agent → Webhook + RBAC — In Progress
  - Allow-list admin chat IDs; per-chat rate-limit; audit commands. DoD: Commands throttled; audit offset returned.
- Admin Console (Read-Only) — To Do
  - Routes: /admin/overview, /admin/traffic, /admin/audit. DoD: LiveView charts, trace link & envelope drill-down.
- aMCP Envelope v1 — To Do
  - Struct: %Envelope{id, tenant, causal_id, nonce, ts, schema_v, priority, policy_ref}. Fns: validate/1, sign/verify. DoD: schema_v gated.
- GoldRush Rules (Shadow Mode) — To Do
  - Rules: burst_traffic, refusal_spike, cost_anomaly. DoD: FP/FN stats recorded; no mutations.
- k6/Artillery Harness — To Do
  - Scenarios: hit-heavy, miss-heavy, mixed @100rps. DoD: SLO gates wired into CI.
- LLM SOP Drafts — To Do
  - Batch telemetry → prompt LLM → SOP.Draft persisted. DoD: One incident summarized into a stored draft.
- Phoenix Edge Gateway — To Do
  - API: POST /v1/generate, GET /v1/events (SSE), POST /telegram/webhook. Guards: OIDC, tenant, rate-limit, circuit-break, quotas. DoD: TLS 1.3; Prom metrics.
- Tamper-Evident Audit — To Do
  - Append-only JSONL + rolling prev_hash; daily anchor record. CLI verify. DoD: Any range verifies; admin actions emit proof.

## Next
- CAIL.CID + IPFS Bridge — To Do
  - API: put/1 -> cid, get/1, pin/unpin, stat, verify/2. DoD: Test vectors pass.
- CAIL.Provenance (Merkle-DAG) — To Do
  - API: link(child, parents, meta), verify_path/2. DoD: Random DAGs verify; lineage retrievable.
- CEP → Workflow Hooks — To Do
  - Behaviour: Workflow.run(playbook, ctx). DoD: Shadow→Active toggle; playbook executes.
- Cross-Surface Memory — To Do
  - Contract: conversation_cid per user/session. DoD: Telegram recall via CID; admin detail shows memory.
- Deterministic Cache @ Edge — To Do
  - Keys: model+params_hash+input_hash. API: get/put/invalidate, prefetch. DoD: Hit-ratio chart.
- Zombie Detection & Drain — To Do
  - Gossip heartbeat, suspect after N misses. DoD: Auto-drain suspect nodes; log visible.

## Later
- BeliefSet (Delta-CRDT) — To Do
  - Types: notes/tasks/policies; decay & confidence. DoD: Multi-node convergence metric shown.
- HNSW ANN — To Do
  - API: upsert/2, search/3; concurrent insert/search. DoD: p95 & recall targets met.
- Live Stream Relay (Astro Demo) — To Do
  - RTMP/WebRTC ingest → media.ingest events; Telegram announces. DoD: Start/stop events visible.
- Policy → WASM Pipeline — To Do
  - Spec → wasm_module; served at /policies/:id.wasm; SSE install. DoD: One policy live in client; telemetry round-trip.
- Quantizer (PQ/VQ) — To Do
  - API: fit/1, encode/1, decode/1; recall/storage knobs. DoD: Recall@10 target met.
- Rules Catalog & Marketplace — To Do
  - Export/import packs; signed bundles. DoD: Pack moves between envs with signatures verified.
- SDKs (Elixir/Rust/JS) — To Do
  - Envelope helpers, signing, SSE client, retry/backoff. DoD: Quickstart works in CI.
- Twitter Spaces Bridge (MVP) — To Do
  - Schedule/announce via API; join link stored. DoD: Admin + Telegram show live Spaces link.

