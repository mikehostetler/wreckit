import * as readline from "node:readline";
import {
  unstable_v2_createSession,
  query,
} from "@anthropic-ai/claude-agent-sdk";

type SessionType = Awaited<ReturnType<typeof unstable_v2_createSession>>;
import { loadPromptTemplate } from "../prompts";
import type { ParsedIdea } from "./ideas";
import { createIdeasMcpServer } from "../agent/mcp/ideasMcpServer";
import { buildSdkEnv } from "../agent/env";
import { createLogger } from "../logging";
import { hasUncommittedChanges, isGitRepo } from "../git";
import { assertPayloadLimits } from "./validation";
import { McpToolNotCalledError } from "../errors";

export interface InterviewOptions {
  verbose?: boolean;
  logger?: unknown;
}

// ANSI color codes for terminal formatting
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

const fmt = {
  bold: (s: string) => `${colors.bold}${s}${colors.reset}`,
  dim: (s: string) => `${colors.dim}${s}${colors.reset}`,
  cyan: (s: string) => `${colors.cyan}${s}${colors.reset}`,
  green: (s: string) => `${colors.green}${s}${colors.reset}`,
  yellow: (s: string) => `${colors.yellow}${s}${colors.reset}`,
  blue: (s: string) => `${colors.blue}${s}${colors.reset}`,
  magenta: (s: string) => `${colors.magenta}${s}${colors.reset}`,
  gray: (s: string) => `${colors.gray}${s}${colors.reset}`,
};

/**
 * Simple markdown renderer for terminal output.
 * Handles: **bold**, *italic*, headers, lists, and code blocks.
 */
function renderMarkdown(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => {
        // Headers
        if (line.startsWith("### ")) {
          return fmt.bold(line.slice(4));
        }
        if (line.startsWith("## ")) {
          return fmt.bold(line.slice(3));
        }
        if (line.startsWith("# ")) {
          return fmt.bold(line.slice(2));
        }
        // Bullet points - add color
        if (line.match(/^\s*[-*]\s/)) {
          return line.replace(
            /^(\s*)([-*])(\s)/,
            `$1${colors.cyan}•${colors.reset}$3`,
          );
        }
        // Numbered lists
        if (line.match(/^\s*\d+\.\s/)) {
          return line.replace(
            /^(\s*)(\d+\.)(\s)/,
            `$1${colors.cyan}$2${colors.reset}$3`,
          );
        }
        return line;
      })
      .join("\n")
      // Bold **text**
      .replace(/\*\*([^*]+)\*\*/g, `${colors.bold}$1${colors.reset}`)
      // Italic *text*
      .replace(/\*([^*]+)\*/g, `${colors.dim}$1${colors.reset}`)
      // Inline code `text`
      .replace(/`([^`]+)`/g, `${colors.cyan}$1${colors.reset}`)
  );
}

/**
 * Simple terminal spinner for showing activity.
 */
function createSpinner(message: string) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  return {
    start() {
      process.stdout.write(
        `${colors.dim}${frames[0]} ${message}${colors.reset}`,
      );
      interval = setInterval(() => {
        i = (i + 1) % frames.length;
        process.stdout.write(
          `\r${colors.dim}${frames[i]} ${message}${colors.reset}`,
        );
      }, 80);
    },
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      // Clear the spinner line
      process.stdout.write("\r" + " ".repeat(message.length + 3) + "\r");
    },
  };
}

/**
 * Check if user input signals they want to finish the interview.
 */
function isDoneSignal(input: string): boolean {
  const normalized = input.toLowerCase().trim();
  const doneWords = [
    "done",
    "finished",
    "that's it",
    "thats it",
    "that is it",
    "create it",
    "create the item",
    "make it",
    "looks good",
    "lgtm",
    "ship it",
    "save it",
    "yes",
    "yep",
    "yeah",
    "y",
    "ok",
    "okay",
    "sure",
    "go ahead",
    "do it",
  ];
  return doneWords.some(
    (word) => normalized === word || normalized.startsWith(word + " "),
  );
}

/**
 * Check if user input signals they want to cancel.
 */
function isCancelSignal(input: string): boolean {
  const normalized = input.toLowerCase().trim();
  const cancelWords = [
    "quit",
    "exit",
    "cancel",
    "abort",
    "nevermind",
    "never mind",
    "q",
  ];
  return cancelWords.includes(normalized);
}

/**
 * Finish the interview - use query() with resume to pipe transcript to MCP tool.
 * Returns the parsed ideas array.
 */
async function finishInterview(
  session: SessionType,
  sessionId: string,
  verbose?: boolean,
  sdkEnv?: Record<string, string>,
): Promise<ParsedIdea[]> {
  const spinner = createSpinner("Finishing...");
  spinner.start();

  // First, send a wrap-up message to the session to get a summary
  session.send(
    "The user is done. Give a ONE sentence summary of what was captured. " +
      "Do NOT output JSON or ask any more questions.",
  );

  let assistantResponse = "";
  for await (const message of session.stream()) {
    if (message.type === "assistant") {
      const content = message.message?.content || [];
      for (const block of content) {
        if (block.type === "text") {
          assistantResponse += block.text;
        }
      }
    }
  }

  // Show the summary
  spinner.stop();
  const rendered = renderMarkdown(assistantResponse.trim());
  console.log(fmt.magenta("Agent:"));
  console.log(rendered);
  console.log("");

  // Now use query() with resume to pipe the transcript to MCP for structured extraction
  const extractSpinner = createSpinner("Extracting ideas...");
  extractSpinner.start();

  // Use ideas-only MCP server to reduce blast radius (Gap 2 mitigation)
  let capturedIdeas: ParsedIdea[] = [];
  const ideasServer = createIdeasMcpServer({
    onInterviewIdeas: (ideas) => {
      capturedIdeas = ideas;
    },
  });

  try {
    for await (const message of query({
      prompt:
        "Based on our interview conversation, extract and structure the ideas discussed. " +
        "Call the save_interview_ideas tool with the properly structured ideas array. " +
        "Include all fields that were discussed: title, description, problem statement, " +
        "success criteria, constraints, scope, etc. " +
        "DO NOT implement any fixes or make any code changes - only extract structured data.",
      options: {
        resume: sessionId,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        mcpServers: { wreckit: ideasServer },
        // CRITICAL: Only allow the MCP tool - prevent agent from using Read, Write, Bash, etc.
        // This ensures the agent can ONLY extract structured data, not implement fixes
        // Using ideas-only server (Gap 2 mitigation) reduces blast radius
        allowedTools: ["mcp__wreckit__save_interview_ideas"],
        // Pass environment for custom credentials
        env: sdkEnv,
      },
    })) {
      if (verbose && message.type === "assistant") {
        const content = (message as any).message?.content || [];
        for (const block of content) {
          if (block.type === "text") {
            process.stdout.write(block.text);
          }
        }
      }
    }
  } catch (error) {
    extractSpinner.stop();
    console.error("\x1b[31mFailed to extract ideas via MCP tool\x1b[0m");
    console.error(
      fmt.yellow(
        "The agent must call the save_interview_ideas tool to capture ideas.",
      ),
    );
    console.error(
      fmt.yellow("JSON fallback has been removed for security reasons."),
    );
    throw new McpToolNotCalledError(
      "Agent did not call the required MCP tool (save_interview_ideas). " +
        "The agent must use the structured tool call to save ideas from interviews. " +
        "JSON fallback has been removed for security reasons.",
    );
  }

  extractSpinner.stop();

  // SECURITY: MCP tool call is REQUIRED - no JSON fallback (Gap 1 mitigation)
  //
  // Per spec 001-ideas-ingestion.md, Gap 1: "JSON Fallback Bypasses Tool Requirement"
  // The agent MUST call the MCP tool to save ideas. Parsing JSON from text output
  // weakens security by allowing arbitrary content extraction outside the controlled
  // tool channel. This is a fail-closed design - if the tool isn't called, the
  // operation fails rather than falling back to an insecure extraction method.
  if (capturedIdeas.length === 0) {
    console.error(
      "\x1b[31mFailed to extract ideas - MCP tool was not called\x1b[0m",
    );
    console.error(
      fmt.yellow(
        "The agent must call the save_interview_ideas tool to capture ideas.",
      ),
    );
    throw new McpToolNotCalledError(
      "Agent did not call the required MCP tool (save_interview_ideas). " +
        "The agent must use the structured tool call to save ideas from interviews. " +
        "JSON fallback has been removed for security reasons.",
    );
  }

  // Validate payload limits before returning
  try {
    assertPayloadLimits(capturedIdeas);
  } catch (error) {
    const err = error as Error;
    console.error(fmt.yellow(`Warning: ${err.message}`));
    console.error(
      fmt.yellow("Some ideas may not have been captured correctly."),
    );
    return [];
  }
  console.log(fmt.green(`✓ Captured ${capturedIdeas.length} idea(s)`));
  return capturedIdeas;
}

/**
 * Run an interactive interview session with the user to capture their idea.
 * Uses Claude SDK V2 for multi-turn conversation.
 */
export async function runIdeaInterview(
  root: string,
  options: InterviewOptions = {},
): Promise<ParsedIdea[]> {
  const systemPrompt = await loadPromptTemplate(root, "interview");

  // Build SDK environment to pass custom credentials (ANTHROPIC_AUTH_TOKEN, etc.)
  const logger = createLogger({ verbose: options.verbose });
  const sdkEnv = await buildSdkEnv({ cwd: root, logger });

  // Warn if user has uncommitted changes before starting interview
  const inGitRepo = await isGitRepo(root);
  if (inGitRepo) {
    const hasChanges = await hasUncommittedChanges({ cwd: root, logger });
    if (hasChanges) {
      console.log("");
      console.log("⚠️  You have uncommitted changes.");
      console.log("  The idea phase is for planning and exploration only.");
      console.log(
        "  The agent is configured to read-only and cannot make code changes.",
      );
      console.log(
        "  You may want to commit or stash your work first for a clean slate.",
      );
      console.log("");
    }
  }

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askUser = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  let session: SessionType | null = null;
  let sessionId: string | null = null;
  let conversationLog: string[] = [];
  let ideas: ParsedIdea[] = [];

  try {
    // Create a new session with the interview system prompt
    session = await unstable_v2_createSession({
      systemPrompt,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Limit tools since this is just a conversation
      tools: ["AskUserQuestion"],
      // Pass environment to use custom credentials (ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL)
      env: sdkEnv,
    } as any); // Cast to any since env may not be in the type definition yet

    // Start the conversation - get user's idea FIRST
    console.log("");
    console.log(fmt.gray("─".repeat(60)));
    console.log(fmt.bold(" 🚀  Capture a new idea"));
    console.log(fmt.gray("─".repeat(60)));
    console.log(fmt.dim("Type 'done' when finished, 'quit' to cancel"));
    console.log("");
    console.log(
      "What's your idea? " + fmt.dim("(Just describe it in your own words)"),
    );
    console.log("");

    // Get the user's initial idea before involving the agent
    const initialIdea = await askUser(`${fmt.green("You:   ")}`);

    // Check for cancel/empty
    if (isCancelSignal(initialIdea) || !initialIdea.trim()) {
      console.log("");
      console.log(fmt.yellow("No idea provided. Cancelled."));
      rl.close();
      return [];
    }

    conversationLog.push(`User: ${initialIdea}`);

    // Send to agent with context - skip the greeting, go straight to follow-ups
    session.send(
      `The user has described their idea: "${initialIdea}"\n\n` +
        "Skip the greeting - they've already started. Ask 1-2 clarifying questions to fill in gaps " +
        "(success criteria, constraints, scope). Be concise.",
    );

    // Main conversation loop
    let isComplete = false;

    while (!isComplete) {
      // Show spinner while waiting for agent
      const spinner = createSpinner("Thinking...");
      spinner.start();

      // Collect the assistant's response
      let assistantResponse = "";

      for await (const message of session.stream()) {
        // Capture session ID from any message
        if (message.session_id && !sessionId) {
          sessionId = message.session_id;
        }

        if (message.type === "assistant") {
          const content = message.message?.content || [];
          for (const block of content) {
            if (block.type === "text") {
              assistantResponse += block.text;
            }
          }
        }
      }

      // Stop spinner and show response
      spinner.stop();

      // Render markdown and print with agent prefix
      const rendered = renderMarkdown(assistantResponse.trim());
      console.log(fmt.magenta("Agent:"));
      console.log(rendered);
      console.log("");
      conversationLog.push(`Assistant: ${assistantResponse}`);

      // Check if the response contains JSON (interview complete)
      const jsonMatch = extractJsonFromResponse(assistantResponse);
      if (jsonMatch) {
        ideas = jsonMatch;
        isComplete = true;
        break;
      }

      // Get user input
      const userInput = await askUser(`${fmt.green("You:   ")}`);

      // Check for cancel commands
      if (isCancelSignal(userInput)) {
        console.log("");
        console.log(fmt.yellow("Interview cancelled."));
        rl.close();
        return [];
      }

      // Check for empty input (just pressed enter) - treat as done signal
      if (!userInput.trim()) {
        console.log(
          fmt.dim("(Press Enter again to finish, or type your response)"),
        );
        const secondInput = await askUser(`${fmt.green("You:   ")}`);
        if (!secondInput.trim()) {
          // Double-enter means done - finish immediately
          conversationLog.push(`User: [done signal]`);
          if (!sessionId) {
            console.error(
              fmt.yellow(
                "Warning: No session ID captured, falling back to JSON extraction",
              ),
            );
          }
          ideas = await finishInterview(
            session,
            sessionId || "",
            options.verbose,
            sdkEnv,
          );
          isComplete = true;
          break;
        }
        conversationLog.push(`User: ${secondInput}`);
        session.send(secondInput);
        continue;
      }

      // Check if user said "done" or similar - trigger immediate wrap up
      if (isDoneSignal(userInput)) {
        conversationLog.push(`User: [done signal]`);
        if (!sessionId) {
          console.error(
            fmt.yellow(
              "Warning: No session ID captured, falling back to JSON extraction",
            ),
          );
        }
        ideas = await finishInterview(
          session,
          sessionId || "",
          options.verbose,
          sdkEnv,
        );
        isComplete = true;
        break;
      }

      conversationLog.push(`User: ${userInput}`);

      // Send user's response to the agent
      session.send(userInput);
    }

    return ideas;
  } catch (error) {
    // Handle Ctrl+C or other interruptions
    if ((error as any)?.code === "ERR_USE_AFTER_CLOSE") {
      console.log("");
      console.log(fmt.yellow("Interview interrupted."));
      return [];
    }
    throw error;
  } finally {
    rl.close();
    if (session) {
      await session.close();
    }
  }
}

/**
 * Extract JSON array from the assistant's response.
 * Returns null if no valid JSON array is found.
 */
function extractJsonFromResponse(response: string): ParsedIdea[] | null {
  // Look for JSON array in the response
  const arrayStart = response.lastIndexOf("[");
  if (arrayStart === -1) return null;

  // Find matching closing bracket
  let depth = 0;
  let arrayEnd = -1;

  for (let i = arrayStart; i < response.length; i++) {
    const char = response[i];
    if (char === "[") depth++;
    if (char === "]") depth--;
    if (depth === 0) {
      arrayEnd = i;
      break;
    }
  }

  if (arrayEnd === -1) return null;

  try {
    const jsonStr = response.slice(arrayStart, arrayEnd + 1);
    const parsed = JSON.parse(jsonStr) as ParsedIdea[];

    // Validate it looks like our expected structure
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].title) {
      return parsed;
    }
  } catch {
    // Not valid JSON
  }

  return null;
}

/**
 * Fallback interview using simple readline prompts (no SDK).
 * Used when SDK is not available or as a simpler alternative.
 */
export async function runSimpleInterview(): Promise<ParsedIdea[]> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };

  console.log("");
  console.log(fmt.bold("Capture Your Idea"));
  console.log(fmt.gray("─".repeat(60)));
  console.log("");

  try {
    const title = await ask(`${fmt.bold("Title:")} `);
    if (!title.trim()) {
      console.log(fmt.yellow("No title provided. Cancelled."));
      return [];
    }

    const description = await ask(
      `\n${fmt.bold("Description")} ${fmt.dim("(what you want to accomplish)")}\n> `,
    );

    const problem = await ask(
      `\n${fmt.bold("Problem")} ${fmt.dim("(what issue this solves - Enter to skip)")}\n> `,
    );

    const motivation = await ask(
      `\n${fmt.bold("Why")} ${fmt.dim("(why this is important - Enter to skip)")}\n> `,
    );

    const success = await ask(
      `\n${fmt.bold("Success criteria")} ${fmt.dim("(how you'll know it works - Enter to skip)")}\n> `,
    );

    const constraints = await ask(
      `\n${fmt.bold("Constraints")} ${fmt.dim("(technical limits - Enter to skip)")}\n> `,
    );

    const idea: ParsedIdea = {
      title: title.trim(),
      description: description.trim() || title.trim(),
    };

    if (problem.trim()) {
      idea.problemStatement = problem.trim();
    }
    if (motivation.trim()) {
      idea.motivation = motivation.trim();
    }
    if (success.trim()) {
      idea.successCriteria = success
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (constraints.trim()) {
      idea.technicalConstraints = constraints
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    console.log("");
    console.log(fmt.gray("─".repeat(60)));
    console.log(fmt.bold("Captured:"));
    console.log("");
    console.log(`  ${fmt.bold("Title:")} ${idea.title}`);
    console.log(`  ${fmt.bold("Description:")} ${idea.description}`);
    if (idea.problemStatement)
      console.log(`  ${fmt.bold("Problem:")} ${idea.problemStatement}`);
    if (idea.motivation)
      console.log(`  ${fmt.bold("Motivation:")} ${idea.motivation}`);
    if (idea.successCriteria?.length)
      console.log(
        `  ${fmt.bold("Success:")} ${idea.successCriteria.join(", ")}`,
      );
    if (idea.technicalConstraints?.length)
      console.log(
        `  ${fmt.bold("Constraints:")} ${idea.technicalConstraints.join(", ")}`,
      );
    console.log("");

    return [idea];
  } finally {
    rl.close();
  }
}
