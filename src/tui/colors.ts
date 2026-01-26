import os from "os";
import path from "path";

const HOME_DIR = os.homedir();
const CWD = process.cwd();

export function shortenPath(p: string): string {
  if (!p) return p;
  let s = p;

  if (s.startsWith(CWD)) {
    const rel = path.relative(CWD, s) || ".";
    s = rel;
  } else if (s.startsWith(HOME_DIR)) {
    s = "~" + s.slice(HOME_DIR.length);
  }

  return s;
}

function shortenPathsInText(text: string): string {
  return text.replaceAll(CWD, ".").replaceAll(HOME_DIR, "~");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function summarizeCommand(cmd: string, max = 60): string {
  let line = cmd.split("\n")[0].trim();

  const separators = [" | ", " && ", " || "];
  for (const sep of separators) {
    const idx = line.indexOf(sep);
    if (idx !== -1) {
      line = line.slice(0, idx) + sep.trim() + " …";
      break;
    }
  }

  return truncate(shortenPathsInText(line), max);
}

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
  const anyInput = input as Record<string, unknown>;

  const filePath = anyInput.file_path ?? anyInput.path;
  if (filePath) return `📄 ${shortenPath(String(filePath))}`;

  const command = anyInput.command ?? anyInput.cmd;
  if (command) return `$ ${summarizeCommand(String(command))}`;

  if (anyInput.pattern) return `🔍 ${String(anyInput.pattern)}`;
  if (anyInput.prompt) return `💬 ${truncate(String(anyInput.prompt), 40)}`;
  if (anyInput.description)
    return `📋 ${truncate(String(anyInput.description), 40)}`;
  if (anyInput.url) return `🌐 ${truncate(String(anyInput.url), 40)}`;
  if (anyInput.filePattern) return `📁 ${String(anyInput.filePattern)}`;

  return truncate(shortenPathsInText(JSON.stringify(input)), 80);
}

/**
 * Format tool result as a concise summary
 */
export function formatToolResult(
  toolName: string,
  result: unknown,
  maxLength = 100,
): string {
  if (result == null) return "";

  if (toolName === "Bash" && typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    const raw = String(r.stdout ?? r.output ?? r.result ?? "");
    const firstLine = raw.split(/\r?\n/)[0];
    return truncate(shortenPathsInText(firstLine), maxLength);
  }

  if ((toolName === "Glob" || toolName === "glob") && Array.isArray(result)) {
    const paths = result.map((p) => shortenPath(String(p)));
    const head = paths.slice(0, 3).join(", ");
    const suffix = paths.length > 3 ? `, … (+${paths.length - 3} more)` : "";
    return truncate(head + suffix, maxLength);
  }

  if (toolName === "Read" && typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    const p = r.path ?? r.file_path ?? r.filePath;
    if (p) {
      return `read ${shortenPath(String(p))}`;
    }
  }

  let text: string;
  if (typeof result === "string") {
    text = result;
  } else {
    text = JSON.stringify(result);
  }

  text = shortenPathsInText(text);
  return truncate(text, maxLength);
}
