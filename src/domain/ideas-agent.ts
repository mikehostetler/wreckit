import { runAgent, getAgentConfig } from "../agent/runner";
import { loadConfig } from "../config";
import { logger } from "../logging";
import { loadPromptTemplate } from "../prompts";
import type { AgentEvent } from "../tui/agentEvents";
import type { ParsedIdea } from "./ideas";
import { createWreckitMcpServer } from "../agent/mcp/wreckitMcpServer";
import { assertPayloadLimits } from "./validation";

export interface ParseIdeasOptions {
  verbose?: boolean;
}

function formatAgentEvent(event: AgentEvent): string {
  switch (event.type) {
    case "assistant_text":
      return `💭 ${event.text.slice(0, 200)}${event.text.length > 200 ? "..." : ""}`;
    case "tool_started":
      return `🔧 Tool: ${event.toolName}`;
    case "tool_result":
      const preview = typeof event.result === "string" 
        ? event.result.slice(0, 100) 
        : JSON.stringify(event.result).slice(0, 100);
      return `   └─ Result: ${preview}${preview.length >= 100 ? "..." : ""}`;
    case "run_result":
      return `✅ ${event.subtype || "Complete"}`;
    case "error":
      return `❌ Error: ${event.message}`;
    default:
      return "";
  }
}

export async function parseIdeasWithAgent(
  text: string,
  root: string,
  options: ParseIdeasOptions = {}
): Promise<ParsedIdea[]> {
  const template = await loadPromptTemplate(root, "ideas");
  const prompt = template.replace("{{input}}", text);

  const resolvedConfig = await loadConfig(root);
  const config = getAgentConfig(resolvedConfig);

  // Capture ideas via MCP tool call
  let capturedIdeas: ParsedIdea[] = [];
  const wreckitServer = createWreckitMcpServer({
    onParsedIdeas: (ideas) => {
      capturedIdeas = ideas;
    },
  });

  // CRITICAL: Only allow the MCP tool - prevent agent from using Read, Write, Bash, etc.
  // This ensures the agent can ONLY extract structured ideas, not implement fixes
  const result = await runAgent({
    cwd: root,
    prompt,
    config,
    logger,
    mcpServers: { wreckit: wreckitServer },
    allowedTools: ["mcp__wreckit__save_parsed_ideas"],
    onStdoutChunk: (chunk: string) => {
      if (options.verbose) {
        process.stdout.write(chunk);
      }
    },
    onStderrChunk: (chunk: string) => {
      if (options.verbose) {
        process.stderr.write(chunk);
      }
    },
    onAgentEvent: (event: AgentEvent) => {
      if (options.verbose) {
        const formatted = formatAgentEvent(event);
        if (formatted) {
          console.log(formatted);
        }
      }
    },
  });

  // If MCP tool was called successfully, return those ideas
  if (capturedIdeas.length > 0) {
    // Validate payload limits before returning
    assertPayloadLimits(capturedIdeas);
    return capturedIdeas;
  }

  // Fallback: Parse JSON from output for backwards compatibility
  const arrayStart = result.output.indexOf('[');
  if (arrayStart === -1) {
    throw new Error("Agent did not return valid JSON array");
  }
  
  // Find the matching closing bracket by counting bracket depth
  let depth = 0;
  let arrayEnd = -1;
  for (let i = arrayStart; i < result.output.length; i++) {
    const char = result.output[i];
    if (char === '[') depth++;
    if (char === ']') depth--;
    if (depth === 0) {
      arrayEnd = i;
      break;
    }
  }
  
  if (arrayEnd === -1) {
    throw new Error("Agent did not return valid JSON array - unclosed bracket");
  }

  const jsonStr = result.output.slice(arrayStart, arrayEnd + 1);
  const parsedIdeas = JSON.parse(jsonStr) as ParsedIdea[];

  // Validate payload limits for fallback path as well
  assertPayloadLimits(parsedIdeas);
  return parsedIdeas;
}
