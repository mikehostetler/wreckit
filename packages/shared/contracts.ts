import { z } from "zod";

export type ISO8601 = string;

export const SessionModeSchema = z.enum([
  "capture",
  "synthesize",
  "execute",
  "idle",
]);
export type SessionMode = z.infer<typeof SessionModeSchema>;

export const ChatPlatformSchema = z.enum(["telegram"]);
export type ChatPlatform = z.infer<typeof ChatPlatformSchema>;

export const NoteKindSchema = z.enum(["text", "voice", "screenshot", "file"]);
export type NoteKind = z.infer<typeof NoteKindSchema>;

export const PrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const RepoRefSchema = z.object({
  owner: z.string(),
  name: z.string(),
  localPath: z.string(),
  defaultBranch: z.string().optional().default("main"),
});
export type RepoRef = z.infer<typeof RepoRefSchema>;

export const AttachmentSchema = z.object({
  id: z.string(),
  kind: NoteKindSchema,
  filename: z.string(),
  mimeType: z.string().optional(),
  localPath: z.string(),
  telegramFileId: z.string().optional(),
  capturedAt: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const ChatMessageRefSchema = z.object({
  platform: ChatPlatformSchema,
  chatId: z.string(),
  messageId: z.string(),
  userId: z.string(),
  timestamp: z.string(),
});
export type ChatMessageRef = z.infer<typeof ChatMessageRefSchema>;

export const ChatEventSchema = z.object({
  id: z.string(),
  ref: ChatMessageRefSchema,
  kind: NoteKindSchema,
  text: z.string().optional(),
  attachmentId: z.string().optional(),
  intent: z.string().optional(),
});
export type ChatEvent = z.infer<typeof ChatEventSchema>;

export const SessionMetaSchema = z.object({
  id: z.string(),
  mode: SessionModeSchema,
  repo: RepoRefSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  noteCount: z.number().default(0),
  lastActivityAt: z.string().optional(),
  userId: z.string(),
  chatId: z.string(),
  activeAmpThread: z.string().optional(),
  pendingTickets: z.boolean().optional(),
  verboseLogs: z.boolean().optional(),
});
export type SessionMeta = z.infer<typeof SessionMetaSchema>;

export const ObservationSchema = z.object({
  id: z.string(),
  summary: z.string(),
  details: z.string().optional(),
  sourceNoteIds: z.array(z.string()),
  priority: PrioritySchema.optional(),
  tags: z.array(z.string()).default([]),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const TicketRepoRefSchema = z.object({
  owner: z.string(),
  name: z.string(),
});
export type TicketRepoRef = z.infer<typeof TicketRepoRefSchema>;

export const TicketSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: PrioritySchema,
  acceptanceCriteria: z.array(z.string()),
  observationIds: z.array(z.string()),
  status: z.enum(["pending", "in_progress", "done"]).default("pending"),
  prUrl: z.string().optional(),
  prNumber: z.number().optional(),
  repo: TicketRepoRefSchema.optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const RunPhaseSchema = z.enum([
  "research",
  "plan",
  "implement",
  "pr",
  "complete",
]);
export type RunPhase = z.infer<typeof RunPhaseSchema>;

export const RunSpecSchema = z.object({
  ticketId: z.string(),
  phases: z.array(RunPhaseSchema),
  wreckitItemId: z.string().optional(),
  branchName: z.string().optional(),
});
export type RunSpec = z.infer<typeof RunSpecSchema>;

export const RunEventKindSchema = z.enum([
  "started",
  "phase_started",
  "phase_completed",
  "phase_failed",
  "log",
  "pr_opened",
  "preview_ready",
  "completed",
  "stopped",
  "error",
]);
export type RunEventKind = z.infer<typeof RunEventKindSchema>;

export const RunEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  kind: RunEventKindSchema,
  timestamp: z.string(),
  phase: RunPhaseSchema.optional(),
  message: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const RunMetaSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  ticketId: z.string(),
  status: z.enum(["pending", "running", "completed", "stopped", "failed"]),
  currentPhase: RunPhaseSchema.optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  prUrl: z.string().optional(),
  prNumber: z.number().optional(),
  previewUrl: z.string().optional(),
});
export type RunMeta = z.infer<typeof RunMetaSchema>;

export const IntentSchema = z.enum([
  "START_SESSION",
  "CAPTURE_NOTE",
  "SYNTHESIZE",
  "EXECUTE",
  "APPROVE",
  "STATUS",
  "STOP",
  "MERGE",
  "SWITCH_REPO",
  "NOTES",
  "CLEAR_NOTES",
  "ASK",
  "GREP",
  "DIFF",
  "REVERT",
  "LOGS",
  "IMPORT_ISSUE",
  "IMPORT_THREAD",
  "AMP_CHAT",
  "AMP_END",
  "HELP",
  "UNKNOWN",
]);
export type Intent = z.infer<typeof IntentSchema>;

export const ExecutorModeSchema = z.enum(["wreckit", "amp"]).default("amp");
export type ExecutorMode = z.infer<typeof ExecutorModeSchema>;

export const MobileConfigSchema = z.object({
  telegram: z.object({
    botToken: z.string(),
    allowedUserIds: z.array(z.number()),
  }),
  github: z.object({
    token: z.string(),
  }),
  executor: ExecutorModeSchema.optional().default("amp"),
  llm: z.object({
    zai: z
      .object({
        apiKey: z.string(),
        baseUrl: z
          .string()
          .default("https://api.z.ai/api/paas/v4/chat/completions"),
        model: z.string().default("glm-4.7"),
      })
      .optional(),
    openai: z
      .object({
        apiKey: z.string(),
        model: z.string().default("gpt-4o"),
      })
      .optional(),
    anthropic: z
      .object({
        apiKey: z.string(),
        model: z.string().default("claude-sonnet-4-20250514"),
      })
      .optional(),
    google: z
      .object({
        apiKey: z.string(),
        model: z.string().default("gemini-2.0-flash"),
      })
      .optional(),
    roles: z.object({
      synthesizer: z.string().default("zai"),
      implementer: z.string().default("zai"),
      reviewer: z.string().default("zai"),
    }),
  }),
  repos: z.array(RepoRefSchema),
});
export type MobileConfig = z.infer<typeof MobileConfigSchema>;

export const LicenseSchema = z.object({
  licenseKey: z.string(),
  issuedAt: z.string(),
});
export type License = z.infer<typeof LicenseSchema>;
