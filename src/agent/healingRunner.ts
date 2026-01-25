/**
 * Self-Healing Agent Runner Wrapper
 * Wraps agent execution with automatic error detection and healing.
 *
 * Part of Agent Doctor (Item 038) - Self-Healing Runtime
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import { getWreckitDir } from "../fs/paths";
import { runAgentUnion, type AgentResult, type UnionRunAgentOptions } from "./runner";
import { detectRecoverableError, type ErrorDiagnosis } from "./errorDetector";
import { applyHealing, type HealingConfig, type HealingResult } from "./healer";

/**
 * Individual healing attempt record
 */
export interface HealingAttempt {
  attemptNumber: number;
  errorType: string;
  repairAttempted: string;
  success: boolean;
  message: string;
  durationMs: number;
}

/**
 * Complete healing log entry for an agent execution
 */
export interface HealingLogEntry {
  itemId: string | null;
  timestamp: string;
  initialError: {
    errorType: string;
    detectedPattern: string;
  };
  attempts: HealingAttempt[];
  finalOutcome: "healed" | "not_recoverable" | "max_retries_exceeded";
  totalDurationMs: number;
}

/**
 * Extended agent result with healing information
 */
export interface HealingAgentResult extends AgentResult {
  healingLog?: HealingLogEntry;
}

/**
 * Run an agent with automatic self-healing
 */
export async function runAgentWithHealing(
  options: UnionRunAgentOptions,
  healingConfig: HealingConfig,
  itemId: string | null = null
): Promise<HealingAgentResult> {
  const { logger } = options;
  const maxRetries = healingConfig.maxRetries;
  const startTime = Date.now();

  // Skip healing if disabled
  if (!healingConfig.enabled) {
    return runAgentUnion(options);
  }

  let attempt = 0;
  const healingAttempts: HealingAttempt[] = [];
  let initialDiagnosis: ErrorDiagnosis | null = null;

  while (attempt < maxRetries) {
    attempt++;
    logger.debug(`Agent execution attempt ${attempt}/${maxRetries}`);

    // Run the agent
    const result = await runAgentUnion(options);

    // Success - return immediately
    if (result.success) {
      if (healingAttempts.length > 0) {
        // Log successful healing
        const logEntry: HealingLogEntry = {
          itemId,
          timestamp: new Date().toISOString(),
          initialError: initialDiagnosis ? {
            errorType: initialDiagnosis.errorType,
            detectedPattern: initialDiagnosis.detectedPattern,
          } : {
            errorType: "unknown",
            detectedPattern: "none",
          },
          attempts: healingAttempts,
          finalOutcome: "healed",
          totalDurationMs: Date.now() - startTime,
        };

        await writeHealingLog(options.cwd, logEntry);

        logger.info(`✓ Agent healed after ${attempt} attempt(s)`);

        return {
          ...result,
          healingLog: logEntry,
        };
      }

      return result;
    }

    // Failure - check if recoverable
    const diagnosis = detectRecoverableError(result);

    if (!diagnosis || !diagnosis.recoverable) {
      // Not recoverable - return failure immediately
      if (healingAttempts.length > 0) {
        // Log failed healing attempt
        const logEntry: HealingLogEntry = {
          itemId,
          timestamp: new Date().toISOString(),
          initialError: {
            errorType: "unknown",
            detectedPattern: "not_recoverable",
          },
          attempts: healingAttempts,
          finalOutcome: "not_recoverable",
          totalDurationMs: Date.now() - startTime,
        };

        await writeHealingLog(options.cwd, logEntry);
      }

      return result;
    }

    // Record initial diagnosis on first failure
    if (attempt === 1) {
      initialDiagnosis = diagnosis;
    }

    // Check if we've exceeded max retries
    if (attempt >= maxRetries) {
      // Max retries exceeded - log and return failure
      const logEntry: HealingLogEntry = {
        itemId,
        timestamp: new Date().toISOString(),
        initialError: {
          errorType: diagnosis.errorType,
          detectedPattern: diagnosis.detectedPattern,
        },
        attempts: healingAttempts,
        finalOutcome: "max_retries_exceeded",
        totalDurationMs: Date.now() - startTime,
      };

      await writeHealingLog(options.cwd, logEntry);

      logger.warn(`✗ Max retries (${maxRetries}) exceeded for error: ${diagnosis.errorType}`);

      // Check for repeated failures (alert if same error type failed 3+ times in 24h)
      await checkRepeatedFailures(options.cwd, diagnosis.errorType, logger);

      return {
        ...result,
        healingLog: logEntry,
      };
    }

    // Apply healing
    logger.info(`⚠ Recoverable error detected: ${diagnosis.errorType}`);
    logger.info(`  Pattern: ${diagnosis.detectedPattern}`);
    logger.info(`  Applying repair: ${diagnosis.suggestedRepair.join(", ")}`);

    const healingResult = await applyHealing(diagnosis, options.cwd, healingConfig, logger);

    // Record healing attempt
    healingAttempts.push({
      attemptNumber: attempt,
      errorType: healingResult.errorType,
      repairAttempted: healingResult.repairAttempted,
      success: healingResult.success,
      message: healingResult.message,
      durationMs: healingResult.durationMs,
    });

    if (healingResult.success) {
      logger.info(`  ✓ Repair successful: ${healingResult.message}`);
    } else {
      logger.warn(`  ✗ Repair failed: ${healingResult.message}`);
    }

    // Exponential backoff before retry
    const backoffMs = 1000 * Math.pow(2, attempt - 1);
    logger.debug(`  Waiting ${backoffMs}ms before retry...`);
    await sleep(backoffMs);
  }

  // Should never reach here, but TypeScript needs it
  return runAgentUnion(options);
}

/**
 * Write healing log entry to .wreckit/healing-log.jsonl
 */
async function writeHealingLog(cwd: string, entry: HealingLogEntry): Promise<void> {
  const wreckitDir = getWreckitDir(cwd);
  const logPath = path.join(wreckitDir, "healing-log.jsonl");

  try {
    // Ensure wreckit directory exists
    await fs.mkdir(wreckitDir, { recursive: true });

    // Append entry as JSON line
    const line = JSON.stringify(entry) + "\n";
    await fs.appendFile(logPath, line, "utf-8");
  } catch (err) {
    // Don't fail if logging fails - just warn
    console.error(`Failed to write healing log: ${err}`);
  }
}

/**
 * Check for repeated failures of the same error type
 * Alert if 3+ failures of same type in last 24 hours
 */
async function checkRepeatedFailures(cwd: string, errorType: string, logger: Logger): Promise<void> {
  const wreckitDir = getWreckitDir(cwd);
  const logPath = path.join(wreckitDir, "healing-log.jsonl");

  try {
    // Check if log exists
    try {
      await fs.access(logPath);
    } catch {
      return; // No log file yet
    }

    // Read log file
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");

    // Parse entries from last 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentEntries: HealingLogEntry[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as HealingLogEntry;
        const entryTime = new Date(entry.timestamp).getTime();

        if (entryTime > oneDayAgo) {
          recentEntries.push(entry);
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    // Count failures of this error type
    const failureCount = recentEntries.filter(
      (e) => e.initialError.errorType === errorType && e.finalOutcome !== "healed"
    ).length;

    if (failureCount >= 3) {
      logger.error(`⚠ Repeated healing failures detected: ${errorType} (${failureCount} times in 24h)`);
      logger.error(`  This may indicate a deeper issue requiring manual intervention`);
    }
  } catch (err) {
    // Don't fail if check fails - it's just an alert
    console.error(`Failed to check repeated failures: ${err}`);
  }
}

/**
 * Sleep helper for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert DoctorConfig (from ConfigSchema) to HealingConfig
 */
export function doctorConfigToHealingConfig(doctorConfig: {
  enabled?: boolean;
  auto_repair?: boolean | "safe-only";
  max_retries?: number;
  timeout_ms?: number;
}): HealingConfig {
  return {
    enabled: doctorConfig.enabled ?? true,
    autoRepair: doctorConfig.auto_repair ?? "safe-only",
    maxRetries: doctorConfig.max_retries ?? 3,
    timeoutMs: doctorConfig.timeout_ms ?? 300000, // 5 minutes default
  };
}
