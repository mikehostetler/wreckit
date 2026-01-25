/**
 * Tool allowlisting configuration for different workflow phases.
 *
 * This module defines which tools agents are allowed to use in each phase,
 * providing a security boundary to prevent unauthorized operations.
 *
 * The allowed tools are specified by their names as recognized by the agent SDK.
 * When a phase allows tools, only those tools can be used - all others are blocked.
 */

/**
 * Available tool names that can be allowlisted.
 * These match the tool names exposed by the Claude Agent SDK and wreckit MCP server.
 *
 * MCP tool naming convention: mcp__<server_name>__<tool_name>
 * - The SDK automatically prefixes MCP tools with this format
 * - For wreckit MCP server, tools become "mcp__wreckit__<tool_name>"
 */
export const AVAILABLE_TOOLS = {
  // File system tools (SDK built-in) - use exact SDK tool names
  Read: "Read",
  Write: "Write",
  Edit: "Edit",
  Glob: "Glob",
  Grep: "Grep",

  // Execution tools
  Bash: "Bash",

  // wreckit MCP tools - use full SDK-prefixed names
  // Format: mcp__<server_name>__<tool_name>
  wreckit_save_interview_ideas: "mcp__wreckit__save_interview_ideas",
  wreckit_save_parsed_ideas: "mcp__wreckit__save_parsed_ideas",
  wreckit_save_prd: "mcp__wreckit__save_prd",
  wreckit_update_story_status: "mcp__wreckit__update_story_status",
  wreckit_complete: "mcp__wreckit__complete",
} as const;

export type ToolName = typeof AVAILABLE_TOOLS[keyof typeof AVAILABLE_TOOLS];

/**
 * Tool allowlists for each workflow phase.
 *
 * Philosophy:
 * - idea: MCP tools only (structured data capture, no file system access)
 * - research: Read-only tools (Read, Glob, Grep for exploration)
 * - plan: Read + Write tools (Read, Write, Edit for creating plan/PRD)
 * - implement: Full tool access (Read, Write, Edit, Glob, Grep, Bash)
 * - pr: Read + Bash tools (Read for verification, Bash for git operations)
 * - complete: Read + MCP tools (Read for verification, wreckit_complete)
 * - strategy: Read + Write tools (Read, Glob, Grep for analysis, Write for ROADMAP.md)
 *
 * IMPORTANT: These tool names MUST match the SDK's tool naming convention:
 * - Built-in tools: "Read", "Write", "Edit", "Glob", "Grep", "Bash"
 * - MCP tools: "mcp__wreckit__<tool_name>" (e.g., "mcp__wreckit__save_prd")
 */
export const PHASE_TOOL_ALLOWLISTS: Record<string, ToolName[] | undefined> = {
  // Idea phase: Only MCP tools (structured data capture, no direct FS access)
  idea: [
    AVAILABLE_TOOLS.wreckit_save_parsed_ideas,
    AVAILABLE_TOOLS.wreckit_save_interview_ideas,
  ],

  // Research phase: Read-only tools for codebase exploration + Write for research.md
  research: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
  ],

  // Plan phase: Read + Write for creating plan.md and prd.json
  plan: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Edit,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
    AVAILABLE_TOOLS.wreckit_save_prd,
  ],

  // Implement phase: Full tool access for implementation
  implement: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Edit,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
    AVAILABLE_TOOLS.Bash,
    AVAILABLE_TOOLS.wreckit_update_story_status,
  ],

  // PR phase: Read + Bash for PR management (git operations via Bash)
  pr: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
    AVAILABLE_TOOLS.Bash,
  ],

  // Complete phase: Read + MCP completion tool
  complete: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
    AVAILABLE_TOOLS.wreckit_complete,
  ],

  // Strategy phase: Read + Write for codebase analysis and ROADMAP.md creation
  // Write is allowed but enforced to ROADMAP.md only via git status check in command
  strategy: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
  ],

  // Learn phase: Read + Write + Glob + Grep for pattern extraction and skills.json creation
  learn: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
  ],
} as const;

/**
 * Get the allowed tools for a given phase.
 *
 * @param phase - The workflow phase (e.g., "research", "plan", "implement")
 * @returns Array of allowed tool names, or undefined if no restrictions
 */
export function getAllowedToolsForPhase(phase: string): string[] | undefined {
  return PHASE_TOOL_ALLOWLISTS[phase];
}

/**
 * Check if a tool is allowed in a given phase.
 *
 * @param phase - The workflow phase
 * @param toolName - The tool name to check
 * @returns true if the tool is allowed, false otherwise
 */
export function isToolAllowedInPhase(phase: string, toolName: string): boolean {
  const allowedTools = PHASE_TOOL_ALLOWLISTS[phase];
  if (!allowedTools) {
    // No restrictions - all tools allowed
    return true;
  }
  return allowedTools.includes(toolName as ToolName);
}

/**
 * Get a description of the tool restrictions for a phase.
 * Useful for logging and error messages.
 *
 * @param phase - The workflow phase
 * @returns A human-readable description of the tool restrictions
 */
export function getToolRestrictionDescription(phase: string): string {
  const allowedTools = PHASE_TOOL_ALLOWLISTS[phase];

  if (!allowedTools || allowedTools.length === 0) {
    return `No tool restrictions for phase '${phase}'`;
  }

  const toolList = allowedTools.join(", ");
  return `Phase '${phase}' allows only: ${toolList}`;
}
