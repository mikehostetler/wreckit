import React from "react";
import { Box, Text } from "ink";
import type { TuiState } from "../dashboard";
import { WORKFLOW_STATES } from "../../domain/states";

interface ActiveItemPaneProps {
  state: TuiState;
  width: number;
}

export function ActiveItemPane({ state, width }: ActiveItemPaneProps): React.ReactElement {
  const { currentItem, currentPhase, currentIteration, maxIterations, items } = state;

  if (!currentItem) {
    return (
      <Box flexDirection="column" width={width}>
        <Text dimColor>No active item</Text>
      </Box>
    );
  }

  const item = items.find((it) => it.id === currentItem);
  const title = item?.title ?? "";
  const activeState = currentPhase ?? item?.state ?? "unknown";

  const workflowLine = WORKFLOW_STATES.map((s) =>
    s === activeState ? `[${s}]` : s
  ).join(" → ");

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color="yellow">
        Active: {currentItem} {title ? `- ${title}` : ""}
      </Text>
      <Text>
        Phase: {activeState} ({currentIteration}/{maxIterations})
      </Text>
      <Text dimColor>{workflowLine}</Text>
    </Box>
  );
}
