import React from "react";
import { Box, Text } from "ink";

interface LogsPaneProps {
  logs: string[];
  width: number;
  height: number;
  scrollOffset: number;
}

export function LogsPane({
  logs,
  width,
  height,
  scrollOffset,
}: LogsPaneProps): React.ReactElement {
  const innerWidth = width - 2;

  if (logs.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text dimColor>{"─".repeat(Math.min(innerWidth, 20))} Agent Output {"─".repeat(Math.min(innerWidth - 34, 20))}</Text>
        <Text dimColor>  (no output yet)</Text>
      </Box>
    );
  }

  const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));
  const startIdx = Math.max(0, logs.length - height + 1 - effectiveOffset);
  const endIdx = startIdx + height - 1;
  const visibleLogs = logs.slice(startIdx, endIdx);

  const isAtBottom = effectiveOffset === 0;
  const isAtTop = startIdx === 0;

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box>
        <Text dimColor>
          {"─".repeat(Math.min(innerWidth / 4, 10))} Agent Output{" "}
          {!isAtBottom && "▲"} {!isAtTop && "▼"}{" "}
          {"─".repeat(Math.max(0, innerWidth - 24))}
        </Text>
      </Box>
      {visibleLogs.map((line, idx) => (
        <Box key={`${startIdx + idx}-${line.slice(0, 20)}`}>
          <Text wrap="truncate-end">{truncate(line, innerWidth)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function truncate(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    return str.slice(0, maxLen - 1) + "…";
  }
  return str;
}
