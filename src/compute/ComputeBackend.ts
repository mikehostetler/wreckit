import { z } from "zod";

export interface LogEvent {
  type: "stdout" | "stderr" | "info" | "error" | "debug";
  message: string;
  timestamp: string;
}

export const IterationStateSchema = z.object({
  status: z.enum(["CONTINUE", "DONE", "NEEDS_INPUT", "BLOCKED"]),
  summary: z.string().optional(),
  question: z.string().optional(),
  error: z.string().optional(),
});

export type IterationState = z.infer<typeof IterationStateSchema>;

export interface IterationOptions {
  prompt: string;
  cwd: string;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  timeoutSeconds?: number;
}

export interface ComputeBackend {
  readonly name: string;

  runIteration(
    itemId: string,
    options: IterationOptions
  ): AsyncIterable<LogEvent>;

  sync(direction: "upload" | "download", paths: string[]): Promise<void>;

  readState(itemId: string): Promise<IterationState>;

  writeResponse(itemId: string, response: string): Promise<void>;

  cleanup(): Promise<void>;
}
