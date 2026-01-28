import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import { registerSdkController, unregisterSdkController } from "./lifecycle.js";
import type { RlmSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import { buildToolRegistry, JSRuntime } from "./rlm-tools.js";
import { buildAxAIEnv } from "./env.js";
import { adaptMcpServersToAxTools } from "./mcp/mcporterAdapter.js";
import {
  AxAgent,
  AxAIAnthropic,
  AxAIOpenAI,
  AxAIGoogleGemini,
  type AxAIService,
  type AxFunction,
} from "@ax-llm/ax";

export interface RlmRunAgentOptions {
  config: RlmSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  phase?: string;
  timeoutSeconds?: number;
}

function handleAxAIError(error: any, logger: Logger): string {
  const msg = error instanceof Error ? error.message : String(error);

  if (
    msg.includes("401") ||
    msg.toLowerCase().includes("auth") ||
    msg.includes("API key")
  ) {
    logger.error(`Authentication Error: ${msg}`);
    return (
      `Authentication Error: Please check your API key.\n` +
      `For Anthropic: Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN\n` +
      `For OpenAI: Set OPENAI_API_KEY\n` +
      `For Google: Set GOOGLE_API_KEY`
    );
  }

  if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
    logger.warn(`Rate Limit Error: ${msg}`);
    return `Rate Limit Error: The AI provider is rejecting requests. Please try again later.`;
  }

  if (msg.includes("context") || msg.includes("too large")) {
    logger.warn(`Context Window Error: ${msg}`);
    return `Context Window Error: The input is too large for the model.`;
  }

  logger.error(`AxAI Error: ${msg}`);
  return `Agent Error: ${msg}`;
}

export async function runRlmAgent(
  options: RlmRunAgentOptions,
): Promise<AgentResult> {
  const { cwd, prompt, logger, dryRun, config, onStdoutChunk, onAgentEvent } =
    options;

  if (dryRun) {
    logger.info("[dry-run] Would run RLM agent");
    return {
      success: true,
      output: "[dry-run] RLM agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  const abortController = new AbortController();
  registerSdkController(abortController);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    // 1. Build Environment
    const env = await buildAxAIEnv({
      cwd,
      logger,
      provider: config.aiProvider,
    });

    // 2. Initialize AI Service
    let ai: AxAIService;

    if (config.aiProvider === "anthropic" || config.aiProvider === "zai") {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY is missing (or ZAI_API_KEY for zai provider)",
        );
      }
      ai = new AxAIAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        apiURL: env.ANTHROPIC_BASE_URL,
        config: { maxRetries: 3 },
      });
    } else if (config.aiProvider === "openai") {
      if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is missing");
      }
      ai = new AxAIOpenAI({
        apiKey: env.OPENAI_API_KEY,
        config: { maxRetries: 3 },
      });
    } else if (config.aiProvider === "google") {
      if (!env.GOOGLE_API_KEY) {
        throw new Error("GOOGLE_API_KEY is missing");
      }
      ai = new AxAIGoogleGemini({
        apiKey: env.GOOGLE_API_KEY,
        config: { maxRetries: 3 },
      });
    } else {
      throw new Error(`Unsupported provider: ${config.aiProvider}`);
    }

    // 3. Initialize JS Runtime (The "RLM" Core)
    // We inject the prompt into the runtime environment instead of the context window.
    const jsRuntime = new JSRuntime({
      CONTEXT_DATA: prompt,
      cwd: cwd,
    });

    // 4. Initialize Tools
    // Pass the runtime so the RunJS tool is available and bound to our context
    const builtInTools = buildToolRegistry(options.allowedTools, jsRuntime);

    let mcpTools: AxFunction[] = [];
    if (options.mcpServers) {
      mcpTools = adaptMcpServersToAxTools(
        options.mcpServers,
        options.allowedTools,
      );
    }

    const tools = [...builtInTools, ...mcpTools];

    if (logger.debug) {
      logger.debug(
        `Loaded ${tools.length} tools for agent (${mcpTools.length} from MCP)`,
      );
    }

    // 5. Initialize Agent
    const agent = new AxAgent({
      ai,
      name: "Wreckit Agent",
      description: `
        You are an expert software engineer.
        The user's request is stored in the global variable 'CONTEXT_DATA' within your JavaScript runtime.
        DO NOT assume you know the request. You MUST inspect 'CONTEXT_DATA' using the RunJS tool.
        You have access to file system tools and shell.
        Follow the instructions carefully and validate your work.
      `,
      signature:
        'task:string "The trigger message" -> answer:string "The final response", justification:string "Detailed reasoning"',
      functions: tools,
    });

    // 6. Setup Timeout
    if (options.timeoutSeconds && options.timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        abortController.abort();
        logger.warn(`Agent timed out after ${options.timeoutSeconds}s`);
      }, options.timeoutSeconds * 1000);
    }

    // 7. Run ReAct Loop
    logger.info(`Starting RLM agent (model: ${config.model})`);

    let fullOutput = "";

    // Instead of passing the full prompt, we pass a trigger message.
    // The agent must "pull" the prompt from the runtime.
    const rlmTrigger =
      "The user's request has been loaded into the global variable `CONTEXT_DATA`. Use the `RunJS` tool to inspect it and begin the task.";

    // AxAgent.streamingForward returns an async generator
    const stream = agent.streamingForward(ai, { task: rlmTrigger });

    for await (const chunk of stream) {
      if (abortController.signal.aborted) {
        throw new Error("Agent aborted");
      }

      // Handle streaming content (Thought/Text)
      // Inspect chunk structure if needed, or assume text/object
      if (typeof chunk === "string") {
        process.stdout.write(chunk);
        fullOutput += chunk;
        if (onStdoutChunk) onStdoutChunk(chunk);
      } else if (chunk && typeof chunk === "object") {
        const c = chunk as any;
        if (c.content) {
          process.stdout.write(c.content);
          fullOutput += c.content;
          if (onStdoutChunk) onStdoutChunk(c.content);
        }

        // Emit events for tool calls if visible in chunk
        // This depends on AxGenDeltaOut structure
        if (c.functionCall && onAgentEvent) {
          onAgentEvent({
            type: "tool_use",
            tool: c.functionCall.name,
            input: c.functionCall.arguments,
          });
        }
      }
    }

    // 8. Cleanup & Return
    if (timeoutId) clearTimeout(timeoutId);

    return {
      success: true,
      output: fullOutput,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    const errorOutput = handleAxAIError(error, logger);

    return {
      success: false,
      output: errorOutput,
      timedOut: error.message === "Agent aborted", // Heuristic
      exitCode: 1,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
  }
}
