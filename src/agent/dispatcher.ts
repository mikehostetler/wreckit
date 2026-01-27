import type { Logger } from "../logging";
import type { AgentConfigUnion, ProcessAgentConfig, ClaudeSdkAgentConfig, AmpSdkAgentConfig, CodexSdkAgentConfig, OpenCodeSdkAgentConfig, RlmSdkAgentConfig, SpriteAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import { runProcessAgent } from "./process-runner.js";
import type { AgentResult } from "./result";
import type { CommonRunAgentOptions } from "./types";

function exhaustiveCheck(x: never): never {
  throw new Error(`Unhandled agent kind: ${JSON.stringify(x)}`);
}

/**
 * Dispatch agent execution to the appropriate runner based on config.kind.
 * This is the new dispatch system that supports multiple agent backends.
 *
 * @param options - Dispatch options including config, prompt, callbacks
 * @returns Promise<AgentResult> with execution results
 */
export async function dispatchAgent(
  config: AgentConfigUnion,
  options: CommonRunAgentOptions
): Promise<AgentResult> {
  const { logger, dryRun = false, mockAgent = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would run agent with kind: ${config.kind}`);
    return {
      success: true,
      output: "[dry-run] No output",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  if (mockAgent) {
    logger.info(`[mock-agent] Simulating ${config.kind} agent run...`);
    const mockLines = [
      `🤖 [mock-agent] Starting simulated ${config.kind} agent run...`,
      "📋 [mock-agent] Analyzing prompt...",
      "🔍 [mock-agent] Researching codebase...",
      "✏️  [mock-agent] Making changes...",
      "✅ [mock-agent] Changes complete!",
      "DONE",
    ];
    let output = "";
    for (const line of mockLines) {
      const chunk = line + "\n";
      output += chunk;
      if (options.onStdoutChunk) {
        options.onStdoutChunk(chunk);
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

  switch (config.kind) {
    case "process": {
      return runProcessAgent({
        config: config as ProcessAgentConfig,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        timeoutSeconds: options.timeoutSeconds,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
      });
    }

    case "claude_sdk": {
      const { runClaudeSdkAgent } = await import("./claude-sdk-runner.js");
      return runClaudeSdkAgent({
        config: config as ClaudeSdkAgentConfig,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        timeoutSeconds: options.timeoutSeconds,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
      });
    }

    case "amp_sdk": {
      const { runAmpSdkAgent } = await import("./amp-sdk-runner.js");
      return runAmpSdkAgent({
        config: config as AmpSdkAgentConfig,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
      });
    }

    case "codex_sdk": {
      const { runCodexSdkAgent } = await import("./codex-sdk-runner.js");
      return runCodexSdkAgent({
        config: config as CodexSdkAgentConfig,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
      });
    }

    case "opencode_sdk": {
      const { runOpenCodeSdkAgent } = await import("./opencode-sdk-runner.js");
      return runOpenCodeSdkAgent({
        config: config as OpenCodeSdkAgentConfig,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
      });
    }

    case "rlm": {
      const { runRlmAgent } = await import("./rlm-runner.js");
      return runRlmAgent({
        config: config as RlmSdkAgentConfig,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        timeoutSeconds: options.timeoutSeconds,
      });
    }

    case "sprite": {
      const { runSpriteAgent } = await import("./sprite-runner.js");
      return runSpriteAgent(config as SpriteAgentConfig, {
        config: config as SpriteAgentConfig,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        timeoutSeconds: options.timeoutSeconds,
      });
    }

    default:
      return exhaustiveCheck(config);
  }
}
