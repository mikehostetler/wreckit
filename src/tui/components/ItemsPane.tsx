import React from "react";
import { Box, Text } from "ink";
import { getStateIcon } from "../dashboard";
import type { TuiState } from "../dashboard";

interface ItemsPaneProps {
  state: TuiState;
  width: number;
  height: number;
}

export function ItemsPane({
  state,
  width,
  height,
}: ItemsPaneProps): React.ReactElement {
  const innerWidth = width - 2;

  if (state.items.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text dimColor>{padToWidth("No items", innerWidth)}</Text>
      </Box>
    );
  }

  const visibleItems = state.items.slice(0, height);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {visibleItems.map((item) => {
        const icon = getStateIcon(item.state);
        const isActive = item.id === state.currentItem;
        const storyInfo = item.currentStoryId ? ` [${item.currentStoryId}]` : "";

        const idPart = truncate(item.id, 25);
        const statePart = item.state.padEnd(12);
        const line = `${icon} ${idPart.padEnd(26)} ${statePart}${storyInfo}`;

        return (
          <Box key={item.id}>
            <Text
              color={
                item.state === "done"
                  ? "green"
                  : isActive
                    ? "yellow"
                    : undefined
              }
              bold={isActive}
            >
              {truncate(line, innerWidth)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function truncate(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    return str.slice(0, maxLen - 1) + "…";
  }
  return str;
}

function padToWidth(str: string, width: number): string {
  if (str.length > width) {
    return str.slice(0, width - 1) + "…";
  }
  return str.padEnd(width);
}
