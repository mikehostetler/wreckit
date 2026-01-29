import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ParsedIdea } from "../../domain/ideas";
import type { Prd, Story, StoryStatus } from "../../schemas";
import {
  verifyStoryCompletion,
  type StoryCompletionVerification,
} from "../../domain/validation";

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

export const StorySchema = z.object({
  id: z.string().describe("Story ID like US-001"),
  title: z.string().describe("Short title describing the story"),
  acceptance_criteria: z
    .array(z.string())
    .describe("Specific, testable acceptance criteria"),
  priority: z.number().describe("Priority (1 = highest)"),
  status: z.enum(["pending", "done"]).describe("Story status"),
  notes: z.string().describe("Implementation notes (can be empty string)"),
});

export const PrdDataSchema = z.object({
  schema_version: z.literal(1).describe("Always 1"),
  id: z.string().describe("Item ID"),
  branch_name: z.string().describe("Git branch name for this item"),
  user_stories: z.array(StorySchema).describe("Array of user stories"),
});

export interface WreckitMcpHandlers {
  onInterviewIdeas?: (ideas: ParsedIdea[]) => void;
  onParsedIdeas?: (ideas: ParsedIdea[]) => void;
  onSavePrd?: (prd: Prd) => void;
  onUpdateStoryStatus?: (
    storyId: string,
    status: StoryStatus,
    verification: StoryCompletionVerification | null,
  ) => void;
  getPrd?: () => Prd | null;
}

export function createWreckitMcpServer(handlers: WreckitMcpHandlers = {}) {
  return createSdkMcpServer({
    name: "wreckit",
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
      tool(
        "save_prd",
        "Save the PRD (Product Requirements Document) with user stories. Call this tool during the planning phase after creating the implementation plan.",
        {
          prd: PrdDataSchema.describe("The PRD with user stories"),
        },
        async (args) => {
          const prd = args.prd as Prd;
          handlers.onSavePrd?.(prd);
          return {
            content: [
              {
                type: "text" as const,
                text: `Successfully saved PRD with ${prd.user_stories.length} user stories.`,
              },
            ],
          };
        },
      ),
      tool(
        "update_story_status",
        "Update the status of a user story. Call this tool after completing implementation of a story.",
        {
          story_id: z.string().describe("The story ID (e.g., US-001)"),
          status: z.enum(["pending", "done"]).describe("The new status"),
        },
        async (args) => {
          const { story_id, status } = args;

          let verification: StoryCompletionVerification | null = null;
          let responseText = `Updated story ${story_id} status to '${status}'.`;

          if (status === "done") {
            const prd = handlers.getPrd?.() ?? null;
            verification = verifyStoryCompletion(story_id, prd);

            if (verification.warnings.length > 0) {
              responseText += `\n\nVerification warnings:\n${verification.warnings.map((w) => `- ${w}`).join("\n")}`;
            }
            if (verification.errors.length > 0) {
              responseText += `\n\nVerification errors:\n${verification.errors.map((e) => `- ${e}`).join("\n")}`;
            }
          }

          handlers.onUpdateStoryStatus?.(
            story_id,
            status as StoryStatus,
            verification,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: responseText,
              },
            ],
          };
        },
      ),
    ],
  });
}
