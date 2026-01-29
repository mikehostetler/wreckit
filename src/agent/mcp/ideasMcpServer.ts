import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ParsedIdea } from "../../domain/ideas";

/**
 * Zod schema for a parsed idea.
 * Reused from wreckitMcpServer.ts for consistency.
 */
export const ParsedIdeaSchema = z.object({
  title: z.string().describe("Concise title under 60 characters"),
  description: z.string().describe("1-3 sentence summary of the idea"),
  problemStatement: z
    .string()
    .optional()
    .describe("The core problem being solved"),
  motivation: z.string().optional().describe("Why this matters"),
  successCriteria: z
    .array(z.string())
    .optional()
    .describe("How we know it's working"),
  technicalConstraints: z
    .array(z.string())
    .optional()
    .describe("Implementation constraints"),
  scope: z
    .object({
      inScope: z.array(z.string()).optional(),
      outOfScope: z.array(z.string()).optional(),
    })
    .optional()
    .describe("Scope boundaries"),
  priorityHint: z
    .enum(["low", "medium", "high", "critical"])
    .optional()
    .describe("Inferred priority"),
  urgencyHint: z.string().optional().describe("Timing notes"),
  suggestedSection: z.string().optional().describe("Where this belongs"),
});

/**
 * Handlers for ideas-only MCP server callbacks.
 */
export interface IdeasMcpHandlers {
  onInterviewIdeas?: (ideas: ParsedIdea[]) => void;
  onParsedIdeas?: (ideas: ParsedIdea[]) => void;
}

/**
 * Create an ideas-only MCP server for the ideas ingestion phase.
 *
 * This server only registers tools related to idea capture, following the
 * security model specified in 001-ideas-ingestion.md:
 *
 * "Use a dedicated ingestion-only MCP server that only registers idea-saving tools."
 *
 * This addresses Gap 2 from the spec: "Extra MCP Tools Are Registered"
 *
 * By limiting the registered tools to only idea-related functionality, we reduce
 * the blast radius if allowlist enforcement fails.
 *
 * @param handlers - Callback handlers for tool invocations
 * @returns MCP server instance with only idea-saving tools
 */
export function createIdeasMcpServer(handlers: IdeasMcpHandlers = {}) {
  return createSdkMcpServer({
    name: "wreckit-ideas",
    version: "1.0.0",
    tools: [
      tool(
        "save_interview_ideas",
        "Save captured ideas from an interview session to the wreckit system. Call this tool when the user signals they are done with the interview.",
        {
          ideas: z
            .array(ParsedIdeaSchema)
            .describe("Array of captured ideas from the interview"),
        },
        async (args) => {
          const ideas = args.ideas as ParsedIdea[];
          handlers.onInterviewIdeas?.(ideas);
          return {
            content: [
              {
                type: "text" as const,
                text: `Successfully saved ${ideas.length} idea(s) to wreckit.`,
              },
            ],
          };
        },
      ),
      tool(
        "save_parsed_ideas",
        "Save parsed ideas from a document to the wreckit system. Call this tool after parsing ideas from input text.",
        {
          ideas: z
            .array(ParsedIdeaSchema)
            .describe("Array of parsed ideas from the document"),
        },
        async (args) => {
          const ideas = args.ideas as ParsedIdea[];
          handlers.onParsedIdeas?.(ideas);
          return {
            content: [
              {
                type: "text" as const,
                text: `Successfully saved ${ideas.length} parsed idea(s) to wreckit.`,
              },
            ],
          };
        },
      ),
    ],
  });
}
