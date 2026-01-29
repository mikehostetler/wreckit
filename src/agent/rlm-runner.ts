import { Anthropic } from "@anthropic-ai/sdk";
import { createAxAI } from "./axai-factory";
import { buildSdkEnv } from "./env";
import { buildToolRegistry, JSRuntime, defaultLocalExecutor, type Executor } from "./rlm-tools";
import { buildRemoteToolRegistry } from "./remote-tools";
import { adaptMcpServersToAxTools } from "./mcp/mcporterAdapter";
import { registerSdkController, unregisterSdkController } from "./lifecycle";
import { AgentEvent } from "../tui/agentEvents";
import { findRepoRoot } from "../fs/paths";
import { syncProjectToVM, syncProjectFromVM } from "../fs/sync";
import type { Logger } from "../logging";
import type { RlmSdkAgentConfig } from "../schemas";
import type { AgentResult } from "./runner";
import type { AxFunction } from "@ax-llm/ax";

import {
  startSprite,
  listSprites,
  parseWispJson,
  killSprite,
  execSprite,
  type WispSpriteInfo,
} from "./sprite-core";

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
  itemId?: string;
}

async function ensureSpriteRunning(
  name: string,
  config: any,
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

function truncate(str: string, length: number = 20000): string {
    if (!str || str.length <= length) return str;
    return str.slice(0, length) + `\n...[truncated ${str.length - length} chars]...`;
}

function parseToolCalls(content: string, logger: Logger): Array<{ name: string; args: any; error?: string }> {
    const calls: Array<{ name: string; args: any; error?: string }> = [];

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

    const executeRegex = /<(?:execute|execute_command)>([\s\S]*?)<\/(?:execute|execute_command)>/g;
    while ((match = executeRegex.exec(content)) !== null) {
        const inner = match[1];
        const cmdMatch = /<command>([\s\S]*?)<\/command>/.exec(inner);
        if (cmdMatch) {
            calls.push({ name: "Bash", args: { command: cmdMatch[1].trim() } });
        } else {
            calls.push({ name: "Bash", args: { command: inner.trim() } });
        }
    }

    const toolCallRegex = /<tool_call>\s*([a-zA-Z0-9_]+)\s*([\s\S]*?)\s*<\/tool_call>/g;
    while ((match = toolCallRegex.exec(content)) !== null) {
        const toolName = match[1];
        let argsStr = match[2];
        if (argsStr.startsWith('"') && argsStr.endsWith('"')) {
             try { 
               argsStr = JSON.parse(argsStr); 
             } catch (err) {
               // Quoted string wasn't valid JSON, use original string
               const errorMsg = err instanceof Error ? err.message : String(err);
               logger.debug(`Failed to parse quoted tool args, using raw string: ${errorMsg}`);
             }
        }
        let args = {};
        let error: string | undefined;
        try {
            args = JSON.parse(argsStr);
        } catch (e: any) {
            if (toolName === "RunJS") {
                args = { code: argsStr };
            } else {
                error = `Invalid JSON arguments: ${e.message}`;
                // Keep the raw string as 'content' or similar for debugging if needed?
                // For now, fail fast.
            }
        }
        calls.push({ name: toolName, args, error });
    }

    const runJsRegex = /<RunJS>([\s\S]*?)<\/RunJS>/g;
    while ((match = runJsRegex.exec(content)) !== null) {
        const inner = match[1].trim();
        let args = { code: inner };
        try {
            const json = JSON.parse(inner);
            if (json.code) args = json;
        } catch {}
        calls.push({ name: "RunJS", args });
    }

    if (calls.length > 0) logger.debug(`Parsed ${calls.length} tool calls from XML.`);
    return calls;
}

async function simpleAnthropicChat(
    baseUrl: string, 
    apiKey: string, 
    authToken: string | undefined, 
    body: any,
    logger: Logger
): Promise<any> {
    let url = baseUrl;
    if (!url.endsWith("/")) url += "/";
    if (!url.includes("/v1/")) url += "v1/";
    if (!url.endsWith("/messages") && !url.endsWith("/messages/")) url += "messages";
    
    const headers: any = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey
    };
    if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
        delete headers["x-api-key"]; 
    }

    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic API Error ${res.status}: ${text}`);
    }

    return await res.json();
}

export async function runRlmAgent(
  options: RlmRunAgentOptions,
): Promise<AgentResult> {
  const {
    cwd,
    prompt,
    logger,
    dryRun,
    config,
    onStdoutChunk,
    onStderrChunk,
    onAgentEvent,
  } = options;

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
  let vmName: string | undefined;

  try {
    const env = await buildSdkEnv({ cwd, logger });
    
    // Debug logging for Auth troubleshooting
    logger.debug(`RLM Runner Env check:
      CWD: ${cwd}
      Base URL: ${env.ANTHROPIC_BASE_URL}
      Token present: ${!!env.ANTHROPIC_AUTH_TOKEN}
      Token prefix: ${env.ANTHROPIC_AUTH_TOKEN ? env.ANTHROPIC_AUTH_TOKEN.substring(0, 15) + '...' : 'N/A'}
      Model: ${config.model}
    `);

    let executor: Executor = defaultLocalExecutor;

    if (config.sandbox) {
      vmName = `wreckit-rlm-sandbox-${Date.now()}`;
      const spriteConfig = {
        kind: "sprite" as const,
        wispPath: config.wispPath || "sprite",
        token: env.SPRITES_TOKEN,
        timeout: 300,
        ...config,
      };

      logger.info(`Initializing RLM Sandbox (${vmName})...`);
      const vmReady = await ensureSpriteRunning(vmName, spriteConfig, logger);
      if (!vmReady) throw new Error("Failed to initialize RLM Sandbox VM");

      logger.debug("Waiting for VM network stabilization...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      logger.info("Synchronizing project to RLM Sandbox...");
      const projectRoot = findRepoRoot(cwd);
      await syncProjectToVM(vmName, projectRoot, spriteConfig as any, logger);

      executor = async (command: string) => {
        const remoteCwd = "/home/user/project";
        const wrappedCommand = `cd ${remoteCwd} && ${command}`;
        logger.debug(`[RemoteExec] ${wrappedCommand}`);
        const result = await execSprite(
          vmName!,
          ["sh", "-c", wrappedCommand],
          spriteConfig as any,
          logger,
        );
        return {
          stdout: result.stdout,
          stderr: result.stderr || result.error || "",
        };
      };
    }

    let builtInAxTools: AxFunction[];

    if (config.sandbox && vmName) {
      const spriteConfig = {
        kind: "sprite" as const,
        wispPath: config.wispPath || "sprite",
        token: env.SPRITES_TOKEN,
        timeout: 300,
        ...config,
      };
      builtInAxTools = buildRemoteToolRegistry(
        vmName,
        spriteConfig as any,
        logger,
        options.allowedTools,
      );
    } else {
      builtInAxTools = buildToolRegistry(
        options.allowedTools,
        undefined, // No JS Runtime
        executor,
      );
    }

    let mcpAxTools: AxFunction[] = [];
    if (options.mcpServers) {
      mcpAxTools = adaptMcpServersToAxTools(
        options.mcpServers,
        options.allowedTools,
      );
    }

    let completionDetected = false;
    const taskCompleteTool: AxFunction = {
      name: "TaskComplete",
      description: "Call this tool when you have completed the assigned task. Provide a summary of what was done.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Summary of work completed" }
        },
        required: ["summary"]
      } as any,
      func: async ({ summary }: { summary: string }) => {
        completionDetected = true;
        const msg = `\n\n=== TASK COMPLETED ===\n${summary}\n`;
        process.stdout.write(msg);
        if (onStdoutChunk) onStdoutChunk(msg);
        return `Task Marked Complete. Summary: ${summary}`;
      }
    };

    const tools = [...builtInAxTools, ...mcpAxTools, taskCompleteTool];
    const bash = tools.find(t => t.name === "Bash");
    if (bash) tools.push({ ...bash, name: "execute_command", description: "Alias for Bash" });

    const ai = createAxAI(env, logger);

    logger.info(`Starting RLM agent (model: ${config.model || "default"})`);

    // Map host CWD to guest CWD for the agent's context
    const projectRoot = findRepoRoot(cwd);
    const relativeCwd = cwd.startsWith(projectRoot) ? cwd.slice(projectRoot.length) : "";
    const agentCwd = config.sandbox ? `/home/user/project${relativeCwd}` : cwd;

    const prdInfo = options.itemId 
      ? `\nYour task is defined in the PRD at .wreckit/items/${options.itemId}/prd.json. You should update this file to mark stories as 'done' when completed.`
      : "";

    const systemPrompt = `You are an expert software engineer working in a sandboxed environment.
The project is located at /home/user/project and you are currently working in ${agentCwd}.
You have access to tools to execute commands (Bash), read/write files, and manage the project.${prdInfo}

Your goal is to complete the user's request provided below.

IMPORTANT INSTRUCTIONS:
1. ALWAYS use relative paths (e.g., "./src/index.ts") or absolute paths inside /home/user/project.
2. DO NOT use paths starting with /Users/ or C:/ - these do not exist in your environment.
3. When you are finished, YOU MUST CALL the 'TaskComplete' tool.
4. If you want to run commands, use the 'Bash' tool (or 'execute_command').
`;

    const messages: any[] = [
      { role: "user", content: `${systemPrompt}\n\n${prompt}` }
    ];

    let fullOutput = "";
    let loopCount = 0;
    const MAX_LOOPS = config.maxIterations || 100;

    if (options.timeoutSeconds && options.timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        abortController.abort();
        logger.warn(`Agent timed out after ${options.timeoutSeconds}s`);
      }, options.timeoutSeconds * 1000);
    }

    while (loopCount < MAX_LOOPS && !completionDetected) {
      if (abortController.signal.aborted) throw new Error("Agent aborted");
      loopCount++;

      const response = await simpleAnthropicChat(
           env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
           env.ANTHROPIC_API_KEY || "dummy",
           env.ANTHROPIC_AUTH_TOKEN,
           {
               model: config.model || "glm-4.7",
               max_tokens: 4096,
               system: systemPrompt,
               messages: messages,
               tools: tools.map(t => ({
                   name: t.name,
                   description: t.description,
                   input_schema: t.parameters
               }))
           },
           logger
       );

      logger.debug(`DEBUG RESPONSE: ${JSON.stringify(response, null, 2)}`);

      if (response.error) {
          throw new Error(`Anthropic API Error: ${response.error.message}`);
      }

      messages.push({ role: "assistant", content: response.content });

      let turnOutput = "";
      const contentParts: any[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
            process.stdout.write(block.text);
            turnOutput += block.text;
            if (onStdoutChunk) onStdoutChunk(block.text);

            const xmlCalls = parseToolCalls(block.text, logger);
            for (const call of xmlCalls) {
                const callId = `synthetic-${Date.now()}-${Math.random()}`;
                if (onAgentEvent) onAgentEvent({ type: "tool_started", toolUseId: callId, toolName: call.name, input: call.args });
                
                let result = "";
                if (call.error) {
                    result = `Error: ${call.error}`;
                } else {
                    try {
                        const tool = tools.find(t => t.name.toLowerCase() === call.name.toLowerCase());
                        if (tool) result = await tool.func(call.args);
                        else result = `Error: Tool ${call.name} not found`;
                            } catch (e: any) { 
                        logger.debug(`Tool execution error: ${e.message}`);
                        result = `Error: ${e.message}`; 
                    }
                }
                
                result = truncate(result);

                if (onAgentEvent) onAgentEvent({ type: "tool_result", toolUseId: callId, result });
                
                contentParts.push({
                    type: "text",
                    text: `[System] Tool '${call.name}' execution result:\n${result}`
                });
            }
        } else if (block.type === "tool_use") {
            if (onAgentEvent) onAgentEvent({ type: "tool_started", toolUseId: block.id, toolName: block.name, input: block.input });
            
            let result = "";
            try {
                const tool = tools.find(t => t.name === block.name);
                if (tool) result = await tool.func(block.input);
                else result = `Error: Tool ${block.name} not found`;
                    } catch (e: any) { 
                        logger.debug(`Tool execution error: ${e.message}`);
                        result = `Error: ${e.message}`; 
                    }

            result = truncate(result);

            if (onAgentEvent) onAgentEvent({ type: "tool_result", toolUseId: block.id, result });

            contentParts.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result
            });
        }
      }
      
      fullOutput += turnOutput;

      if (contentParts.length > 0) {
          messages.push({ role: "user", content: contentParts as any });
      }
    }

    if (timeoutId) clearTimeout(timeoutId);

    // === SYNC BACK ===
    // Default to true if undefined
    if (vmName && config.sandbox && config.syncOnSuccess !== false) {
      logger.info("Agent completed successfully, pulling changes from VM...");
      try {
        const projectRoot = findRepoRoot(cwd);
        await syncProjectFromVM(vmName, projectRoot, config as any, logger);
        logger.info("Changes pulled from VM successfully");
      } catch (err) {
        const msg = `Error pulling changes from VM: ${(err as Error).message}`;
        logger.error(msg);
        return {
          success: false, // Fail the run if sync fails!
          output: fullOutput + "\n" + msg,
          timedOut: false,
          exitCode: 1,
          completionDetected: true,
        };
      }
    }

    return {
      success: true,
      output: fullOutput,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };

  } catch (error: any) {
    logger.error(`CRITICAL AGENT ERROR: ${error}`);
    if (timeoutId) clearTimeout(timeoutId);
    return {
      success: false,
      output: error.message,
      timedOut: false,
      exitCode: 1,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
    if (vmName && config.sandbox) {
      try {
        await killSprite(
          vmName,
          { wispPath: "sprite", ...config } as any,
          logger,
        );
        logger.info(`RLM Sandbox VM ${vmName} cleaned up`);
      } catch (e) {
        logger.warn(`Failed to cleanup RLM Sandbox VM: ${e}`);
      }
    }
  }
}