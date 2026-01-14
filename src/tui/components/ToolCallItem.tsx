import React from "react";
import { Box, Text } from "ink";
import type { ToolExecution } from "../dashboard";
import { getToolColor, formatToolInput } from "../colors";

interface ToolCallItemProps {
  tool: ToolExecution;
  width: number;
}

export function ToolCallItem({ tool, width }: ToolCallItemProps): React.ReactElement {
  const color = getToolColor(tool.toolName);
  const statusIcon = tool.status === "running" ? "▶" : tool.status === "completed" ? "✓" : "✗";
  const inputSummary = formatToolInput(tool.input);

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text color={color} bold>
          [{statusIcon}] {tool.toolName}
        </Text>
      </Box>
      <Box paddingLeft={2}>
        <Text dimColor>{inputSummary}</Text>
      </Box>
      {tool.result !== undefined && (
        <Box paddingLeft={2}>
          <Text dimColor>
            → {typeof tool.result === "string" ? tool.result.slice(0, 100) : JSON.stringify(tool.result).slice(0, 100)}
            {typeof tool.result === "string" && tool.result.length > 100 ? "..." : ""}
          </Text>
        </Box>
      )}
    </Box>
  );
}
