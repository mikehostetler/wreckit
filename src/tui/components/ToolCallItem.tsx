import React from "react";
import { Box, Text } from "ink";
import type { ToolExecution } from "../dashboard";
import { getToolColor, formatToolInput, formatToolResult } from "../colors";

interface ToolCallItemProps {
  tool: ToolExecution;
  width: number;
  showResult?: boolean;
}

export function ToolCallItem({ tool, width, showResult = false }: ToolCallItemProps): React.ReactElement {
  const color = getToolColor(tool.toolName);
  const statusIcon = tool.status === "running" ? "▶" : tool.status === "completed" ? "✓" : "✗";
  const inputSummary = formatToolInput(tool.input);

  if (tool.status === "completed" || tool.status === "error") {
    const maxInputLen = Math.max(10, width - tool.toolName.length - 8);
    const shortInput = inputSummary.length > maxInputLen 
      ? inputSummary.slice(0, maxInputLen - 1) + "…" 
      : inputSummary;
    
    const resultSummary = showResult && tool.result 
      ? formatToolResult(tool.toolName, tool.result, Math.max(20, width - 4))
      : null;
    
    return (
      <Box flexDirection="column" width={width}>
        <Box>
          <Text color={tool.status === "error" ? "red" : color}>[{statusIcon}] {tool.toolName}</Text>
          <Text dimColor> {shortInput}</Text>
        </Box>
        {resultSummary && (
          <Box paddingLeft={2}>
            <Text dimColor>→ {resultSummary}</Text>
          </Box>
        )}
      </Box>
    );
  }

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
    </Box>
  );
}
