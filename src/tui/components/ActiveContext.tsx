import React from "react";
import { Box, Text } from "ink";
import type { TuiState } from "../dashboard";
import { formatToolInput, getToolIcon } from "../colors";

interface ActiveContextProps {
  state: TuiState;
  width: number;
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) {
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${secs.toString()}s`;
}

function formatPhaseTime(startTime: Date): string {
  const ms = Date.now() - startTime.getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function ActiveContext({
  state,
  width,
}: ActiveContextProps): React.ReactElement {
  const innerWidth = width - 4;

  const activeItem = state.items.find((i) => i.id === state.currentItem);
  const activeText = activeItem
    ? `${activeItem.id} — ${activeItem.title}`
    : "none";

  const phaseTime = formatPhaseTime(state.startTime);
  const phaseText = state.currentPhase
    ? `${state.currentPhase} • iter ${state.currentIteration}/${state.maxIterations} • in phase: ${phaseTime}`
    : "idle";

  let nowText = "idle";
  let toolElapsed = "";
  const activity = state.currentItem
    ? state.activityByItem[state.currentItem]
    : null;

  if (activity) {
    const runningTool = activity.tools.find((t) => t.status === "running");
    if (runningTool) {
      const icon = getToolIcon(runningTool.toolName);
      const summary = formatToolInput(runningTool.input);
      const elapsed = Date.now() - runningTool.startedAt.getTime();
      toolElapsed = `(running ${formatElapsed(elapsed)})`;
      nowText = `${runningTool.toolName} ${icon} ${summary}`;
    } else {
      const lastTool = activity.tools[activity.tools.length - 1];
      if (lastTool) {
        const icon = getToolIcon(lastTool.toolName);
        const summary = formatToolInput(lastTool.input);
        nowText = `${lastTool.toolName} ${icon} ${summary} ✓`;
      }
    }
  }

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text color="cyan">│ </Text>
        <Text dimColor>Active: </Text>
        <Text color="green">{truncate(activeText, innerWidth - 8)}</Text>
        <Text color="cyan"> │</Text>
      </Box>
      <Box>
        <Text color="cyan">│ </Text>
        <Text dimColor> Phase: </Text>
        <Text dimColor>{truncate(phaseText, innerWidth - 8)}</Text>
        <Text color="cyan"> │</Text>
      </Box>
      <Box>
        <Text color="cyan">│ </Text>
        <Text dimColor>   Now: </Text>
        <Text color="yellow">
          {truncate(nowText, innerWidth - 8 - toolElapsed.length - 1)}
        </Text>
        {toolElapsed && <Text dimColor> {toolElapsed}</Text>}
        <Text color="cyan"> │</Text>
      </Box>
    </Box>
  );
}

function truncate(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    return str.slice(0, maxLen - 1) + "…";
  }
  return str;
}
