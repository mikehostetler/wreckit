import { z } from "zod";

export const WorkflowStateSchema = z.enum([
  "raw",
  "researched",
  "planned",
  "implementing",
  "in_pr",
  "done",
]);

export const StoryStatusSchema = z.enum(["pending", "done"]);

export const AgentModeSchema = z.enum(["process", "sdk"]);

export const ConfigSchema = z.object({
  schema_version: z.number().default(1),
  base_branch: z.string().default("main"),
  branch_prefix: z.string().default("wreckit/"),
  agent: z.object({
    mode: AgentModeSchema.default("process"),
    command: z.string(),
    args: z.array(z.string()),
    completion_signal: z.string(),
    sdk_model: z.string().optional(),
    sdk_max_tokens: z.number().optional(),
    sdk_tools: z.array(z.string()).optional(),
  }),
  max_iterations: z.number().default(100),
  timeout_seconds: z.number().default(3600),
});

export const ItemSchema = z.object({
  schema_version: z.number(),
  id: z.string(),
  title: z.string(),
  section: z.string(),
  state: WorkflowStateSchema,
  overview: z.string(),
  branch: z.string().nullable(),
  pr_url: z.string().nullable(),
  pr_number: z.number().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const StorySchema = z.object({
  id: z.string(),
  title: z.string(),
  acceptance_criteria: z.array(z.string()),
  priority: z.number(),
  status: StoryStatusSchema,
  notes: z.string(),
});

export const PrdSchema = z.object({
  schema_version: z.number(),
  id: z.string(),
  branch_name: z.string(),
  user_stories: z.array(StorySchema),
});

export const IndexItemSchema = z.object({
  id: z.string(),
  state: WorkflowStateSchema,
  title: z.string(),
});

export const IndexSchema = z.object({
  schema_version: z.number(),
  items: z.array(IndexItemSchema),
  generated_at: z.string(),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type StoryStatus = z.infer<typeof StoryStatusSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Story = z.infer<typeof StorySchema>;
export type Prd = z.infer<typeof PrdSchema>;
export type IndexItem = z.infer<typeof IndexItemSchema>;
export type Index = z.infer<typeof IndexSchema>;

// ============================================================
// Agent Abstraction - Discriminated Union Schemas (Phase 4)
// ============================================================

export const ProcessAgentSchema = z.object({
  kind: z.literal("process"),
  command: z.string(),
  args: z.array(z.string()).default([]),
  completion_signal: z.string(),
});

export const ClaudeSdkAgentSchema = z.object({
  kind: z.literal("claude_sdk"),
  model: z.string().default("claude-sonnet-4-20250514"),
  max_tokens: z.number().default(4096),
  tools: z.array(z.string()).optional(),
});

export const AmpSdkAgentSchema = z.object({
  kind: z.literal("amp_sdk"),
  model: z.string().optional(),
});

export const CodexSdkAgentSchema = z.object({
  kind: z.literal("codex_sdk"),
  model: z.string().default("codex-1"),
});

export const OpenCodeSdkAgentSchema = z.object({
  kind: z.literal("opencode_sdk"),
});

export const AgentConfigUnionSchema = z.discriminatedUnion("kind", [
  ProcessAgentSchema,
  ClaudeSdkAgentSchema,
  AmpSdkAgentSchema,
  CodexSdkAgentSchema,
  OpenCodeSdkAgentSchema,
]);

export type ProcessAgentConfig = z.infer<typeof ProcessAgentSchema>;
export type ClaudeSdkAgentConfig = z.infer<typeof ClaudeSdkAgentSchema>;
export type AmpSdkAgentConfig = z.infer<typeof AmpSdkAgentSchema>;
export type CodexSdkAgentConfig = z.infer<typeof CodexSdkAgentSchema>;
export type OpenCodeSdkAgentConfig = z.infer<typeof OpenCodeSdkAgentSchema>;
export type AgentConfigUnion = z.infer<typeof AgentConfigUnionSchema>;
