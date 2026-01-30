import React from "react";
import { Box, Text } from "ink";
import type { TuiState } from "../dashboard";
import { formatRuntime, LAYOUT } from "../dashboard";

interface StatusBarProps {
  state: TuiState;
  width: number;
}

function getStatusBadge(state: TuiState): {
  label: string;
  bgColor: string;
} {
  const now = Date.now();
  const lastActivity = state.lastActivityAt.getTime();
  const isStalled = now - lastActivity > LAYOUT.STALL_THRESHOLD_MS;

  if (isStalled && state.runState === "running") {
    return { label: "STALL?", bgColor: "yellow" };
  }

  switch (state.runState) {
    case "running":
      return { label: "RUNNING", bgColor: "green" };
    case "paused":
      return { label: "PAUSED", bgColor: "yellow" };
    case "error":
      return { label: "ERROR", bgColor: "red" };
    case "done":
      return { label: "DONE", bgColor: "green" };
  }
}

function renderProgressBar(completed: number, total: number, barWidth: number): string {
  if (total === 0) return "░".repeat(barWidth);
  const filledCount = Math.round((completed / total) * barWidth);
  const emptyCount = barWidth - filledCount;
  return "█".repeat(filledCount) + "░".repeat(emptyCount);
}

function formatLastActivity(lastActivityAt: Date): string {
  const now = Date.now();
  const diffMs = now - lastActivityAt.getTime();
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function StatusBar({ state, width }: StatusBarProps): React.ReactElement {
  const badge = getStatusBadge(state);
  const runtime = formatRuntime(state.startTime);
  const lastActivity = formatLastActivity(state.lastActivityAt);
  const progressBar = renderProgressBar(state.completedCount, state.totalCount, 10);
  const progressText = `done ${state.completedCount}/${state.totalCount}`;

  const innerWidth = width - 4;
  const contentParts = [
    badge.label,
    "  ",
    progressText,
    " ",
    progressBar,
    "  ",
    runtime,
    "   ",
    `last activity: ${lastActivity}`,
  ];
  const contentLength = contentParts.join("").length;
  const padding = Math.max(0, innerWidth - contentLength);

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text color="cyan">┌{"─".repeat(width - 2)}┐</Text>
      </Box>
      <Box>
        <Text color="cyan">│ </Text>
        <Text backgroundColor={badge.bgColor} color="black" bold>
          {badge.label}
        </Text>
        <Text>{"  "}</Text>
        <Text>{progressText} </Text>
        <Text color="green">{progressBar}</Text>
        <Text>{"  "}</Text>
        <Text bold>{runtime}</Text>
        <Text>{"   "}</Text>
        <Text dimColor>last activity: {lastActivity}</Text>
        <Text>{" ".repeat(padding)}</Text>
        <Text color="cyan"> │</Text>
      </Box>
      <Box>
        <Text color="cyan">└{"─".repeat(width - 2)}┘</Text>
      </Box>
    </Box>
  );
}
