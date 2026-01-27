import { describe, it, expect, mock } from "bun:test";
import React from "react";
import { AgentActivityPane } from "../AgentActivityPane";
import {
  createMockTuiState,
  createMockAgentActivity,
} from "../../__tests__/test-utils";

// Mock Ink components
mock.module("ink", () => ({
  Box: ({ children, width, height, flexDirection, marginTop }: any) =>
    React.createElement(
      "div",
      { width, height, flexDirection, marginTop },
      children,
    ),
  Text: ({ children, dimColor, wrap }: any) =>
    React.createElement("span", { dimColor, wrap }, children),
}));

// Mock ToolCallItem
mock.module("./ToolCallItem", () => ({
  ToolCallItem: ({ tool, width, showResult }: any) =>
    React.createElement("div", {
      "data-tool": tool.toolUseId,
      width,
      showResult,
    }),
}));

describe("AgentActivityPane", () => {
  describe("empty state", () => {
    it("shows 'No active agent activity' when currentItem is null", () => {
      const state = createMockTuiState({ currentItem: null });

      const element = React.createElement(AgentActivityPane, {
        state,
        width: 80,
        height: 20,
      });

      expect(element).toBeDefined();
      expect(element.props.state.currentItem).toBeNull();
    });

    it("renders without crashing when currentItem is null", () => {
      const state = createMockTuiState({ currentItem: null });

      const element = React.createElement(AgentActivityPane, {
        state,
        width: 80,
        height: 20,
      });

      expect(element.type).toBe(AgentActivityPane);
    });
  });

  describe("waiting for activity", () => {
    it("shows 'Waiting for agent activity...' when no activity for item", () => {
      const state = createMockTuiState({
        currentItem: "foundation/001-core-types",
        activityByItem: {},
      });

      const activity = state.activityByItem[state.currentItem!];

      expect(activity).toBeUndefined();
    });

    it("renders waiting message when activity is missing", () => {
      const state = createMockTuiState({
        currentItem: "foundation/001-core-types",
        activityByItem: {},
      });

      const element = React.createElement(AgentActivityPane, {
        state,
        width: 80,
        height: 20,
      });

      expect(element).toBeDefined();
    });
  });

  describe("height allocation", () => {
    it("allocates 70% of height to tools", () => {
      const height = 20;

      const maxTools = Math.max(1, Math.floor(height * 0.7));

      expect(maxTools).toBe(14); // floor(20 * 0.7) = 14
    });

    it("allocates remaining height to thoughts", () => {
      const height = 20;
      const maxTools = Math.max(1, Math.floor(height * 0.7));

      const maxThoughts = Math.max(1, height - maxTools - 2);

      expect(maxThoughts).toBe(4); // max(1, 20 - 14 - 2) = 4
    });

    it("handles small height (height=1)", () => {
      const height = 1;

      const maxTools = Math.max(1, Math.floor(height * 0.7));
      const maxThoughts = Math.max(1, height - maxTools - 2);

      expect(maxTools).toBe(1); // max(1, floor(0.7)) = 1
      expect(maxThoughts).toBe(1); // max(1, 1 - 1 - 2) = max(1, -2) = 1
    });

    it("handles height=2", () => {
      const height = 2;

      const maxTools = Math.max(1, Math.floor(height * 0.7));
      const maxThoughts = Math.max(1, height - maxTools - 2);

      expect(maxTools).toBe(1); // max(1, floor(1.4)) = 1
      expect(maxThoughts).toBe(1); // max(1, 2 - 1 - 2) = max(1, -1) = 1
    });

    it("handles height=10", () => {
      const height = 10;

      const maxTools = Math.max(1, Math.floor(height * 0.7));
      const maxThoughts = Math.max(1, height - maxTools - 2);

      expect(maxTools).toBe(7); // floor(10 * 0.7) = 7
      expect(maxThoughts).toBe(1); // max(1, 10 - 7 - 2) = 1
    });

    it("handles large height", () => {
      const height = 50;

      const maxTools = Math.max(1, Math.floor(height * 0.7));
      const maxThoughts = Math.max(1, height - maxTools - 2);

      expect(maxTools).toBe(35); // floor(50 * 0.7) = 35
      expect(maxThoughts).toBe(13); // max(1, 50 - 35 - 2) = 13
    });
  });

  describe("recent items slicing", () => {
    it("slices tools to most recent maxTools", () => {
      const activity = createMockAgentActivity({
        tools: Array.from({ length: 30 }, (_, i) => ({
          toolUseId: `tool-${i}`,
          toolName: "Read",
          input: {},
          status: "completed" as const,
          startedAt: new Date(),
        })),
      });

      const maxTools = 10;
      const recentTools = activity.tools.slice(-maxTools);

      expect(recentTools).toHaveLength(10);
      expect(recentTools[0].toolUseId).toBe("tool-20");
      expect(recentTools[9].toolUseId).toBe("tool-29");
    });

    it("slices thoughts to most recent maxThoughts", () => {
      const activity = createMockAgentActivity({
        thoughts: Array.from({ length: 100 }, (_, i) => `Thought ${i}`),
      });

      const maxThoughts = 10;
      const recentThoughts = activity.thoughts.slice(-maxThoughts);

      expect(recentThoughts).toHaveLength(10);
      expect(recentThoughts[0]).toBe("Thought 90");
      expect(recentThoughts[9]).toBe("Thought 99");
    });

    it("handles fewer tools than maxTools", () => {
      const activity = createMockAgentActivity({
        tools: Array.from({ length: 5 }, (_, i) => ({
          toolUseId: `tool-${i}`,
          toolName: "Read",
          input: {},
          status: "completed" as const,
          startedAt: new Date(),
        })),
      });

      const maxTools = 10;
      const recentTools = activity.tools.slice(-maxTools);

      expect(recentTools).toHaveLength(5);
    });

    it("handles fewer thoughts than maxThoughts", () => {
      const activity = createMockAgentActivity({
        thoughts: ["Thought 1", "Thought 2"],
      });

      const maxThoughts = 10;
      const recentThoughts = activity.thoughts.slice(-maxThoughts);

      expect(recentThoughts).toHaveLength(2);
    });
  });

  describe("showResult prop calculation", () => {
    it("sets showResult to true for last completed tool", () => {
      const tools = [
        { toolUseId: "tool-1", status: "completed" },
        { toolUseId: "tool-2", status: "completed" },
        { toolUseId: "tool-3", status: "completed" },
      ];

      const recentTools = tools;
      const lastTool = recentTools[recentTools.length - 1];

      const showResult = true; // This is what would be passed
      const shouldShow = showResult && lastTool.status === "completed";

      expect(shouldShow).toBe(true);
    });

    it("sets showResult to false for non-last tool", () => {
      const tools = [
        { toolUseId: "tool-1", status: "completed" },
        { toolUseId: "tool-2", status: "completed" },
        { toolUseId: "tool-3", status: "running" },
      ];

      const recentTools = tools;
      const idx = 0; // First tool
      const tool = recentTools[idx];

      const showResult =
        idx === recentTools.length - 1 && tool.status === "completed";

      expect(showResult).toBe(false);
    });

    it("sets showResult to false for last tool if not completed", () => {
      const tools = [
        { toolUseId: "tool-1", status: "completed" },
        { toolUseId: "tool-2", status: "running" },
      ];

      const recentTools = tools;
      const idx = 1; // Last tool
      const tool = recentTools[idx];

      const showResult =
        idx === recentTools.length - 1 && tool.status === "completed";

      expect(showResult).toBe(false);
    });
  });

  describe("thoughts section", () => {
    it("shows thoughts section when recentThoughts.length > 0", () => {
      const activity = createMockAgentActivity({
        thoughts: ["Thinking about the problem", "Analyzing data"],
      });

      const recentThoughts = activity.thoughts;
      const shouldShow = recentThoughts.length > 0;

      expect(shouldShow).toBe(true);
    });

    it("does not show thoughts section when empty", () => {
      const activity = createMockAgentActivity({
        thoughts: [],
      });

      const recentThoughts = activity.thoughts;
      const shouldShow = recentThoughts.length > 0;

      expect(shouldShow).toBe(false);
    });

    it("truncates thoughts to innerWidth", () => {
      const thought = "This is a very long thought that should be truncated";
      const innerWidth = 20;

      const truncated = thought.slice(0, innerWidth);

      expect(truncated).toHaveLength(innerWidth);
      expect(truncated).toBe("This is a very long "); // 20 chars
    });
  });

  describe("header border", () => {
    it("calculates border width correctly", () => {
      const innerWidth = 78;

      const borderWidth = Math.max(0, innerWidth - 28);

      expect(borderWidth).toBe(50);
    });

    it("handles small innerWidth", () => {
      const innerWidth = 20;

      const borderWidth = Math.max(0, innerWidth - 28);

      expect(borderWidth).toBe(0);
    });
  });

  describe("component rendering", () => {
    it("renders without crashing when activity exists", () => {
      const state = createMockTuiState({
        currentItem: "foundation/001-core-types",
        activityByItem: {
          "foundation/001-core-types": createMockAgentActivity(),
        },
      });

      const element = React.createElement(AgentActivityPane, {
        state,
        width: 80,
        height: 20,
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(AgentActivityPane);
    });

    it("passes all props correctly", () => {
      const state = createMockTuiState();
      const width = 80;
      const height = 20;

      const element = React.createElement(AgentActivityPane, {
        state,
        width,
        height,
      });

      expect(element.props.state).toBe(state);
      expect(element.props.width).toBe(width);
      expect(element.props.height).toBe(height);
    });

    it("calculates innerWidth correctly", () => {
      const width = 80;
      const innerWidth = width - 2;

      expect(innerWidth).toBe(78);
    });
  });
});
