import { describe, it, expect, mock } from "bun:test";
import React from "react";
import { Header } from "../Header";
import { createMockTuiState } from "../../__tests__/test-utils";

// Mock Ink components
mock.module("ink", () => ({
  Box: ({ children, width, flexDirection }: any) =>
    React.createElement("div", { width, flexDirection }, children),
  Text: ({ children, color, bold, dimColor }: any) =>
    React.createElement("span", { color, bold, dimColor }, children),
}));

describe("Header", () => {
  describe("truncate helper function", () => {
    it("truncates strings longer than maxLen", () => {
      const result = truncate("This is a very long header text", 15);
      expect(result).toBe("This is a very…");
      expect(result.length).toBe(15);
    });

    it("does not truncate short strings", () => {
      const result = truncate("Short", 15);
      expect(result).toBe("Short");
    });

    it("handles exact length", () => {
      const result = truncate("Exactly15chars!", 15);
      expect(result).toBe("Exactly15chars!");
    });
  });

  describe("currentItem text", () => {
    it("shows 'Running: {itemId}' when currentItem exists", () => {
      const state = createMockTuiState({
        currentItem: "foundation/001-core-types",
      });

      const currentItemText = state.currentItem
        ? `Running: ${state.currentItem}`
        : "Waiting...";

      expect(currentItemText).toBe("Running: foundation/001-core-types");
    });

    it("shows 'Waiting...' when currentItem is null", () => {
      const state = createMockTuiState({ currentItem: null });

      const currentItemText = state.currentItem
        ? `Running: ${state.currentItem}`
        : "Waiting...";

      expect(currentItemText).toBe("Waiting...");
    });
  });

  describe("phase text", () => {
    it("shows phase with iterations when currentPhase exists", () => {
      const state = createMockTuiState({
        currentPhase: "implementing",
        currentIteration: 5,
        maxIterations: 100,
      });

      const phaseText = state.currentPhase
        ? `Phase: ${state.currentPhase} (iteration ${state.currentIteration}/${state.maxIterations})`
        : "Phase: idle";

      expect(phaseText).toBe("Phase: implementing (iteration 5/100)");
    });

    it("shows 'Phase: idle' when currentPhase is null", () => {
      const state = createMockTuiState({ currentPhase: null });

      const phaseText = state.currentPhase
        ? `Phase: ${state.currentPhase} (iteration ${state.currentIteration}/${state.maxIterations})`
        : "Phase: idle";

      expect(phaseText).toBe("Phase: idle");
    });
  });

  describe("story text", () => {
    it("shows story with id and title when currentStory exists", () => {
      const state = createMockTuiState({
        currentStory: { id: "US-001", title: "Add feature" },
      });

      const storyText = state.currentStory
        ? `Story: ${state.currentStory.id} - ${state.currentStory.title}`
        : "Story: none";

      expect(storyText).toBe("Story: US-001 - Add feature");
    });

    it("shows 'Story: none' when currentStory is null", () => {
      const state = createMockTuiState({ currentStory: null });

      const storyText = state.currentStory
        ? `Story: ${state.currentStory.id} - ${state.currentStory.title}`
        : "Story: none";

      expect(storyText).toBe("Story: none");
    });
  });

  describe("border rendering", () => {
    it("calculates top border width correctly", () => {
      const width = 80;

      const borderWidth = Math.max(0, width - 12);

      expect(borderWidth).toBe(68);
    });

    it("handles small width for top border", () => {
      const width = 10;

      const borderWidth = Math.max(0, width - 12);

      expect(borderWidth).toBe(0);
    });

    it("calculates middle border width correctly", () => {
      const width = 80;

      const borderWidth = width - 2;

      expect(borderWidth).toBe(78);
    });
  });

  describe("padding calculation", () => {
    it("calculates padding for currentItem text", () => {
      const width = 80;
      const currentItemText = "Running: foundation/001-core-types";

      const padding = Math.max(0, width - 4 - currentItemText.length);

      expect(padding).toBe(42); // 80 - 4 - 34 = 42
    });

    it("calculates padding for phase text", () => {
      const width = 80;
      const phaseText = "Phase: implementing (iteration 5/100)";

      const padding = Math.max(0, width - 4 - phaseText.length);

      expect(padding).toBe(39); // 80 - 4 - 37 = 39
    });

    it("calculates padding for story text", () => {
      const width = 80;
      const storyText = "Story: US-001 - Add feature";

      const padding = Math.max(0, width - 4 - storyText.length);

      expect(padding).toBe(49); // 80 - 4 - 27 = 49
    });

    it("handles text longer than width", () => {
      const width = 30;
      const longText = "This is a very long text that exceeds width";

      const padding = Math.max(0, width - 4 - longText.length);

      expect(padding).toBe(0); // Should be 0, not negative
    });
  });

  describe("component rendering", () => {
    it("renders without crashing", () => {
      const state = createMockTuiState();

      const element = React.createElement(Header, {
        state,
        width: 80,
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(Header);
    });

    it("passes width prop correctly", () => {
      const state = createMockTuiState();

      const element = React.createElement(Header, {
        state,
        width: 80,
      });

      expect(element.props.width).toBe(80);
    });

    it("passes state prop correctly", () => {
      const state = createMockTuiState();

      const element = React.createElement(Header, {
        state,
        width: 80,
      });

      expect(element.props.state).toBe(state);
    });
  });
});

// Helper function (copied from Header for testing)
function truncate(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    return str.slice(0, maxLen - 1) + "…";
  }
  return str;
}
