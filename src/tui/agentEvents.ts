export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_started"; toolUseId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; result: unknown }
  | { type: "tool_error"; toolUseId: string; error: string }
  | { type: "run_result"; subtype?: string }
  | { type: "error"; message: string };
