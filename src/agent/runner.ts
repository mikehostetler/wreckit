import { spawn, type ChildProcess } from "node:child_process";
import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";

export interface AgentConfig {
  command: string;
  args: string[];
  completion_signal: string;
  timeout_seconds: number;
  max_iterations: number;
}

export interface AgentResult {
  success: boolean;
  output: string;
  timedOut: boolean;
  exitCode: number | null;
  completionDetected: boolean;
}

export interface RunAgentOptions {
  config: AgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  mockAgent?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}

export function getAgentConfig(config: ConfigResolved): AgentConfig {
  return {
    command: config.agent.command,
    args: config.agent.args,
    completion_signal: config.agent.completion_signal,
    timeout_seconds: config.timeout_seconds,
    max_iterations: config.max_iterations,
  };
}

async function simulateMockAgent(options: RunAgentOptions, config: AgentConfig): Promise<AgentResult> {
  const mockLines = [
    "🤖 [mock-agent] Starting simulated agent run...",
    "📋 [mock-agent] Analyzing prompt...",
    "🔍 [mock-agent] Researching codebase...",
    "✏️  [mock-agent] Making changes...",
    "✅ [mock-agent] Changes complete!",
    `${config.completion_signal}`,
  ];

  let output = "";
  for (const line of mockLines) {
    const delay = 300 + Math.random() * 400;
    await new Promise((resolve) => setTimeout(resolve, delay));
    const chunk = line + "\n";
    output += chunk;
    if (options.onStdoutChunk) {
      options.onStdoutChunk(chunk);
    } else {
      process.stdout.write(chunk);
    }
  }

  return {
    success: true,
    output,
    timedOut: false,
    exitCode: 0,
    completionDetected: true,
  };
}

export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const { config, cwd, prompt, logger, dryRun = false, mockAgent = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would run: ${config.command} ${config.args.join(" ")}`);
    logger.info(`[dry-run] Working directory: ${cwd}`);
    logger.info(`[dry-run] Prompt length: ${prompt.length} characters`);
    return {
      success: true,
      output: "[dry-run] No output",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  if (mockAgent) {
    logger.info(`[mock-agent] Simulating agent run...`);
    return simulateMockAgent(options, config);
  }

  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    let completionDetected = false;
    let child: ChildProcess;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      child = spawn(config.command, config.args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      logger.error(`Failed to spawn agent: ${err}`);
      resolve({
        success: false,
        output: `Failed to spawn agent: ${err}`,
        timedOut: false,
        exitCode: null,
        completionDetected: false,
      });
      return;
    }

    if (config.timeout_seconds > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`Agent timed out after ${config.timeout_seconds} seconds`);
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
      }, config.timeout_seconds * 1000);
    }

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      if (options.onStdoutChunk) {
        options.onStdoutChunk(chunk);
      } else {
        process.stdout.write(chunk);
      }
      if (output.includes(config.completion_signal)) {
        completionDetected = true;
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      if (options.onStderrChunk) {
        options.onStderrChunk(chunk);
      } else {
        process.stderr.write(chunk);
      }
      if (output.includes(config.completion_signal)) {
        completionDetected = true;
      }
    });

    child.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      logger.error(`Agent process error: ${err}`);
      resolve({
        success: false,
        output: output + `\nProcess error: ${err}`,
        timedOut: false,
        exitCode: null,
        completionDetected: false,
      });
    });

    child.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      const success = code === 0 && completionDetected;
      logger.debug(`Agent exited with code ${code}, completion detected: ${completionDetected}`);
      resolve({
        success,
        output,
        timedOut,
        exitCode: code,
        completionDetected,
      });
    });

    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}
