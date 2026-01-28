# Polymarket Aggregator Implementation Specification

This specification addresses a critical data integrity bug in the order reconciler, deploys a Redis-backed async price cache with monitoring, completes backend integrations for Helius and Oracle, implements proxy wallet authentication, and updates project documentation.

## Tickets

### T-001: Fix order reconciliation logic in reconciler.ts

1. Open `src/polymarket/reconciler.ts`. 2. Locate the unimplemented TODO comment. 3. Analyze the surrounding code to understand the expected data structure for order states and filled quantities. 4. Implement the logic to correctly calculate filled quantities based on order updates. 5. Ensure the logic handles edge cases such as partial fills and order cancellations. 6. Remove the TODO comment.

**Files likely changed:**
- src/polymarket/reconciler.ts

**Testing:** Write unit tests that mock order updates to verify filled quantities are calculated accurately. Run the test suite to ensure no regressions.

### T-002: Deploy and monitor async price cache (PR #156)

1. Verify that PR #155 is merged into the main branch. 2. Review the code for PR #156 to ensure the Redis-backed cache (30s TTL, 15s background update) is correctly implemented. 3. Verify the `PRICES_ENABLED` kill switch logic. 4. Ensure the `/v1/prices/health` endpoint is implemented and returns the correct status. 5. Define and implement the fallback behavior for when Redis is unavailable. 6. Prepare deployment scripts for production.

**Files likely changed:**
- src/prices/cache.ts
- src/prices/health.ts
- docker-compose.yml
- .env.example

**Testing:** Deploy to staging first. Hit `/v1/prices/health` to confirm status. Simulate a Redis connection failure to verify fallback behavior. Monitor logs to ensure CLOB API calls are concurrency-limited.

### T-003: Update agent.md with market progress

1. Open `agent.md`. 2. Create or update sections for 'Creator Flow', 'Liquidity Seeding', and 'Price Action Markets'. 3. Fill in the current status and progress for each section based on the project context. 4. Ensure the tone is consistent with existing documentation.

**Files likely changed:**
- agent.md

**Testing:** Review the document to ensure all requested updates are present and accurately reflect the current state.

### T-004: Complete Helius and Oracle integration

1. Review the handoff documentation to identify the specific integration points. 2. Locate the Helius module and integrate it into the market creation flow. 3. Locate the Oracle module and integrate it into the market creation flow. 4. Ensure data flows correctly between the modules during the market creation process.

**Files likely changed:**
- src/market/creation/flow.ts
- src/integrations/helius.ts
- src/integrations/oracle.ts

**Testing:** Perform an end-to-end test of the market creation flow to verify that both Helius and Oracle modules function correctly within the pipeline.

### T-005: Implement proxy wallet authentication

1. Open `src/polymarket/client.ts`. 2. Find the TODO comment regarding proxy wallet support. 3. Implement the necessary authentication logic to support proxy wallets (likely involving header forwarding or specific signing logic). 4. Remove the TODO comment.

**Files likely changed:**
- src/polymarket/client.ts

**Testing:** Test the authentication flow using a proxy wallet to ensure successful connection and request handling.

### T-006: Add synthesis test note

1. Identify the designated location for synthesis test notes (likely a test directory or specific documentation file). 2. Add the requested test note.

**Files likely changed:**
- tests/synthesis/notes.md

**Testing:** Verify the note appears in the correct location.

## Checklist

[ ] T-001: Investigate and define reconciliation logic for unimplemented TODO
[ ] T-001: Implement missing reconciliation logic in reconciler.ts
[ ] T-001: Verify filled quantities are calculated correctly
[ ] T-001: Add unit tests for reconciliation logic
[ ] T-002: Verify PR #155 is merged
[ ] T-002: Deploy PR #156 to production
[ ] T-002: Confirm /v1/prices/health returns healthy status
[ ] T-002: Document and test Redis failure fallback behavior
[ ] T-002: Monitor logs for concurrency-limited CLOB API calls
[ ] T-003: Document status of creator flow in agent.md
[ ] T-003: Document status of liquidity seeding in agent.md
[ ] T-003: Document general progress on price action markets in agent.md
[ ] T-004: Integrate Helius module into market creation flow
[ ] T-004: Integrate Oracle module into market creation flow
[ ] T-004: Verify end-to-end functionality of integrated flow
[ ] T-005: Remove TODO comment from src/polymarket/client.ts
[ ] T-005: Implement proxy wallet authentication logic
[ ] T-005: Test authentication flow
[ ] T-006: Add test note to designated location