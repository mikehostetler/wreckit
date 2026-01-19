import { runAgent, getAgentConfig } from "../agent/runner";
import { loadConfig } from "../config";
import { logger } from "../logging";
import { loadPromptTemplate } from "../prompts";
import type { AgentEvent } from "../tui/agentEvents";
import type { ParsedIdea } from "./ideas";
import { createIdeasMcpServer } from "../agent/mcp/ideasMcpServer";
import { assertPayloadLimits } from "./validation";
import { McpToolNotCalledError } from "../errors";

export interface ParseIdeasOptions {
  verbose?: boolean;
  mockAgent?: boolean;
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
  // Use ideas-only MCP server to reduce blast radius (Gap 2 mitigation)
  let capturedIdeas: ParsedIdea[] = [];
  const ideasServer = createIdeasMcpServer({
    onParsedIdeas: (ideas) => {
      capturedIdeas = ideas;
    },
  });

  // CRITICAL: Only allow the MCP tool - prevent agent from using Read, Write, Bash, etc.
  // This ensures the agent can ONLY extract structured ideas, not implement fixes
  // Using ideas-only server (Gap 2 mitigation) reduces blast radius by not registering
  // tools from other phases (save_prd, update_story_status)
  const result = await runAgent({
    cwd: root,
    prompt,
    config,
    logger,
    mcpServers: { wreckit: ideasServer },
    allowedTools: ["mcp__wreckit__save_parsed_ideas"],
    mockAgent: options.mockAgent,
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

  // SECURITY: MCP tool call is REQUIRED - no JSON fallback (Gap 1 mitigation)
  //
  // Per spec 001-ideas-ingestion.md, Gap 1: "JSON Fallback Bypasses Tool Requirement"
  // The agent MUST call the MCP tool to save ideas. Parsing JSON from text output
  // weakens security by allowing arbitrary content extraction outside the controlled
  // tool channel. This is a fail-closed design - if the tool isn't called, the
  // operation fails rather than falling back to an insecure extraction method.
  if (capturedIdeas.length === 0) {
    throw new McpToolNotCalledError(
      "Agent did not call the required MCP tool (save_parsed_ideas). " +
        "The agent must use the structured tool call to save ideas. " +
        "JSON fallback has been removed for security reasons."
    );
  }

  // Validate payload limits before returning
  assertPayloadLimits(capturedIdeas);
  return capturedIdeas;
}
