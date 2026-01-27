import { z } from "zod";

export const ItemStateSchema = z.enum([
  "idea",
  "researched",
  "planned",
  "implementing",
  "critique",
  "in_pr",
  "done",
]);

export const StoryStatusSchema = z.enum(["pending", "done"]);

export const AgentModeSchema = z.enum(["process", "sdk"]);

export const MergeModeSchema = z.enum(["pr", "direct"]);

export const PrChecksSchema = z.object({
  commands: z.array(z.string()).default([]),
  secret_scan: z.boolean().default(false),
  require_all_stories_done: z.boolean().default(true),
  allow_unsafe_direct_merge: z.boolean().default(false),
  allowed_remote_patterns: z.array(z.string()).default([]),
});

export const BranchCleanupSchema = z.object({
  enabled: z.boolean().default(true),
  delete_remote: z.boolean().default(true),
});

// ============================================================
// Agent Abstraction - Discriminated Union Schemas (Phase 4)
// Must be defined BEFORE ConfigSchema since it references them
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

export const RlmSdkAgentSchema = z.object({
  kind: z.literal("rlm"),
  model: z.string().default("claude-sonnet-4-20250514"),
  maxIterations: z.number().default(100),
  aiProvider: z.enum(["anthropic", "openai", "google", "zai"]).default("anthropic"),
});

export const SpriteAgentSchema = z.object({
  kind: z.literal("sprite"),
  wispPath: z.string().default("sprite").describe("Path to sprite CLI binary (default: 'sprite' from PATH)"),
  token: z.string().optional().describe("Sprites.dev authentication token (optional, can use SPRITES_TOKEN env var)"),
  maxVMs: z.number().default(5).describe("Maximum concurrent VMs allowed"),
  defaultMemory: z.string().default("512MiB").describe("Default memory allocation per VM"),
  defaultCPUs: z.string().default("1").describe("Default CPU allocation per VM"),
  timeout: z.number().default(300).describe("Default timeout in seconds for VM operations"),
});

export const AgentConfigUnionSchema = z.discriminatedUnion("kind", [
  ProcessAgentSchema,
  ClaudeSdkAgentSchema,
  AmpSdkAgentSchema,
  CodexSdkAgentSchema,
  OpenCodeSdkAgentSchema,
  RlmSdkAgentSchema,
  SpriteAgentSchema,
]);

// Legacy agent config (mode-based) - for backwards compatibility
export const LegacyAgentConfigSchema = z.object({
  mode: AgentModeSchema,
  command: z.string(),
  args: z.array(z.string()),
  completion_signal: z.string(),
});

// ============================================================
// Skill Configuration Schema (Item 033 - Phase-Specific Skill Loading)
// ============================================================

/**
 * Context requirement for a skill.
 * Specifies what context the skill needs for JIT loading.
 */
export const SkillContextRequirementSchema = z
  .object({
    type: z.enum(["file", "git_status", "item_metadata", "phase_artifact"]),
    path: z.string().optional(), // For type="file" or type="phase_artifact"
    description: z.string().optional(),
  })
  .optional();

/**
 * A skill defines reusable capabilities (tools, MCP servers, context)
 * that can be loaded for specific phases.
 */
export const SkillSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Unique skill identifier (e.g., 'code-analysis', 'test-generation')",
      ),
    name: z.string().describe("Human-readable skill name"),
    description: z
      .string()
      .describe("What this skill provides and when to use it"),
    tools: z.array(z.string()).describe("Tool names required by this skill"),
    mcp_servers: z
      .record(z.string(), z.any())
      .optional()
      .describe("MCP servers to attach (advanced usage)"),
    required_context: z
      .array(SkillContextRequirementSchema)
      .optional()
      .describe("JIT context requirements"),
  })
  .strict();

/**
 * Maps phase names to skill IDs that should be loaded for that phase.
 */
export const PhaseSkillsMappingSchema = z.record(
  z.string(), // phase name (e.g., "research", "implement")
  z.array(z.string()), // array of skill IDs
);

/**
 * Skill configuration for wreckit.
 * Maps phases to skills and defines the skill library.
 */
export const SkillConfigSchema = z
  .object({
    phase_skills: PhaseSkillsMappingSchema.describe(
      "Phase -> skill IDs mapping",
    ),
    skills: z.array(SkillSchema).describe("Available skill definitions"),
  })
  .strict();

// ============================================================
// Doctor Configuration Schema (Item 038 - Agent Doctor Self-Healing Runtime)
// ============================================================

/**
 * Auto-repair modes for the Agent Doctor
 * - true: Allow all repairs (git lock, npm install, JSON restoration)
 * - false: Disable all auto-repair
 * - "safe-only": Only allow safe repairs (git lock removal, npm install)
 */
export const DoctorAutoRepairModeSchema = z.union([
  z.literal(true),
  z.literal(false),
  z.literal("safe-only"),
]);

/**
 * Doctor configuration for automatic self-healing
 */
export const DoctorConfigSchema = z
  .object({
    enabled: z
      .boolean()
      .default(true)
      .describe("Enable automatic self-healing"),
    auto_repair: DoctorAutoRepairModeSchema.default("safe-only").describe(
      "What repairs are allowed",
    ),
    max_retries: z
      .number()
      .default(3)
      .describe("Max retry attempts after healing"),
    timeout_ms: z
      .number()
      .default(300000)
      .describe("Timeout for healing operations (default 5 minutes)"),
  })
  .strict();

export const ConfigSchema = z.object({
  schema_version: z.number().default(1),
  base_branch: z.string().default("main"),
  branch_prefix: z.string().default("wreckit/"),
  merge_mode: MergeModeSchema.default("pr"),
  // Accept either legacy mode-based format or new kind-based union format
  agent: z.union([LegacyAgentConfigSchema, AgentConfigUnionSchema]),
  max_iterations: z.number().default(100),
  timeout_seconds: z.number().default(3600),
  pr_checks: PrChecksSchema.optional(),
  branch_cleanup: BranchCleanupSchema.optional(),
  // Add optional skills configuration (Item 033)
  skills: SkillConfigSchema.optional(),
  // Add optional doctor configuration (Item 038)
  doctor: DoctorConfigSchema.optional(),
});

export const PriorityHintSchema = z.enum(["low", "medium", "high", "critical"]);

export const ItemSchema = z.object({
  schema_version: z.number(),
  id: z.string(),
  title: z.string(),
  section: z.string().optional(),
  state: ItemStateSchema,
  overview: z.string(),
  branch: z.string().nullable(),
  pr_url: z.string().nullable(),
  pr_number: z.number().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),

  // Structured context fields for richer research/planning
  problem_statement: z.string().optional(),
  motivation: z.string().optional(),
  success_criteria: z.array(z.string()).optional(),
  technical_constraints: z.array(z.string()).optional(),
  scope_in_scope: z.array(z.string()).optional(),
  scope_out_of_scope: z.array(z.string()).optional(),
  priority_hint: PriorityHintSchema.optional(),
  urgency_hint: z.string().optional(),

  // Rollback anchor for direct merge mode (Gap 4)
  rollback_sha: z.string().nullable().optional(),

  // Completion metadata for PR mode (Spec 006 Gap 1: Audit Trail)
  completed_at: z.string().nullable().optional(),
  merged_at: z.string().nullable().optional(),
  merge_commit_sha: z.string().nullable().optional(),
  checks_passed: z.boolean().nullable().optional(),

  // Dependency management and campaign grouping (Item 022)
  depends_on: z.array(z.string()).optional(),
  campaign: z.string().optional(),
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
  schema_version: z.literal(1),
  id: z.string(),
  branch_name: z.string(),
  user_stories: z.array(StorySchema),
});

export const IndexItemSchema = z.object({
  id: z.string(),
  state: ItemStateSchema,
  title: z.string(),
  // Dependency management for efficient orchestration (Item 022)
  depends_on: z.array(z.string()).optional(),
});

export const IndexSchema = z.object({
  schema_version: z.number(),
  items: z.array(IndexItemSchema),
  generated_at: z.string(),
});

export const BatchProgressSchema = z.object({
  schema_version: z.literal(1),
  session_id: z.string(),
  pid: z.number(), // Process ID for stale detection
  started_at: z.string(), // ISO timestamp
  updated_at: z.string(), // Last checkpoint time
  parallel: z.number(), // Worker count (1 for sequential)

  // Queue state
  queued_items: z.array(z.string()), // Original queue (item IDs)
  current_item: z.string().nullable(), // Currently processing (sequential mode)

  // Progress tracking
  completed: z.array(z.string()), // Successfully processed this session
  failed: z.array(z.string()), // Failed items this session
  skipped: z.array(z.string()), // Already done at session start

  // Healing metrics (Item 038)
  healing_attempts: z
    .number()
    .default(0)
    .describe("Number of healing attempts this session"),
  last_healing_at: z
    .string()
    .nullable()
    .describe("ISO timestamp of last healing event"),
});

export type WorkflowState = z.infer<typeof ItemStateSchema>;
export type StoryStatus = z.infer<typeof StoryStatusSchema>;
export type MergeMode = z.infer<typeof MergeModeSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type LegacyAgentConfig = z.infer<typeof LegacyAgentConfigSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type PriorityHint = z.infer<typeof PriorityHintSchema>;
export type Story = z.infer<typeof StorySchema>;
export type Prd = z.infer<typeof PrdSchema>;
export type IndexItem = z.infer<typeof IndexItemSchema>;
export type Index = z.infer<typeof IndexSchema>;

export type ProcessAgentConfig = z.infer<typeof ProcessAgentSchema>;
export type ClaudeSdkAgentConfig = z.infer<typeof ClaudeSdkAgentSchema>;
export type AmpSdkAgentConfig = z.infer<typeof AmpSdkAgentSchema>;
export type CodexSdkAgentConfig = z.infer<typeof CodexSdkAgentSchema>;
export type OpenCodeSdkAgentConfig = z.infer<typeof OpenCodeSdkAgentSchema>;
export type RlmSdkAgentConfig = z.infer<typeof RlmSdkAgentSchema>;
export type SpriteAgentConfig = z.infer<typeof SpriteAgentSchema>;
export type AgentConfigUnion = z.infer<typeof AgentConfigUnionSchema>;
export type BatchProgress = z.infer<typeof BatchProgressSchema>;

// Type exports for skill configuration (Item 033)
export type SkillContextRequirement = z.infer<
  typeof SkillContextRequirementSchema
>;
export type Skill = z.infer<typeof SkillSchema>;
export type PhaseSkillsMapping = z.infer<typeof PhaseSkillsMappingSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;

// Type exports for doctor configuration (Item 038)
export type DoctorAutoRepairMode = z.infer<typeof DoctorAutoRepairModeSchema>;
export type DoctorConfig = z.infer<typeof DoctorConfigSchema>;

// Backup manifest schemas for doctor --fix
export const BackupFileEntrySchema = z.object({
  original_path: z.string(), // Relative path from repo root
  backup_path: z.string(), // Relative path within backup session dir
  operation: z.enum(["modified", "deleted"]),
  diagnostic_code: z.string(),
  item_id: z.string().nullable(),
});

export const BackupManifestSchema = z.object({
  schema_version: z.literal(1),
  session_id: z.string(),
  created_at: z.string(),
  reason: z.literal("doctor-fix"),
  files: z.array(BackupFileEntrySchema),
});

export type BackupFileEntry = z.infer<typeof BackupFileEntrySchema>;
export type BackupManifest = z.infer<typeof BackupManifestSchema>;
