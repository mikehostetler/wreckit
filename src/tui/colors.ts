/**
 * Color mapping for different tool types
 */
export const TOOL_COLORS: Record<string, string> = {
  Read: "blue",
  Edit: "yellow",
  Write: "green",
  Bash: "magenta",
  Grep: "cyan",
  Glob: "cyan",
  Task: "magenta",
  Skill: "cyan",
  AskUserQuestion: "white",
} as const;

/**
 * Get the display color for a tool
 */
export function getToolColor(toolName: string): string {
  return TOOL_COLORS[toolName] || "gray";
}

/**
 * Icon mapping for different tool types
 */
export const TOOL_ICONS: Record<string, string> = {
  Read: "",
  Edit: "✏️",
  Write: "📝",
  Bash: "",
  Grep: "🔍",
  Glob: "📁",
  Task: "🤖",
  Skill: "⚡",
  AskUserQuestion: "❓",
} as const;

/**
 * Get the display icon for a tool
 */
export function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] || "🔧";
}

/**
 * Format tool input as a concise summary
 */
export function formatToolInput(input: Record<string, unknown>): string {
  if (input.file_path) return `📄 ${String(input.file_path)}`;
  if (input.command) return `$ ${String(input.command)}`;
  if (input.pattern) return `🔍 ${String(input.pattern)}`;
  if (input.prompt) return `💬 ${String(input.prompt).slice(0, 40)}...`;
  if (input.description) return `📋 ${String(input.description).slice(0, 40)}...`;
  if (input.url) return `🌐 ${String(input.url).slice(0, 40)}...`;
  return JSON.stringify(input).slice(0, 50);
}
