import React from "react";
import { Box, Text } from "ink";
import { getStateIcon, padToWidth } from "../dashboard";
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
  const contentHeight = height - 1; // Account for header line

  // Build header line with box drawing characters
  const headerText = " Items (queue) ";
  const remainingWidth = innerWidth - headerText.length;
  const header = "─" + headerText + "─".repeat(Math.max(0, remainingWidth));

  if (state.items.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text dimColor>{header}</Text>
        <Text dimColor>{padToWidth("No items", innerWidth)}</Text>
      </Box>
    );
  }

  // Auto-scroll to keep active item visible
  const activeIndex = state.items.findIndex(
    (item) => item.id === state.currentItem,
  );
  let scrollOffset = 0;
  if (activeIndex >= 0) {
    // Keep active item in the middle of the visible area when possible
    const middleOffset = Math.floor(contentHeight / 2);
    scrollOffset = Math.max(
      0,
      Math.min(activeIndex - middleOffset, state.items.length - contentHeight),
    );
  }

  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + contentHeight < state.items.length;

  // Adjust visible items for scroll indicators
  let visibleStart = scrollOffset;
  let visibleEnd = scrollOffset + contentHeight;
  if (hasMoreAbove) {
    visibleStart += 1;
  }
  if (hasMoreBelow) {
    visibleEnd -= 1;
  }

  const visibleItems = state.items.slice(visibleStart, visibleEnd);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text dimColor>{header}</Text>
      {hasMoreAbove && (
        <Text dimColor>↑ {scrollOffset} more</Text>
      )}
      {visibleItems.map((item) => {
        const icon = getStateIcon(item.state);
        const isActive = item.id === state.currentItem;
        const line = `${icon} ${item.id} ${item.state}`;

        let color: string | undefined;
        if (item.state === "done") {
          color = "green";
        } else if (item.state === "in_pr") {
          color = "blue";
        } else if (isActive) {
          color = "yellow";
        }

        return (
          <Box key={item.id}>
            <Text color={color} bold={isActive}>
              {padToWidth(line, innerWidth)}
            </Text>
          </Box>
        );
      })}
      {hasMoreBelow && (
        <Text dimColor>↓ {state.items.length - visibleEnd} more</Text>
      )}
    </Box>
  );
}
