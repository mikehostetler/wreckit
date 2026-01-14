import React from "react";
import { Box, Text } from "ink";
import type { TuiState } from "../dashboard";
import { ToolCallItem } from "./ToolCallItem";

interface AgentActivityPaneProps {
  state: TuiState;
  width: number;
  height: number;
}

export function AgentActivityPane({ state, width, height }: AgentActivityPaneProps): React.ReactElement {
  const innerWidth = width - 2;
  const itemId = state.currentItem;

  if (!itemId) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text dimColor>No active agent activity</Text>
      </Box>
    );
  }

  const activity = state.activityByItem[itemId];
  if (!activity) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text dimColor>Waiting for agent activity...</Text>
      </Box>
    );
  }

  const maxTools = Math.max(1, Math.floor(height * 0.7));
  const maxThoughts = Math.max(1, height - maxTools - 2);

  const recentTools = activity.tools.slice(-maxTools);
  const recentThoughts = activity.thoughts.slice(-maxThoughts);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text dimColor>{"─".repeat(10)} Agent Activity {"─".repeat(Math.max(0, innerWidth - 28))}</Text>

      {recentTools.map((tool) => (
        <ToolCallItem key={tool.toolUseId} tool={tool} width={innerWidth} />
      ))}

      {recentThoughts.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Thinking:</Text>
          {recentThoughts.map((t, idx) => (
            <Text key={idx} dimColor wrap="truncate-end">
              {t.slice(0, innerWidth)}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
