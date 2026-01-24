import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import { registerSdkController, unregisterSdkController } from "./runner.js";
import type { OpenCodeSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import { getAllowedToolsForPhase } from "./toolAllowlist";
import { buildSdkEnv } from "./env.js";

export interface OpenCodeRunAgentOptions {
  config: OpenCodeSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  /** MCP servers to make available to the agent (e.g., wreckit server for PRD capture) */
  mcpServers?: Record<string, unknown>;
  /** Restrict agent to only specific tools (e.g., MCP tools). Prevents use of Read, Write, Bash, etc. */
  allowedTools?: string[];
  /** Current workflow phase for tool allowlist enforcement (Spec 008 Gap 1) */
  phase?: string;
}

/**
 * Get the effective tool allowlist for OpenCode SDK agent.
 *
 * Per Spec 008 Gap 1: "No Enforcement for Non-Ideas Phases"
 * The tool allowlist must be enforced for all SDK runners, not just claude_sdk.
 *
 * Priority:
 * 1. Explicit allowedTools from options (highest priority)
 * 2. Phase-based allowlist from toolAllowlist.ts (if phase specified)
 * 3. undefined (no restrictions - default SDK behavior)
 */
function getEffectiveToolAllowlist(options: OpenCodeRunAgentOptions): string[] | undefined {
  // Explicit allowedTools takes precedence
  if (options.allowedTools !== undefined) {
    return options.allowedTools;
  }

  // Fall back to phase-based allowlist if phase is specified
  if (options.phase) {
    return getAllowedToolsForPhase(options.phase);
  }

  // No restrictions
  return undefined;
}

export async function runOpenCodeSdkAgent(
  options: OpenCodeRunAgentOptions
): Promise<AgentResult> {
  const { cwd, prompt, logger, dryRun, onStdoutChunk, onStderrChunk, onAgentEvent } = options;

  if (dryRun) {
    logger.info("[dry-run] Would run OpenCode SDK agent");
    const effectiveTools = getEffectiveToolAllowlist(options);
    if (effectiveTools) {
      logger.debug(`[dry-run] Tool restrictions: ${effectiveTools.join(", ")}`);
    }
    return {
      success: true,
      output: "[dry-run] OpenCode SDK agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  let output = "";
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const abortController = new AbortController();

  // Default timeout: 3600 seconds (1 hour)
  const timeoutSeconds = 3600;

  // Register for cleanup on exit
  registerSdkController(abortController);

  try {
    // Set up timeout
    if (timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`OpenCode SDK agent timed out after ${timeoutSeconds} seconds`);
        abortController.abort();
      }, timeoutSeconds * 1000);
    }

    // Build environment from ~/.claude/settings.json, process.env, and .wreckit/config*.json
    const sdkEnv = await buildSdkEnv({ cwd, logger });

    // Get effective tool allowlist
    const effectiveTools = getEffectiveToolAllowlist(options);
    if (effectiveTools) {
      logger.info(`Tool restrictions active: ${effectiveTools.join(", ")}`);
    }

    // Build SDK options
    const sdkOptions: any = {
      cwd, // Working directory
      permissionMode: "bypassPermissions", // wreckit runs autonomously
      allowDangerouslySkipPermissions: true, // Required for bypassPermissions
      abortController, // Enable cancellation on TUI quit/signals
      env: sdkEnv, // Pass environment to ensure custom endpoints are honored
      // Pass MCP servers if provided
      ...(options.mcpServers && { mcpServers: options.mcpServers }),
      // Restrict tools if effectiveTools is specified (guardrail to prevent unwanted actions)
      ...(effectiveTools && { tools: effectiveTools }),
    };

    // Run the agent via SDK
    for await (const message of query({ prompt, options: sdkOptions })) {
      if (timedOut) break;

      // Convert SDK message to output string
      const messageText = formatSdkMessage(message);
      output += messageText;

      // Emit structured agent events if callback is provided
      if (onAgentEvent) {
        emitAgentEventsFromSdkMessage(message, onAgentEvent);
      }

      // Route to appropriate callback based on message type
      const isError = message.type === "error" || message.constructor?.name === "ErrorMessage";

      if (messageText) {
        if (isError) {
          if (onStderrChunk) {
            onStderrChunk(messageText);
          } else {
            process.stderr.write(messageText);
          }
        } else {
          if (onStdoutChunk) {
            onStdoutChunk(messageText);
          } else {
            process.stdout.write(messageText);
          }
        }
      }
    }

    if (timeoutId) clearTimeout(timeoutId);

    if (timedOut) {
      return {
        success: false,
        output,
        timedOut: true,
        exitCode: null,
        completionDetected: false,
      };
    }

    // SDK always completes successfully unless it throws
    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    const errorResult = handleSdkError(error, output, logger);

    return {
      success: errorResult.success,
      output: errorResult.output,
      timedOut: false,
      exitCode: errorResult.exitCode,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
  }
}

function handleSdkError(error: any, output: string, logger: Logger): { success: boolean; output: string; exitCode: number | null } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log the error for debugging
  logger.error(`OpenCode SDK error: ${errorMessage}`);
  if (errorStack) {
    logger.debug(errorStack);
  }

  // Authentication errors
  if (
    errorMessage.includes("API key") ||
    errorMessage.includes("401") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("Unauthorized") ||
    errorMessage.includes("anthropic-api-key") ||
    errorMessage.includes("Invalid API key") ||
    errorMessage.includes("/login")
  ) {
    const authHelp = `
❌ Authentication Error: ${errorMessage}

The OpenCode SDK requires explicit API credentials.

To fix this, set credentials in one of these locations (in order of precedence):

  1. .wreckit/config.local.json (recommended, gitignored):
     {
       "agent": {
         "env": {
           "ANTHROPIC_BASE_URL": "https://your-endpoint.example.com",
           "ANTHROPIC_AUTH_TOKEN": "your-token"
         }
       }
     }

  2. Shell environment:
     export ANTHROPIC_BASE_URL=https://your-endpoint.example.com
     export ANTHROPIC_AUTH_TOKEN=your-token

  3. ~/.claude/settings.json:
     {
       "env": {
         "ANTHROPIC_BASE_URL": "https://your-endpoint.example.com",
         "ANTHROPIC_AUTH_TOKEN": "your-token"
       }
     }

  For direct Anthropic API access, use ANTHROPIC_API_KEY instead.

Run 'wreckit sdk-info' to diagnose your current credential configuration.
`;
    return {
      success: false,
      output: output + authHelp,
      exitCode: 1,
    };
  }

  // Rate limit errors
  if (
    errorMessage.includes("rate limit") ||
    errorMessage.includes("429") ||
    errorMessage.includes("too many requests")
  ) {
    return {
      success: false,
      output: output + `\n⚠️ Rate limit exceeded: ${errorMessage}\n\nPlease try again later.\n`,
      exitCode: 1,
    };
  }

  // Context window errors
  if (
    errorMessage.includes("context") ||
    errorMessage.includes("tokens") ||
    errorMessage.includes("too large") ||
    errorMessage.includes("maximum context length")
  ) {
    return {
      success: false,
      output: output + `\n❌ Context error: ${errorMessage}\n\nTry breaking down the task into smaller pieces or reducing the scope.\n`,
      exitCode: 1,
    };
  }

  // Network/connection errors
  if (
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("ENOTFOUND") ||
    errorMessage.includes("network") ||
    errorMessage.includes("connection")
  ) {
    return {
      success: false,
      output: output + `\n❌ Network error: ${errorMessage}\n\nPlease check your internet connection and try again.\n`,
      exitCode: 1,
    };
  }

  // Generic error
  return {
    success: false,
    output: output + `\n❌ Error: ${errorMessage}\n`,
    exitCode: 1,
  };
}

function formatSdkMessage(message: any): string {
  // Handle assistant messages (Claude's reasoning and tool calls)
  if (message.type === "assistant") {
    const content = message.message?.content || message.content || [];
    return content.map((block: any) => {
      if (block.type === "text") return block.text;
      if (block.type === "tool_use") {
        const toolName = block.name;
        const toolInput = JSON.stringify(block.input, null, 2);
        return `\n\`\`\`tool\n${toolName}\n${toolInput}\n\`\`\`\n`;
      }
      return "";
    }).join("\n") || "";
  }

  // Handle tool result messages
  if (message.type === "tool_result") {
    const result = message.result || message.content || "";
    return `\n\`\`\`result\n${result}\n\`\`\`\n`;
  }

  // Handle final result messages - capture the actual result text
  if (message.type === "result") {
    // The 'result' field contains the final text output
    return message.result || "";
  }

  // Handle error messages
  if (message.type === "error") {
    return `\n❌ Error: ${message.message || String(message)}\n`;
  }

  return "";
}

function emitAgentEventsFromSdkMessage(message: any, emit: (event: AgentEvent) => void): void {
  // Handle assistant messages (Claude's reasoning and tool calls)
  if (message.type === "assistant") {
    const content = message.message?.content || message.content || [];
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text" && block.text) {
          emit({ type: "assistant_text", text: block.text });
        }
        if (block.type === "tool_use") {
          emit({
            type: "tool_started",
            toolUseId: block.id || "",
            toolName: block.name || "",
            input: block.input || {},
          });
        }
      }
    }
    return;
  }

  // Handle tool result messages
  if (message.type === "tool_result" || message.constructor?.name === "ToolResultMessage") {
    const result = message.result ?? message.content ?? "";
    const toolUseId = message.tool_use_id || "";
    emit({ type: "tool_result", toolUseId, result });
    return;
  }

  // Handle final result messages
  if (message.type === "result" || message.constructor?.name === "ResultMessage") {
    emit({ type: "run_result", subtype: message.subtype });
    return;
  }

  // Handle error messages
  if (message.type === "error" || message.constructor?.name === "ErrorMessage") {
    emit({ type: "error", message: message.message || String(message) });
    return;
  }
}
