import React from "react";
import { Box, Text } from "ink";
import { formatRuntime } from "../dashboard";
import type { TuiState } from "../dashboard";

interface FooterProps {
  state: TuiState;
  width: number;
  showLogs: boolean;
}

export function Footer({
  state,
  width,
  showLogs,
}: FooterProps): React.ReactElement {
  const runtime = formatRuntime(state.startTime);
  const progressText = `Progress: ${state.completedCount}/${state.totalCount} complete | Runtime: ${runtime}`;

  const logsLabel = showLogs ? "items" : "logs";
  const keysText = `[q] quit  [l] ${logsLabel}  [j/k] scroll`;

  const progressPercent =
    state.totalCount > 0
      ? Math.round((state.completedCount / state.totalCount) * 100)
      : 0;

  const barWidth = Math.min(20, width - 60);
  const filledWidth = Math.round((progressPercent / 100) * barWidth);
  const progressBar =
    "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth);

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text color="cyan">├{"─".repeat(width - 2)}┤</Text>
      </Box>
      <Box>
        <Text color="cyan">│ </Text>
        <Text>{progressText} </Text>
        <Text color="green">[{progressBar}]</Text>
        <Text color="cyan">
          {" ".repeat(
            Math.max(0, width - 4 - progressText.length - barWidth - 4),
          )}{" "}
          │
        </Text>
      </Box>
      <Box>
        <Text color="cyan">│ </Text>
        <Text dimColor>{keysText}</Text>
        <Text color="cyan">
          {" ".repeat(Math.max(0, width - 4 - keysText.length))} │
        </Text>
      </Box>
      <Box>
        <Text color="cyan">└{"─".repeat(width - 2)}┘</Text>
      </Box>
    </Box>
  );
}
