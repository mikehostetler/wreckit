# Research: [DREAMER] Remove deprecated legacy agent APIs

**Date**: 2025-01-27
**Item**: 069-dreamer-remove-deprecated-legacy-agent-apis

## Research Question
Deprecated agent APIs accumulate in the codebase, increasing cognitive load and potential for bugs. Users may unknowingly use legacy APIs, and developers must maintain compatibility layers.

**Motivation:** Removing deprecated APIs simplifies the codebase, reduces maintenance burden, and ensures all users are on the modern kind-based agent configuration system. This aligns with the completed Item 066 (dogfood-rlm-comprehensive-refactor) which noted these deprecations.

**Success criteria:**
- Audit all usages of deprecated functions in codebase and tests
- Replace all runAgent() calls with runAgentUnion()
- Replace all getAgentConfig() calls with getAgentConfigUnion()
- Remove deprecated type definitions (AgentConfig, RunAgentOptions)
- Update any documentation that references legacy APIs

**Technical constraints:**
- Must ensure all test files are updated
- Cannot break external consumers if any exist
- Should verify no runtime usages remain before removal

**In scope:**
- src/agent/runner.ts deprecated exports
- src/agent/index.ts re-exports of deprecated APIs
- Update internal usages in commands/ and workflow/
**Out of scope:**
- Breaking changes to public APIs used by external tools
- Changes to AgentConfigUnion or modern APIs

**Signals:** priority: medium, urgency: Technical debt cleanup - aligns with refactor milestone

## Summary

The codebase has successfully migrated to the modern discriminated union-based agent API system. **All internal code is already using the new APIs** (`runAgentUnion()` and `getAgentConfigUnion()`). The deprecated legacy APIs (`runAgent()`, `getAgentConfig()`, `AgentConfig`, `RunAgentOptions`) remain exported for backward compatibility but are **not used anywhere in the codebase**.

This cleanup task is straightforward: the deprecated exports can be safely removed from `src/agent/runner.ts` and `src/agent/index.ts`, along with their supporting functions (`simulateMockAgent`, `runLegacyProcessAgent`). The generated API documentation at `docs/api/agent/runner/` will need to be regenerated after removal.

## Current State Analysis

### Existing Implementation

The agent runner system maintains two parallel APIs:

1. **Modern API (Preferred)** - Already in use throughout the codebase
   - `runAgentUnion()` - Type-safe discriminated union dispatch (lines 352-498)
   - `getAgentConfigUnion()` - Direct config accessor (lines 92-94)
   - `AgentConfigUnion` - Kind-based configuration from schemas
   - `UnionRunAgentOptions` - Modern options interface

2. **Legacy API (Deprecated)** - Not used internally, kept for backward compatibility
   - `runAgent()` - Legacy mode-based dispatch (lines 190-256)
   - `getAgentConfig()` - Legacy config converter (lines 114-138)
   - `AgentConfig` - Mode-based interface (lines 32-39)
   - `RunAgentOptions` - Legacy options interface (lines 57-70)
   - Supporting functions: `simulateMockAgent()` (lines 140-170), `runLegacyProcessAgent()` (lines 263-288)

**Current deprecation status:**
- `src/agent/index.ts` clearly labels legacy exports as `@deprecated` with migration guidance
- All internal code uses the modern API
- Item 066 research confirms the migration was completed

### Key Files

**Deprecated API definitions:**
- `src/agent/runner.ts:32-39` - `AgentConfig` interface (deprecated)
- `src/agent/runner.ts:57-70` - `RunAgentOptions` interface (deprecated)
- `src/agent/runner.ts:114-138` - `getAgentConfig()` function (deprecated)
- `src/agent/runner.ts:140-170` - `simulateMockAgent()` helper (legacy-only)
- `src/agent/runner.ts:190-256` - `runAgent()` function (deprecated)
- `src/agent/runner.ts:263-288` - `runLegacyProcessAgent()` helper (legacy-only)

**Re-exports of deprecated APIs:**
- `src/agent/index.ts:38-56` - Re-exports all deprecated functions and types with `@deprecated` JSDoc comments

**Modern API (unchanged):**
- `src/agent/runner.ts:92-94` - `getAgentConfigUnion()` function
- `src/agent/runner.ts:294-309` - `UnionRunAgentOptions` interface
- `src/agent/runner.ts:352-498` - `runAgentUnion()` function
- `src/agent/index.ts:7-12` - Re-exports modern API functions

**Schema definitions (unchanged):**
- `src/schemas.ts:37-79` - `AgentConfigUnion` discriminated union schema
- `src/schemas.ts:319-325` - TypeScript type exports for all agent configs

**Internal usage (already migrated):**
- `src/workflow/itemWorkflow.ts:42` - Imports `runAgentUnion` and `getAgentConfigUnion`
- `src/workflow/itemWorkflow.ts:308, 496, 711, 809, 1337` - Uses `getAgentConfigUnion(config)`
- `src/workflow/itemWorkflow.ts:350, 532, 716, 810, 1338` - Uses `runAgentUnion({ config: agentConfig, ... })`
- `src/agent/dispatcher.ts` - Uses modern `dispatchAgent()` with `AgentConfigUnion`
- `src/commands/run.ts` - No direct agent API usage (delegates to workflow)
- `src/commands/orchestrator.ts` - No direct agent API usage (delegates to workflow)

**Generated documentation:**
- `docs/api/agent/runner/README.md` - API index listing both legacy and modern functions
- `docs/api/agent/runner/interfaces/AgentConfig.md` - Deprecated type docs
- `docs/api/agent/runner/interfaces/RunAgentOptions.md` - Deprecated type docs
- `docs/api/agent/runner/functions/runAgent.md` - Deprecated function docs
- `docs/api/agent/runner/functions/getAgentConfig.md` - Deprecated function docs

**Verification results:**
- ✅ No `runAgent(` calls found in source code
- ✅ No `getAgentConfig(` calls found in source code
- ✅ No `AgentConfig` type usage found in source code
- ✅ No `RunAgentOptions` type usage found in source code
- ✅ All test files use modern APIs (verified via grep)

## Technical Considerations

### Dependencies

**Internal dependencies:**
- Modern API uses `AgentConfigUnion` from `src/schemas.ts` (no changes needed)
- `runAgentUnion()` dispatches to individual SDK runners (no changes needed)
- Workflow system already migrated to modern API (no changes needed)

**External dependencies:**
- The CLI exports these functions in `dist/` via `package.json` exports
- No external consumers identified (wreckit is a CLI tool, not a library)
- If external tools exist, they would need migration guidance

### Patterns to Follow

1. **Complete removal pattern** (from Item 066):
   - Remove deprecated function implementations
   - Remove deprecated type definitions
   - Remove re-exports from index files
   - Update documentation generation

2. **TypeScript module system:**
   - Maintain clean exports from `src/agent/index.ts`
   - Preserve modern API exports unchanged
   - Let tree-shaking remove unused code from `dist/`

3. **Documentation updates:**
   - Regenerate Typedoc markdown: `bun run docs:api`
   - Verify `docs/api/agent/runner/` no longer lists deprecated APIs
   - Update AGENTS.md if it references legacy APIs (current review: no references found)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| External consumers using deprecated APIs | High | Search GitHub/GitHub for dependents; if found, add migration guide to CHANGELOG |
| Test files still using legacy APIs | Medium | Already verified: no test files use deprecated APIs |
| Documentation incomplete after removal | Low | Regenerate docs with `bun run docs:api`; verify README.md and AGENTS.md |
| Runtime errors from missing exports | Low | Modern API is the only thing used internally; external impact is breakage (intended) |

## Recommended Approach

Based on research findings, here's the recommended implementation strategy:

### Phase 1: Verification
1. Run `grep -r "runAgent\|getAgentConfig\|AgentConfig\|RunAgentOptions" src/` to confirm no usages
2. Check GitHub for any public forks/dependents that might import from wreckit
3. Verify all tests pass: `bun test`

### Phase 2: Code Removal
1. **Remove deprecated implementations from `src/agent/runner.ts`:**
   - Delete `AgentConfig` interface (lines 32-39)
   - Delete `RunAgentOptions` interface (lines 57-70)
   - Delete `getAgentConfig()` function (lines 114-138)
   - Delete `simulateMockAgent()` function (lines 140-170)
   - Delete `runAgent()` function (lines 190-256)
   - Delete `runLegacyProcessAgent()` function (lines 263-288)

2. **Remove deprecated re-exports from `src/agent/index.ts`:**
   - Delete lines 38-56 (legacy API section)
   - Keep modern API exports (lines 7-12) unchanged

3. **Update section comments:**
   - Simplify `src/agent/index.ts` to only document modern API
   - Remove "Legacy API (Deprecated)" section

### Phase 3: Documentation
1. **Regenerate API docs:**
   ```bash
   bun run docs:api
   ```
2. **Verify generated docs:**
   - Check that `docs/api/agent/runner/` no longer contains legacy function docs
   - Verify `docs/api/agent/runner/README.md` only lists modern APIs
3. **Update CHANGELOG.md:**
   - Add breaking change entry with migration guide
   - Document removed APIs and their replacements

### Phase 4: Validation
1. **Type check:** `bun run typecheck` - should pass with no errors
2. **Lint:** `bun run lint` - should pass with no errors
3. **Build:** `bun run build` - should succeed
4. **Test:** `bun test` - all tests should pass
5. **Smoke test:** Run `wreckit --help` and `wreckit status` to verify CLI works

## Open Questions

1. **External consumers:** Are there any external tools or packages that import from wreckit's `src/agent/` module? If yes, we need to provide a migration guide and potentially maintain compatibility for one major version.

2. **Documentation generation:** Should we keep a "Migration Guide" document that shows the old API → new API mapping, or is the JSDoc `@deprecated` comment in `src/agent/index.ts` sufficient before removal?

3. **Versioning:** Since this is a breaking change (removing deprecated exports), should we bump the major version to 2.0.0? This signals to external consumers that they need to update their code.

## Appendix: Migration Reference

**Old API → New API mapping:**

| Legacy (Deprecated) | Modern (Replacement) |
|---------------------|----------------------|
| `runAgent({ config, ... })` | `runAgentUnion({ config, ... })` |
| `getAgentConfig(config)` | `getAgentConfigUnion(config)` |
| `AgentConfig` (mode-based) | `AgentConfigUnion` (kind-based) |
| `RunAgentOptions` | `UnionRunAgentOptions` |

**Key differences:**
- **Mode-based** (`mode: "process" | "sdk"`) → **Kind-based** (`kind: "process" | "claude_sdk" | "amp_sdk" | "codex_sdk" | "opencode_sdk" | "rlm"`)
- Legacy `runAgent()` had automatic fallback from SDK to process mode → Modern `runAgentUnion()` requires explicit `kind` selection
- Legacy `AgentConfig` had fields like `timeout_seconds`, `max_iterations` → These are now in top-level `ConfigResolved`, not in agent config

**Example migration:**
```typescript
// ❌ Old (deprecated)
import { runAgent, getAgentConfig, AgentConfig } from "./agent";
const config: AgentConfig = getAgentConfig(resolvedConfig);
await runAgent({ config, cwd, prompt, logger });

// ✅ New (current)
import { runAgentUnion, getAgentConfigUnion } from "./agent";
import type { AgentConfigUnion } from "./schemas";
const config: AgentConfigUnion = getAgentConfigUnion(resolvedConfig);
await runAgentUnion({ config, cwd, prompt, logger });
```
