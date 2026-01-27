// ============================================================
// New API (Preferred)
// ============================================================
// Use these exports for new code. They use the discriminated union format
// (AgentConfigUnion) which is type-safe and supports multiple agent backends.

export {
  runAgentUnion,
  getAgentConfigUnion,
  type AgentResult,
  type UnionRunAgentOptions,
} from "./runner";

export {
  terminateAllAgents,
  registerSdkController,
  unregisterSdkController,
  registerProcessAgent,
  unregisterProcessAgent,
} from "./lifecycle";

// ============================================================
// Legacy API (Deprecated)
// ============================================================
// These exports are kept for backward compatibility with existing tests.
// They will be removed in a future version.
//
// Migration guide:
// - runAgent → runAgentUnion
// - getAgentConfig → getAgentConfigUnion
// - AgentConfig → AgentConfigUnion (from schemas.ts)
// - RunAgentOptions → UnionRunAgentOptions
//
// The legacy API uses mode-based config ("process" | "sdk") while the new
// API uses kind-based config ("process" | "claude_sdk" | "amp_sdk" |
// "codex_sdk" | "opencode_sdk" | "rlm").

/**
 * @deprecated Use `runAgentUnion` instead.
 */
export { runAgent } from "./runner";

/**
 * @deprecated Use `getAgentConfigUnion` instead.
 */
export { getAgentConfig } from "./runner";

/**
 * @deprecated Use `AgentConfigUnion` from `../schemas` instead.
 */
export type { AgentConfig } from "./runner";

/**
 * @deprecated Use `UnionRunAgentOptions` instead.
 */
export type { RunAgentOptions } from "./runner";
