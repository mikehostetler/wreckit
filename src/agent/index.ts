// New API (preferred)
export {
  runAgentUnion,
  getAgentConfigUnion,
  terminateAllAgents,
  registerSdkController,
  unregisterSdkController,
  type AgentResult,
  type UnionRunAgentOptions,
} from "./runner";

/**
 * @deprecated Legacy API - use runAgentUnion and getAgentConfigUnion instead.
 * These exports are kept for backward compatibility with existing tests.
 * They will be removed in a future version.
 */
export {
  runAgent,
  getAgentConfig,
  type AgentConfig,
  type RunAgentOptions,
} from "./runner";
