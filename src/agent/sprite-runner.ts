import { createAxAI } from "./axai-factory";
import { buildSdkEnv } from "./env";
import { buildRemoteToolRegistry } from "./remote-tools";
import { adaptMcpServersToAxTools } from "./mcp/mcporterAdapter";
import { registerSdkController, unregisterSdkController } from "./lifecycle";
import { AgentEvent } from "../tui/agentEvents";
import { findRepoRoot } from "../fs/paths";
import { syncProjectToVM } from "../fs/sync";
import type { Logger } from "../logging";
import type { SpriteAgentConfig } from "../schemas";
import type { AgentResult } from "./runner";
import type { AxAIService, AxFunction } from "@ax-llm/ax";

// Re-export core primitives
export * from "./sprite-core";

import {
  startSprite,
  listSprites,
  parseWispJson,
  killSprite,
  execSprite,
  type WispSpriteInfo,
} from "./sprite-core";

// ============================================================ 
// Sprite Agent Runner
// ============================================================ 

export interface SpriteRunAgentOptions {
  config: SpriteAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  mockAgent?: boolean;
  timeoutSeconds?: number;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  /** If true, VM will be automatically cleaned up after execution */
  ephemeral?: boolean;
  /** Item ID for VM naming (used when ephemeral is true) */
  itemId?: string;
}

// ============================================================ 
// Ephemeral VM Tracking
// ============================================================ 

interface EphemeralVMInfo {
  vmName: string;
  startTime: number;
}

let currentEphemeralVM: EphemeralVMInfo | null = null;

export function getCurrentEphemeralVM(): EphemeralVMInfo | null {
  return currentEphemeralVM;
}

async function ensureSpriteRunning(
  name: string,
  config: SpriteAgentConfig,
  logger: Logger,
): Promise<boolean> {
  const listResult = await listSprites(config, logger);
  const sprites = parseWispJson(listResult.stdout, logger) as WispSpriteInfo[];

  const exists =
    Array.isArray(sprites) &&
    sprites.some((s) => s.name === name && s.state === "running");

  if (exists) {
    logger.debug(`Sprite VM '${name}' is already running`);
    return true;
  }

  logger.info(`Starting Sprite VM '${name}'...`);
  try {
    const startResult = await startSprite(name, config, logger);
    return startResult.success;
  } catch (err) {
    logger.error(`Failed to start Sprite VM '${name}': ${err}`);
    return false;
  }
}

function handleAxAIError(error: any, logger: Logger): string {
  const msg = error instanceof Error ? error.message : String(error);
  logger.error(`AxAI Error: ${msg}`);
  return `Agent Error: ${msg}`;
}

/**
 * Universal Tool Parser
 * Handles native tool calls AND various XML hallucinations.
 */
function parseToolCalls(content: string, logger: Logger): Array<{ name: string; args: any }> {
    const calls: Array<{ name: string; args: any }> = [];

    // 1. GLM <invoke name="Tool"><parameter name="arg">val</parameter></invoke>
    const invokeRegex = /<invoke\s+name=\"([^\"]+)\">([\s\S]*?)<\/invoke>/g;
    let match;
    while ((match = invokeRegex.exec(content)) !== null) {
        const toolName = match[1];
        const paramsText = match[2];
        const params: Record<string, any> = {};
        const paramRegex = /<parameter\s+name=\"([^\"]+)\">([\s\S]*?)<\/parameter>/g;
        let pMatch;
        while ((pMatch = paramRegex.exec(paramsText)) !== null) {
            params[pMatch[1]] = pMatch[2].trim();
        }
        calls.push({ name: toolName, args: params });
    }

    // 2. GLM <execute><command>...</command></execute>
    const executeRegex = /<(?:execute|execute_command)>([\s\S]*?)<\/(?:execute|execute_command)>/g;
    while ((match = executeRegex.exec(content)) !== null) {
        const inner = match[1];
        const cmdMatch = /<command>([\s\S]*?)<\/command>/.exec(inner);
        if (cmdMatch) {
            calls.push({ name: "Bash", args: { command: cmdMatch[1].trim() } });
        } else {
            // Assume the whole inner text is the command if no <command> tag
            calls.push({ name: "Bash", args: { command: inner.trim() } });
        }
    }

    if (calls.length > 0) {
        logger.debug(`Parsed ${calls.length} tool calls from XML.`);
    }

    return calls;
}

export async function runSpriteAgent(
  config: SpriteAgentConfig,
  options: SpriteRunAgentOptions,
): Promise<AgentResult> {
  const {
    logger,
    dryRun = false,
    mockAgent = false,
    cwd,
    prompt,
    onStdoutChunk,
    onAgentEvent,
    ephemeral = false,
    itemId,
  } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would run Sprite agent in VM: ${config.vmName || "auto-generated"}`);
    return { success: true, output: "[dry-run] No output", timedOut: false, exitCode: 0, completionDetected: true };
  }

  const abortController = new AbortController();
  registerSdkController(abortController);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const vmName = config.vmName || (ephemeral && itemId ? `wreckit-sandbox-${itemId}-${Date.now()}` : `wreckit-sandbox-agent-${Date.now()}`);

  try {
    // 1. Initialize VM
    logger.info(`Initializing Sprite environment (${vmName})...`);
    if (ephemeral) currentEphemeralVM = { vmName, startTime: Date.now() };

    const vmReady = await ensureSpriteRunning(vmName, config, logger);
    if (!vmReady) return { success: false, output: "Failed to initialize Sprite VM", timedOut: false, exitCode: 1, completionDetected: false };

    // 2. Wait & Sync
    await new Promise((resolve) => setTimeout(resolve, 5000));
    logger.info("Synchronizing project to Sprite VM...");
    const projectRoot = findRepoRoot(cwd);
    await syncProjectToVM(vmName, projectRoot, config, logger);

    // 3. Build Environment & Tools
    const env = await buildSdkEnv({ cwd, logger });
    const ai = createAxAI(env, logger);
    const remoteTools = buildRemoteToolRegistry(vmName, config, logger, options.allowedTools);
    let mcpTools: AxFunction[] = [];
    if (options.mcpServers) {
      mcpTools = adaptMcpServersToAxTools(options.mcpServers, options.allowedTools);
    }
    const tools = [...remoteTools, ...mcpTools];

    // 4. Run Loop
    logger.info(`Starting Sprite agent execution in ${vmName}`);
    const messages: any[] = [
      {
        role: "system",
        content: `You are an expert software engineer working inside a sandboxed Linux microVM.
The project has been synchronized to /home/user/project and you are already in this directory.
You can access and modify code there.
Any changes you make will be preserved in the VM and can be pulled back to the host.

Use the provided tools to execute commands and manage files in the VM.
When you are finished, summarize your work and stop.`,
      },
      { role: "user", content: prompt },
    ];

    let fullOutput = "";
    let completionDetected = false;
    let loopCount = 0;
    const MAX_LOOPS = 100;

    if (options.timeoutSeconds && options.timeoutSeconds > 0) {
      timeoutId = setTimeout(() => abortController.abort(), options.timeoutSeconds * 1000);
    }

    while (loopCount < MAX_LOOPS && !completionDetected) {
      if (abortController.signal.aborted) throw new Error("Agent aborted");
      loopCount++;
      
      const response = await ai.chat({
        chatPrompt: messages,
        functions: tools,
        model: config.model,
      }, {
        logger,
        stream: false, // Non-streaming for maximum proxy robustness
        debug: false
      });

      const result = response.results[0];
      if (!result) break;

      // Log text content
      if (result.content) {
        process.stdout.write(result.content);
        fullOutput += result.content;
        if (onStdoutChunk) onStdoutChunk(result.content);
        messages.push({ role: "assistant", content: result.content });
      }

      // Collect Tool Calls (Native + Parsed XML)
      const nativeCalls = result.functionCalls || [];
      const xmlCalls = result.content ? parseToolCalls(result.content, logger) : [];
      const allCalls = [...nativeCalls, ...xmlCalls];

      if (allCalls.length > 0) {
        // If we only have XML calls, we need to push an assistant message to history 
        // to maintain the turn sequence (Assistant Tool Call -> Tool Result)
        if (nativeCalls.length === 0 && result.content) {
            // Already pushed assistant message above
        } else if (nativeCalls.length > 0) {
            // Already pushed assistant message if it had content, but if not:
            if (!result.content) {
                messages.push({ role: "assistant", content: null, functionCalls: nativeCalls });
            } else {
                // Last message already has the content, we just need to make sure 
                // native function calls are linked if the provider requires it.
                messages[messages.length - 1].functionCalls = nativeCalls;
            }
        }

        for (const call of allCalls) {
          const callId = (call as any).id || `synthetic-${Date.now()}`;
          const toolName = (call as any).name || (call as any).function?.name;
          const toolParams = (call as any).args || (call as any).function?.params;

          if (onAgentEvent) {
            onAgentEvent({ type: "tool_started", toolUseId: callId, toolName, input: toolParams });
          }

          let toolResult = "";
          try {
            const toolDef = tools.find(t => t.name.toLowerCase() === toolName.toLowerCase());
            if (toolDef) {
              const args = typeof toolParams === 'string' ? JSON.parse(toolParams) : toolParams;
              toolResult = await toolDef.func(args);
            } else {
              toolResult = `Error: Tool ${toolName} not found`;
            }
          } catch (e: any) { toolResult = `Error: ${e.message}`; } 

          if (onAgentEvent) {
            onAgentEvent({ type: "tool_result", toolUseId: callId, result: toolResult });
          }

                    // Determine feedback mechanism based on call type

                    const isSynthetic = callId.startsWith("synthetic-");

          

                    if (isSynthetic) {

                      // For XML calls, the model didn't use the API, so it doesn't expect a 'function' role response.

                      // We feed it back as a User message representing the "Observation".

                      messages.push({

                        role: "user",

                        content: `[System] Tool '${toolName}' execution result:\n${toolResult}`

                      });

                    } else {

                      // For native calls, use the proper protocol

                      // AxAI/OpenAI typically expects 'function' for function calls

                      messages.push({

                        role: "function",

                        functionId: callId,

                        result: toolResult

                      });

                    }

                  }

          
      } else {
        completionDetected = true;
      }
    }

    if (timeoutId) clearTimeout(timeoutId);

    // 5. Sync Back
    if (config.syncOnSuccess) {
      logger.info("Agent completed, pulling changes from VM...");
      try {
        const { syncProjectFromVM } = await import("../fs/sync.js");
        await syncProjectFromVM(vmName, findRepoRoot(cwd), config, logger);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to pull changes from VM: ${errorMsg}`);
        return { 
          success: false, 
          output: fullOutput, 
          timedOut: false, 
          exitCode: 1, 
          completionDetected: true 
        };
      }
    }

    return { success: true, output: fullOutput, timedOut: false, exitCode: 0, completionDetected: true };

  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    return { success: false, output: handleAxAIError(err, logger), timedOut: err.message === "Agent aborted", exitCode: 1, completionDetected: false };
  } finally {
    unregisterSdkController(abortController);
    if (ephemeral && vmName && !dryRun) {
      try { 
        await killSprite(vmName, config, logger); 
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn(`Failed to cleanup ephemeral VM '${vmName}': ${errorMsg}`);
      }
      currentEphemeralVM = null;
    }
  }
}
