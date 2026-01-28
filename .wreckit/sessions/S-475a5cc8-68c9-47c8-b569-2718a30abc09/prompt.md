You are an AI coding agent working on the repository `nomnom-markets/polymarket-aggregator`. Your task is to implement the changes defined in the attached specification.

**Priority Order:**
1. **Critical:** T-001 (Fix order reconciliation logic). This is a blocker for other tasks.
2. **High:** T-002 (Deploy async price cache). Ensure dependencies (PR #155) are met.
3. **Medium:** T-004 (Helius/Oracle integration) and T-003 (Documentation).
4. **Low:** T-005 (Proxy wallet) and T-006 (Test note).

**General Instructions:**
- Read the existing codebase thoroughly before making changes, especially for T-001 and T-004.
- For T-002, focus on the configuration and health check implementation; ensure the Redis fallback logic is robust.
- Write clean, commented code following the existing style conventions.
- Add unit tests for T-001 to prevent regression.
- Commit your changes with clear messages referencing the Ticket IDs (e.g., 'Fix T-001: Implement reconciliation logic').