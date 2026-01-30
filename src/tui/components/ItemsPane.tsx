import React, { memo } from "react";
import { Box, Text } from "ink";
import { getStateIcon } from "../dashboard";
import type { TuiState } from "../dashboard";

interface ItemsPaneProps {
  state: TuiState;
  width: number;
  height: number;
}

interface ItemRowProps {
  item: { id: string; state: string; title: string; currentStoryId?: string };
  isActive: boolean;
  innerWidth: number;
}

const ItemRow = memo(function ItemRow({
  item,
  isActive,
  innerWidth,
}: ItemRowProps): React.ReactElement {
  const icon = getStateIcon(item.state);
  const storyInfo = item.currentStoryId ? ` [${item.currentStoryId}]` : "";
  const idPart = truncate(item.id, 25);
  const statePart = item.state.padEnd(12);
  const line = `${icon} ${idPart.padEnd(26)} ${statePart}${storyInfo}`;

  return (
    <Box>
      <Text
        color={
          item.state === "done" ? "green" : isActive ? "yellow" : undefined
        }
        bold={isActive}
      >
        {truncate(line, innerWidth)}
      </Text>
    </Box>
  );
});

export const ItemsPane = memo(function ItemsPane({
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

  // Auto-scroll to keep active item visible
  const activeIndex = state.items.findIndex(
    (item) => item.id === state.currentItem,
  );
  let scrollOffset = 0;
  if (activeIndex >= 0) {
    // Keep active item in the middle of the visible area when possible
    const middleOffset = Math.floor(height / 2);
    scrollOffset = Math.max(
      0,
      Math.min(activeIndex - middleOffset, state.items.length - height),
    );
  }

  const showScrollIndicator = state.items.length > height;
  const hasMoreAbove = showScrollIndicator && scrollOffset > 0;
  const hasMoreBelow =
    showScrollIndicator && scrollOffset + height < state.items.length;

  // Adjust visible range to account for scroll indicators
  const adjustedHeight = height - (hasMoreAbove ? 1 : 0) - (hasMoreBelow ? 1 : 0);
  const visibleItems = state.items.slice(
    scrollOffset,
    scrollOffset + adjustedHeight,
  );

  return (
    <Box flexDirection="column" width={width} height={height}>
      {hasMoreAbove && (
        <Box>
          <Text dimColor>↑ {scrollOffset} more</Text>
        </Box>
      )}
      {visibleItems.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          isActive={item.id === state.currentItem}
          innerWidth={innerWidth}
        />
      ))}
      {hasMoreBelow && (
        <Box>
          <Text dimColor>
            ↓ {state.items.length - scrollOffset - adjustedHeight} more
          </Text>
        </Box>
      )}
    </Box>
  );
});

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
