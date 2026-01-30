import React, { memo } from "react";
import { Box, Text } from "ink";
import type { TuiState } from "../dashboard";

interface HeaderProps {
  state: TuiState;
  width: number;
}

export const Header = memo(function Header({
  state,
  width,
}: HeaderProps): React.ReactElement {
  const currentItemText = state.currentItem
    ? `Running: ${state.currentItem}`
    : "Waiting...";

  const phaseText = state.currentPhase
    ? `Phase: ${state.currentPhase} (iteration ${state.currentIteration}/${state.maxIterations})`
    : "Phase: idle";

  const storyText = state.currentStory
    ? `Story: ${state.currentStory.id} - ${state.currentStory.title}`
    : "Story: none";

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text color="cyan" bold>
          ┌─ Wreckit {"─".repeat(Math.max(0, width - 12))}┐
        </Text>
      </Box>
      <Box>
        <Text color="cyan">│ </Text>
        <Text>{truncate(currentItemText, width - 4)}</Text>
        <Text color="cyan">
          {" ".repeat(Math.max(0, width - 4 - currentItemText.length))} │
        </Text>
      </Box>
      <Box>
        <Text color="cyan">│ </Text>
        <Text dimColor>{truncate(phaseText, width - 4)}</Text>
        <Text color="cyan">
          {" ".repeat(Math.max(0, width - 4 - phaseText.length))} │
        </Text>
      </Box>
      <Box>
        <Text color="cyan">│ </Text>
        <Text dimColor>{truncate(storyText, width - 4)}</Text>
        <Text color="cyan">
          {" ".repeat(Math.max(0, width - 4 - storyText.length))} │
        </Text>
      </Box>
      <Box>
        <Text color="cyan">├{"─".repeat(width - 2)}┤</Text>
      </Box>
    </Box>
  );
});

function truncate(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    return str.slice(0, maxLen - 1) + "…";
  }
  return str;
}
