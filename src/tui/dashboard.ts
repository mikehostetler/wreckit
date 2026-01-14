import type { IndexItem } from "../schemas";

export interface ToolExecution {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: "running" | "completed" | "error";
  result?: unknown;
  startedAt: Date;
  finishedAt?: Date;
}

export interface AgentActivityForItem {
  thoughts: string[];
  tools: ToolExecution[];
}

export interface TuiState {
  currentItem: string | null;
  currentPhase: string | null;
  currentIteration: number;
  maxIterations: number;
  currentStory: { id: string; title: string } | null;
  items: Array<{
    id: string;
    state: string;
    title: string;
    currentStoryId?: string;
  }>;
  completedCount: number;
  totalCount: number;
  startTime: Date;
  logs: string[];
  showLogs: boolean;
  activityByItem: Record<string, AgentActivityForItem>;
}

export function createTuiState(items: IndexItem[]): TuiState {
  return {
    currentItem: null,
    currentPhase: null,
    currentIteration: 0,
    maxIterations: 100,
    currentStory: null,
    items: items.map((item) => ({
      id: item.id,
      state: item.state,
      title: item.title,
      currentStoryId: undefined,
    })),
    completedCount: items.filter((item) => item.state === "done").length,
    totalCount: items.length,
    startTime: new Date(),
    logs: [],
    showLogs: false,
    activityByItem: Object.fromEntries(
      items.map((item) => [item.id, { thoughts: [], tools: [] }])
    ),
  };
}

export function updateTuiState(
  state: TuiState,
  update: Partial<TuiState>
): TuiState {
  return { ...state, ...update };
}

export function formatRuntime(startTime: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - startTime.getTime();
  const totalSeconds = Math.floor(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

export function getStateIcon(state: string): string {
  switch (state) {
    case "done":
      return "✓";
    case "implementing":
    case "in_pr":
      return "→";
    case "raw":
    case "researched":
    case "planned":
    default:
      return "○";
  }
}

export function padToWidth(str: string, width: number): string {
  if (str.length > width) {
    return str.slice(0, width - 1) + "…";
  }
  return str.padEnd(width);
}

function renderHorizontalLine(width: number, left: string, right: string): string {
  return left + "─".repeat(width - 2) + right;
}

export function renderDashboard(state: TuiState, width = 80): string {
  const innerWidth = width - 4;
  const lines: string[] = [];

  lines.push("┌─ Wreckit " + "─".repeat(width - 12) + "┐");

  const currentItemText = state.currentItem
    ? `Running: ${state.currentItem}`
    : "Waiting...";
  lines.push("│ " + padToWidth(currentItemText, innerWidth) + " │");

  const phaseText = state.currentPhase
    ? `Phase: ${state.currentPhase} (iteration ${state.currentIteration}/${state.maxIterations})`
    : "Phase: idle";
  lines.push("│ " + padToWidth(phaseText, innerWidth) + " │");

  const storyText = state.currentStory
    ? `Story: ${state.currentStory.id} - ${state.currentStory.title}`
    : "Story: none";
  lines.push("│ " + padToWidth(storyText, innerWidth) + " │");

  lines.push("├" + "─".repeat(width - 2) + "┤");

  if (!state.showLogs) {
    if (state.items.length === 0) {
      lines.push("│ " + padToWidth("No items", innerWidth) + " │");
    } else {
      for (const item of state.items) {
        const icon = getStateIcon(item.state);
        const storyInfo = item.currentStoryId ? ` [${item.currentStoryId}]` : "";
        const itemLine = `${icon} ${padToWidth(item.id, 30)} ${padToWidth(item.state, 14)}${storyInfo}`;
        lines.push("│ " + padToWidth(itemLine, innerWidth) + " │");
      }
    }

    if (state.logs.length > 0) {
      lines.push("├" + "─".repeat(width - 2) + "┤");
      const lastLog = state.logs[state.logs.length - 1];
      lines.push("│ " + padToWidth(`Latest: ${lastLog}`, innerWidth) + " │");
    }
  } else {
    lines.push("│ " + padToWidth("─── Agent Output ───", innerWidth) + " │");
    const maxLogLines = 15;
    const logLines = state.logs.slice(-maxLogLines);
    if (logLines.length === 0) {
      lines.push("│ " + padToWidth("  (no output yet)", innerWidth) + " │");
    } else {
      for (const logLine of logLines) {
        lines.push("│ " + padToWidth(`  ${logLine}`, innerWidth) + " │");
      }
    }
  }

  lines.push("├" + "─".repeat(width - 2) + "┤");

  const runtime = formatRuntime(state.startTime);
  const progressText = `Progress: ${state.completedCount}/${state.totalCount} complete | Runtime: ${runtime}`;
  lines.push("│ " + padToWidth(progressText, innerWidth) + " │");

  const logsLabel = state.showLogs ? "items" : "logs";
  const keysText = `[q] quit  [l] ${logsLabel}`;
  lines.push("│ " + padToWidth(keysText, innerWidth) + " │");

  lines.push("└" + "─".repeat(width - 2) + "┘");

  return lines.join("\n");
}
