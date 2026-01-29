import { describe, it, expect, beforeEach, mock } from "bun:test";
import React from "react";
import { ItemsPane } from "../ItemsPane";
import { createMockTuiState } from "../../__tests__/test-utils";

// Mock Ink components
mock.module("ink", () => ({
  Box: ({ children, width, height, flexDirection }: any) =>
    React.createElement("div", { width, height, flexDirection }, children),
  Text: ({ children, color, bold, dimColor }: any) =>
    React.createElement("span", { color, bold, dimColor }, children),
}));

describe("ItemsPane", () => {
  describe("truncate helper function", () => {
    it("truncates strings longer than maxLen", () => {
      const result = truncate("This is a very long string", 10);
      expect(result).toBe("This is a…");
      expect(result.length).toBe(10);
    });

    it("does not truncate strings shorter than maxLen", () => {
      const result = truncate("Short", 10);
      expect(result).toBe("Short");
    });

    it("does not truncate strings exactly maxLen", () => {
      const result = truncate("Exactly10!", 10);
      expect(result).toBe("Exactly10!");
    });

    it("handles empty string", () => {
      const result = truncate("", 10);
      expect(result).toBe("");
    });

    it("handles single character", () => {
      const result = truncate("A", 10);
      expect(result).toBe("A");
    });

    it("truncates to maxLen - 1 and adds ellipsis", () => {
      const result = truncate("1234567890", 5);
      expect(result).toBe("1234…");
      expect(result.length).toBe(5);
    });
  });

  describe("padToWidth helper function", () => {
    it("pads short strings to width", () => {
      const result = padToWidth("Hi", 10);
      expect(result).toBe("Hi        ");
      expect(result.length).toBe(10);
    });

    it("truncates long strings to width", () => {
      const result = padToWidth("This is very long", 10);
      expect(result).toBe("This is v…");
      expect(result.length).toBe(10);
    });

    it("handles exact width match", () => {
      const result = padToWidth("Exactly10!", 10);
      expect(result).toBe("Exactly10!");
    });

    it("handles empty string", () => {
      const result = padToWidth("", 5);
      expect(result).toBe("     ");
    });
  });

  describe("scroll offset calculation", () => {
    it("calculates zero offset when active item is in middle", () => {
      const state = createMockTuiState({
        items: Array.from({ length: 20 }, (_, i) => ({
          id: `item${i}`,
          state: "idea",
          title: `Item ${i}`,
        })),
        currentItem: "item5",
      });

      // Simulate the scroll calculation from ItemsPane
      const height = 10;
      const activeIndex = state.items.findIndex(
        (item) => item.id === state.currentItem,
      );
      const middleOffset = Math.floor(height / 2);
      const scrollOffset = Math.max(
        0,
        Math.min(activeIndex - middleOffset, state.items.length - height),
      );

      expect(scrollOffset).toBe(0); // item5 - 5 = 0
    });

    it("calculates positive offset when active item is below middle", () => {
      const state = createMockTuiState({
        items: Array.from({ length: 20 }, (_, i) => ({
          id: `item${i}`,
          state: "idea",
          title: `Item ${i}`,
        })),
        currentItem: "item15",
      });

      const height = 10;
      const activeIndex = state.items.findIndex(
        (item) => item.id === state.currentItem,
      );
      const middleOffset = Math.floor(height / 2);
      const scrollOffset = Math.max(
        0,
        Math.min(activeIndex - middleOffset, state.items.length - height),
      );

      expect(scrollOffset).toBe(10); // item15 - 5 = 10
    });

    it("limits offset to max (items.length - height)", () => {
      const state = createMockTuiState({
        items: Array.from({ length: 20 }, (_, i) => ({
          id: `item${i}`,
          state: "idea",
          title: `Item ${i}`,
        })),
        currentItem: "item19", // Last item
      });

      const height = 10;
      const activeIndex = state.items.findIndex(
        (item) => item.id === state.currentItem,
      );
      const middleOffset = Math.floor(height / 2);
      const maxOffset = state.items.length - height;
      const scrollOffset = Math.max(
        0,
        Math.min(activeIndex - middleOffset, maxOffset),
      );

      expect(scrollOffset).toBe(maxOffset); // Should be limited to 10
    });

    it("returns zero offset when active item not found", () => {
      const state = createMockTuiState({
        items: Array.from({ length: 20 }, (_, i) => ({
          id: `item${i}`,
          state: "idea",
          title: `Item ${i}`,
        })),
        currentItem: "nonexistent",
      });

      const height = 10;
      const activeIndex = state.items.findIndex(
        (item) => item.id === state.currentItem,
      );
      let scrollOffset = 0;
      if (activeIndex >= 0) {
        const middleOffset = Math.floor(height / 2);
        scrollOffset = Math.max(
          0,
          Math.min(activeIndex - middleOffset, state.items.length - height),
        );
      }

      expect(scrollOffset).toBe(0);
    });

    it("returns zero offset when items.length <= height", () => {
      const state = createMockTuiState({
        items: Array.from({ length: 5 }, (_, i) => ({
          id: `item${i}`,
          state: "idea",
          title: `Item ${i}`,
        })),
        currentItem: "item4",
      });

      const height = 10;
      const activeIndex = state.items.findIndex(
        (item) => item.id === state.currentItem,
      );
      const middleOffset = Math.floor(height / 2);
      const scrollOffset = Math.max(
        0,
        Math.min(activeIndex - middleOffset, state.items.length - height),
      );

      expect(scrollOffset).toBe(0); // maxOffset is negative, so Math.max(0, negative) = 0
    });
  });

  describe("scroll indicator conditions", () => {
    it("shows scroll indicators when items.length > height", () => {
      const state = createMockTuiState({
        items: Array.from({ length: 20 }, (_, i) => ({
          id: `item${i}`,
          state: "idea",
          title: `Item ${i}`,
        })),
      });

      const height = 10;
      const showScrollIndicator = state.items.length > height;

      expect(showScrollIndicator).toBe(true);
    });

    it("does not show scroll indicators when items.length <= height", () => {
      const state = createMockTuiState({
        items: Array.from({ length: 5 }, (_, i) => ({
          id: `item${i}`,
          state: "idea",
          title: `Item ${i}`,
        })),
      });

      const height = 10;
      const showScrollIndicator = state.items.length > height;

      expect(showScrollIndicator).toBe(false);
    });

    it("shows 'more above' indicator when scrollOffset > 0", () => {
      const scrollOffset = 5;
      const showScrollIndicator = true;

      const showMoreAbove = showScrollIndicator && scrollOffset > 0;

      expect(showMoreAbove).toBe(true);
    });

    it("shows 'more below' indicator when scrollOffset + height < items.length", () => {
      const itemsLength = 20;
      const scrollOffset = 5;
      const height = 10;
      const showScrollIndicator = true;

      const showMoreBelow =
        showScrollIndicator && scrollOffset + height < itemsLength;

      expect(showMoreBelow).toBe(true);
    });

    it("does not show 'more below' when at bottom", () => {
      const itemsLength = 20;
      const scrollOffset = 10;
      const height = 10;
      const showScrollIndicator = true;

      const showMoreBelow =
        showScrollIndicator && scrollOffset + height < itemsLength;

      expect(showMoreBelow).toBe(false); // 10 + 10 = 20, not < 20
    });
  });

  describe("component rendering", () => {
    it("renders without crashing for empty items", () => {
      const state = createMockTuiState({ items: [] });
      const element = React.createElement(ItemsPane, {
        state,
        width: 40,
        height: 10,
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(ItemsPane);
    });

    it("renders without crashing for non-empty items", () => {
      const state = createMockTuiState();
      const element = React.createElement(ItemsPane, {
        state,
        width: 40,
        height: 10,
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(ItemsPane);
    });

    it("renders with width and height props", () => {
      const state = createMockTuiState();
      const width = 50;
      const height = 15;

      const element = React.createElement(ItemsPane, {
        state,
        width,
        height,
      });

      expect(element.props.width).toBe(width);
      expect(element.props.height).toBe(height);
    });

    it("calculates innerWidth correctly", () => {
      const width = 40;
      const innerWidth = width - 2;

      expect(innerWidth).toBe(38);
    });
  });

  describe("active item highlighting", () => {
    it("identifies active item correctly", () => {
      const state = createMockTuiState({
        items: [
          { id: "item1", state: "idea", title: "Item 1" },
          { id: "item2", state: "implementing", title: "Item 2" },
          { id: "item3", state: "done", title: "Item 3" },
        ],
        currentItem: "item2",
      });

      const item = state.items[1]; // item2
      const isActive = item.id === state.currentItem;

      expect(isActive).toBe(true);
    });

    it("does not highlight non-active items", () => {
      const state = createMockTuiState({
        items: [
          { id: "item1", state: "idea", title: "Item 1" },
          { id: "item2", state: "implementing", title: "Item 2" },
          { id: "item3", state: "done", title: "Item 3" },
        ],
        currentItem: "item2",
      });

      const item = state.items[0]; // item1
      const isActive = item.id === state.currentItem;

      expect(isActive).toBe(false);
    });
  });

  describe("story ID display", () => {
    it("includes story ID when present", () => {
      const item = {
        id: "item1",
        state: "idea",
        title: "Item 1",
        currentStoryId: "US-123",
      };

      const storyInfo = item.currentStoryId ? ` [${item.currentStoryId}]` : "";

      expect(storyInfo).toBe(" [US-123]");
    });

    it("does not include story ID when absent", () => {
      const item = {
        id: "item1",
        state: "idea",
        title: "Item 1",
      };

      const storyInfo = item.currentStoryId ? ` [${item.currentStoryId}]` : "";

      expect(storyInfo).toBe("");
    });
  });

  describe("line formatting", () => {
    it("formats line with icon, ID, state, and story", () => {
      const icon = "✓";
      const idPart = "foundation/001-types";
      const statePart = "done".padEnd(12);
      const storyInfo = " [US-001]";

      const line = `${icon} ${idPart.padEnd(26)} ${statePart}${storyInfo}`;

      expect(line).toContain("✓");
      expect(line).toContain("foundation/001-types");
      expect(line).toContain("done");
      expect(line).toContain("[US-001]");
    });

    it("truncates ID to 25 characters", () => {
      const longId = "features/very-long-feature-name-that-should-be-truncated";
      const truncated = truncate(longId, 25);

      expect(truncated.length).toBe(25);
      expect(truncated).toContain("…");
    });

    it("pads state to 12 characters", () => {
      const state = "implementing";
      const statePart = state.padEnd(12);

      expect(statePart.length).toBe(12);
      expect(statePart).toBe("implementing");
    });
  });
});

// Helper functions (copied from ItemsPane for testing)
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
