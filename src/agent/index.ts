// ============================================================
// Agent API
// ============================================================
// Agent execution and lifecycle management using discriminated union format.
// Supports multiple agent backends (process, claude_sdk, amp_sdk, etc.).

export {
  runAgentUnion,
  getAgentConfigUnion,
  type AgentResult,
  type UnionRunAgentOptions,
} from "./runner";

export type { AgentConfigUnion } from "../schemas";

export {
  terminateAllAgents,
  registerSdkController,
  unregisterSdkController,
  registerProcessAgent,
  unregisterProcessAgent,
} from "./lifecycle";
