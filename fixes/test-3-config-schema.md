# Fix Group 3: Config Schema - Agent Kind Union Type

## Failing Tests (18 tests)

| Test File                   | Category                            |
| --------------------------- | ----------------------------------- |
| `edge-cases/config.test.ts` | Config loading & defaults (6 tests) |
| `edge-cases/config.test.ts` | Override precedence (5 tests)       |
| `edge-cases/config.test.ts` | Config handling (7 tests)           |
| `init.test.ts`              | creates config.json with defaults   |

## Specific Tests

- Test 42: Missing config.json - uses defaults
- Test 45: Partial config with defaults - mergeWithDefaults fills missing values
- Test 46: Config overrides (applyOverrides) - override values take precedence
- Test 51-55: Config loading
- Test 56-60: Override precedence
- loads config from .wreckit/config.json
- override wins over config for baseBranch/branchPrefix
- multiple overrides all win over config
- overrides work with missing config.json
- partial overrides preserve other config values
- creates config.json with defaults

## Root Cause

The `AgentConfig` type changed from a simple object with `mode` field to a **discriminated union type** based on `kind`:

**Old schema:**

```typescript
agent: {
  mode: string;
  command: string;
  args: string[];
  completion_signal: string;
}
```

**New schema:**

```typescript
agent:
  | { kind: "claude_sdk"; model?: string; env?: Record<string, string> }
  | { kind: "amp_sdk"; model?: string; env?: Record<string, string> }
  | { kind: "codex_sdk"; model?: string; env?: Record<string, string> }
  | { kind: "opencode_sdk"; model?: string; env?: Record<string, string> }
  | { kind: "process"; command: string; args?: string[]; completion_signal?: string }
```

## Fix Strategy

Update all test fixtures to use the new discriminated union:

```typescript
// For SDK-based agents (default)
const config = {
  schema_version: 1,
  base_branch: "main",
  branch_prefix: "wreckit/",
  merge_mode: "pr",
  agent: {
    kind: "claude_sdk",
    model: "claude-sonnet-4-20250514",
  },
  max_iterations: 100,
  timeout_seconds: 3600,
  branch_cleanup: { enabled: true, delete_remote: true },
};

// For process-based agents
const processConfig = {
  schema_version: 1,
  agent: {
    kind: "process",
    command: "my-agent",
    args: ["--flag"],
    completion_signal: "DONE",
  },
  // ...
};
```

## Files to Update

1. `src/__tests__/edge-cases/config.test.ts`
2. `src/__tests__/init.test.ts`
3. `src/commands/__tests__/init.test.ts` (if exists)

## Verification

```bash
bun test src/__tests__/edge-cases/config.test.ts src/__tests__/init.test.ts
```
