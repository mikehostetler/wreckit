# Implementation Plan - Recursive Evolution: The Geneticist

1. **Enhance Geneticist Command** (`src/commands/geneticist.ts`)
   - Implement `ErrorPattern` analysis with clustering.
   - Add logic to map errors to specific prompts.
   - Implement `optimizePrompt` function using `runAgentUnion`.

2. **Implement Git & PR Workflow** (`src/commands/geneticist.ts`)
   - Use `ensureBranch` to create optimization branches.
   - Use `commitAll` and `pushBranch`.
   - Use `createOrUpdatePr` to submit changes.

3. **Integrate Configuration** (`src/config.ts`, `src/schemas.ts`)
   - Add `geneticist` section to `ConfigSchema`.
   - Default settings for `min_error_count`, `auto_optimize`.

4. **Add Validation Layer**
   - Verify prompt variables are preserved.
   - Verify markdown structure.

5. **Wire up CLI** (Already done in previous steps).
