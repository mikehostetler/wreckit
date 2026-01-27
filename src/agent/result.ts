/**
 * Result of an agent execution.
 * This is the standard return type for all agent runners.
 */
export interface AgentResult {
  /** Whether the agent completed successfully */
  success: boolean;
  /** Combined stdout/stderr output from the agent */
  output: string;
  /** Whether the agent timed out */
  timedOut: boolean;
  /** Exit code (null if not applicable) */
  exitCode: number | null;
  /** Whether the completion signal was detected */
  completionDetected: boolean;
}
