import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ParsedIdea } from "../../domain/ideas";
import { ParsedIdeaSchema } from "./ideasMcpServer";

/**
 * Handlers for dream MCP server callbacks.
 */
export interface DreamMcpHandlers {
  onDreamIdeas?: (ideas: ParsedIdea[]) => void;
}

/**
 * Create a dream-only MCP server for autonomous ideation.
 *
 * This server only registers the dream_ideas tool, following the security model:
 * - Focused tool registration reduces blast radius
 * - Callback pattern enables validation before persistence
 * - Fail-closed: tool call is REQUIRED (no JSON fallback)
 *
 * @param handlers - Callback handlers for tool invocations
 * @returns MCP server instance with only dream ideas tool
 */
export function createDreamMcpServer(handlers: DreamMcpHandlers = {}) {
  return createSdkMcpServer({
    name: "wreckit-dream",
    version: "1.0.0",
    tools: [
      tool(
        "save_dream_ideas",
        "Save autonomously generated ideas from the Dreamer agent to the wreckit system. " +
        "Call this tool after analyzing the codebase for TODOs, FIXMEs, technical debt, and gaps. " +
        "Each idea MUST include evidence (file paths, line numbers) and be checked against existing items.",
        {
          ideas: z.array(ParsedIdeaSchema).describe(
            "Array of autonomously generated ideas from codebase analysis. " +
            "Each idea must have a title starting with '[DREAMER]' for loop prevention."
          ),
        },
        async (args) => {
          const ideas = args.ideas as ParsedIdea[];
          handlers.onDreamIdeas?.(ideas);
          return {
            content: [{
              type: "text" as const,
              text: `Successfully saved ${ideas.length} dream idea(s) to wreckit.`,
            }],
          };
        }
      ),
    ],
  });
}
