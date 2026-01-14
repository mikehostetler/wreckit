# Wreckit Data Integrity & Agent Abstraction Plan

This plan addresses core data integrity, state machine testing, and agent abstraction architecture.

---

## Phase 1: Pure State Machine Layer (S - 2-3 hours)

### 1.1 Add Pure Transition Function

Create `src/domain/transitions.ts`:

```typescript
export interface TransitionResult {
  nextItem: Item;
  error?: never;
}

export interface TransitionError {
  nextItem?: never;
  error: string;
}

export function applyStateTransition(
  item: Readonly<Item>,
  ctx: ValidationContext
): TransitionResult | TransitionError;
```

- Returns new `Item` object (never mutates input)
- Validates transition before applying
- Updates `state`, `updated_at`
- Pure function with no I/O

### 1.2 State Machine Test Gaps

Add to `src/__tests__/domain.test.ts`:

| Test Case | Description |
|-----------|-------------|
| Same-state transitions | Assert `validateTransition(s, s, ctx)` invalid for all states |
| All non-adjacent pairs | Table-driven test: any `target !== getNextState(current)` is invalid |
| Terminal state | No transition from `done` is valid |

```typescript
it.each(WORKFLOW_STATES)("same-state transition is invalid: %s → %s", (s) => {
  expect(validateTransition(s, s, makeContext()).valid).toBe(false);
});

it("disallows all non-adjacent transitions", () => {
  for (const current of WORKFLOW_STATES) {
    for (const target of WORKFLOW_STATES) {
      if (target === getNextState(current)) continue;
      expect(validateTransition(current, target, makeContext()).valid).toBe(false);
    }
  }
});
```

---

## Phase 2: Property-Based Testing (M - 3-4 hours)

### 2.1 Setup

```bash
bun add -d fast-check
```

### 2.2 Property Tests

Create `src/__tests__/domain.property.test.ts`:

| Property | Invariant |
|----------|-----------|
| Monotonicity | Valid transitions only increase state index by exactly 1 |
| Terminal | Once `done`, no further transitions valid |
| Story invariants | `allStoriesDone(prd) ⇔ !hasPendingStories(prd)` (when stories exist) |
| Immutability | `applyStateTransition` never mutates input |

```typescript
import fc from "fast-check";

fc.assert(
  fc.property(
    fc.constantFrom(...WORKFLOW_STATES),
    fc.constantFrom(...WORKFLOW_STATES),
    (current, target) => {
      const result = validateTransition(current, target, makeContext());
      if (result.valid) {
        expect(getStateIndex(target)).toBe(getStateIndex(current) + 1);
      }
    }
  )
);
```

---

## Phase 3: Data Integrity Hardening (M - 4-5 hours)

### 3.1 Atomic File Writes

Create `src/fs/atomic.ts`:

```typescript
export async function safeWriteJson<T>(
  filePath: string,
  data: T
): Promise<void> {
  const tmpPath = filePath + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
  await fs.rename(tmpPath, filePath); // atomic on POSIX
}
```

Update all writes in `src/fs.ts` to use `safeWriteJson()`.

### 3.2 Corruption Detection Tests

Add to `src/__tests__/edge-cases/`:

| Scenario | Expected Behavior |
|----------|-------------------|
| Truncated `item.json` | `diagnose` emits `INVALID_ITEM` |
| Invalid JSON in `item.json` | CLI fails with clear error |
| Orphaned `.tmp` files | Ignored or cleaned by `doctor --fix` |
| Schema version mismatch | Rejected with migration guidance |

### 3.3 Schema Migration

Add version checks to `readItem()`, `readPrd()`:

```typescript
if (parsed.schema_version < CURRENT_SCHEMA_VERSION) {
  throw new SchemaVersionError(parsed.schema_version, CURRENT_SCHEMA_VERSION);
}
```

---

## Phase 4: Agent Abstraction (M - 4-5 hours)

### 4.1 Discriminated Union Schema

Update `src/schemas.ts`:

```typescript
const ProcessAgentSchema = z.object({
  kind: z.literal("process"),
  command: z.string(),
  args: z.array(z.string()).default([]),
  completion_signal: z.string(),
});

const ClaudeSdkAgentSchema = z.object({
  kind: z.literal("claude_sdk"),
  model: z.string().default("claude-sonnet-4-20250514"),
  max_tokens: z.number().default(4096),
  tools: z.array(z.string()).optional(),
});

const AmpSdkAgentSchema = z.object({
  kind: z.literal("amp_sdk"),
  model: z.string().optional(),
  // amp-specific options
});

const CodexSdkAgentSchema = z.object({
  kind: z.literal("codex_sdk"),
  model: z.string().default("codex-1"),
  // codex-specific options
});

const OpenCodeSdkAgentSchema = z.object({
  kind: z.literal("opencode_sdk"),
  // opencode-specific options
});

export const AgentConfigSchema = z.discriminatedUnion("kind", [
  ProcessAgentSchema,
  ClaudeSdkAgentSchema,
  AmpSdkAgentSchema,
  CodexSdkAgentSchema,
  OpenCodeSdkAgentSchema,
]);

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
```

### 4.2 Agent Runner Dispatch

Refactor `src/agent/runner.ts`:

```typescript
export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const { config } = options;

  if (options.dryRun) return dryRunResult(config);
  if (options.mockAgent) return mockAgentResult(options, config);

  switch (config.kind) {
    case "process":
      return runProcessAgent(options, config);

    case "claude_sdk": {
      const { runClaudeSdkAgent } = await import("./claude-sdk-runner.js");
      return runClaudeSdkAgent(options, config);
    }

    case "amp_sdk": {
      const { runAmpSdkAgent } = await import("./amp-sdk-runner.js");
      return runAmpSdkAgent(options, config);
    }

    case "codex_sdk": {
      const { runCodexSdkAgent } = await import("./codex-sdk-runner.js");
      return runCodexSdkAgent(options, config);
    }

    case "opencode_sdk": {
      const { runOpenCodeSdkAgent } = await import("./opencode-sdk-runner.js");
      return runOpenCodeSdkAgent(options, config);
    }

    default:
      return exhaustiveCheck(config);
  }
}

function exhaustiveCheck(x: never): never {
  throw new Error(`Unhandled agent kind: ${JSON.stringify(x)}`);
}
```

### 4.3 SDK Runner Stubs

Create placeholder files:

- `src/agent/claude-sdk-runner.ts` (move from `sdk-runner.ts`)
- `src/agent/amp-sdk-runner.ts`
- `src/agent/codex-sdk-runner.ts`
- `src/agent/opencode-sdk-runner.ts`

Each exports:

```typescript
export async function run<Kind>SdkAgent(
  options: RunAgentOptions,
  config: Extract<AgentConfig, { kind: "<kind>" }>
): Promise<AgentResult> {
  // Implementation
}
```

---

## Phase 5: Integration Test Hardening (M - 3-4 hours)

### 5.1 Idempotent CLI Behavior

Add to `src/__tests__/workflow.test.ts`:

```typescript
describe("idempotent phase runs", () => {
  it("runPhasePlan on already-planned item is no-op", async () => {
    const item = createTestItem({ state: "planned" });
    // setup plan.md + prd.json
    const result = await runPhasePlan(item.id, opts);
    expect(result.item.state).toBe("planned");
    expect(result.item.updated_at).toBe(item.updated_at); // unchanged
  });

  it("runPhaseResearch on researched item is no-op", async () => {
    // similar
  });
});
```

### 5.2 Concurrent Modification Detection

Add to `src/__tests__/edge-cases/`:

```typescript
it("detects concurrent item.json modification", async () => {
  // Write item, then modify externally, then attempt transition
  // Assert either conflict detected or last-write-wins with warning
});
```

---

## File Structure After Implementation

```
src/
├── domain/
│   ├── index.ts
│   ├── states.ts
│   ├── validation.ts
│   └── transitions.ts          # NEW: pure transition logic
├── agent/
│   ├── index.ts
│   ├── runner.ts               # REFACTORED: dispatch on kind
│   ├── claude-sdk-runner.ts    # RENAMED from sdk-runner.ts
│   ├── amp-sdk-runner.ts       # NEW
│   ├── codex-sdk-runner.ts     # NEW
│   └── opencode-sdk-runner.ts  # NEW
├── fs/
│   ├── index.ts
│   └── atomic.ts               # NEW: safeWriteJson
├── __tests__/
│   ├── domain.test.ts          # EXTENDED
│   ├── domain.property.test.ts # NEW: fast-check tests
│   └── edge-cases/
│       ├── corruption.test.ts  # NEW
│       └── ...
└── schemas.ts                  # REFACTORED: discriminated union
```

---

## Priority Order

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| 1. Pure State Machine | S | High | 🔴 P0 |
| 2. Property-Based Tests | M | High | 🔴 P0 |
| 3. Data Integrity | M | Medium | 🟡 P1 |
| 4. Agent Abstraction | M | High | 🟡 P1 |
| 5. Integration Hardening | M | Medium | 🟢 P2 |

---

## Success Criteria

- [ ] `applyStateTransition()` is pure and never mutates input
- [ ] Property tests verify all state machine invariants
- [ ] Corrupted JSON files are detected and reported
- [ ] Atomic writes prevent partial file corruption
- [ ] Agent config uses discriminated union with exhaustive dispatch
- [ ] Adding a new agent requires only:
  1. New schema variant in `AgentConfigSchema`
  2. New `*-sdk-runner.ts` file
  3. New case in `runAgent()` switch
- [ ] All existing tests pass
- [ ] `bun test` includes property-based tests

---

## Migration Path

### Config Migration

Old format:
```json
{
  "agent": {
    "mode": "sdk",
    "command": "claude",
    "args": ["--print"],
    "completion_signal": "DONE",
    "sdk_model": "claude-sonnet-4-20250514"
  }
}
```

New format:
```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4096
  }
}
```

Or for process-based:
```json
{
  "agent": {
    "kind": "process",
    "command": "amp",
    "args": ["--dangerously-allow-all"],
    "completion_signal": "DONE"
  }
}
```

Add migration in `loadConfig()` to auto-upgrade `mode: "sdk"` → `kind: "claude_sdk"`.
