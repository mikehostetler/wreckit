import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "../logging";
import type { AgentConfig, AgentResult, RunAgentOptions } from "./runner.js";
import { registerSdkController, unregisterSdkController } from "./runner.js";

export async function runSdkAgent(options: RunAgentOptions, config: AgentConfig): Promise<AgentResult> {
  const { cwd, prompt, logger, onStdoutChunk, onStderrChunk } = options;
  let output = "";
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const abortController = new AbortController();

  // Register for cleanup on exit
  registerSdkController(abortController);

  try {
    // Set up timeout
    if (config.timeout_seconds > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`SDK agent timed out after ${config.timeout_seconds} seconds`);
        abortController.abort();
      }, config.timeout_seconds * 1000);
    }

    // Build SDK options
    const sdkOptions: any = {
      permissionMode: "bypassPermissions", // wreckit runs autonomously
      abortController, // Enable cancellation on TUI quit/signals
      // Use custom tools if specified, otherwise use default tools
      ...(config.sdk_tools && { allowedTools: config.sdk_tools }),
    };

    // Add optional SDK configuration
    if (config.sdk_model) {
      sdkOptions.model = config.sdk_model;
    }
    if (config.sdk_max_tokens) {
      sdkOptions.maxTokens = config.sdk_max_tokens;
    }

    // Run the agent via SDK
    for await (const message of query(prompt, sdkOptions)) {
      if (timedOut) break;

      // Convert SDK message to output string
      const messageText = formatSdkMessage(message);
      output += messageText;

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
  logger.error(`SDK error: ${errorMessage}`);
  if (errorStack) {
    logger.debug(errorStack);
  }

  // Authentication errors
  if (
    errorMessage.includes("API key") ||
    errorMessage.includes("401") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("Unauthorized") ||
    errorMessage.includes("anthropic-api-key")
  ) {
    return {
      success: false,
      output: output + `\n❌ Authentication Error: ${errorMessage}\n\nPlease ensure ANTHROPIC_API_KEY is set or run 'claude' to authenticate.\n`,
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
  if (message.type === "assistant" || message.constructor?.name === "AssistantMessage") {
    return message.content?.map((block: any) => {
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
  if (message.type === "tool_result" || message.constructor?.name === "ToolResultMessage") {
    const result = message.result || message.content || "";
    return `\n\`\`\`result\n${result}\n\`\`\`\n`;
  }

  // Handle final result messages
  if (message.type === "result" || message.constructor?.name === "ResultMessage") {
    return `\n✅ ${message.subtype || "Complete"}\n`;
  }

  // Handle error messages
  if (message.type === "error" || message.constructor?.name === "ErrorMessage") {
    return `\n❌ Error: ${message.message || String(message)}\n`;
  }

  return "";
}
