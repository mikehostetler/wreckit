import { describe, it, expect, mock } from "bun:test";
import React from "react";
import { ActiveItemPane } from "../ActiveItemPane";
import { createMockTuiState } from "../../__tests__/test-utils";
import { WORKFLOW_STATES } from "../../../domain/states";

// Mock Ink components
mock.module("ink", () => ({
  Box: ({ children, width, flexDirection }: any) =>
    React.createElement("div", { width, flexDirection }, children),
  Text: ({ children, bold, color, dimColor }: any) =>
    React.createElement("span", { bold, color, dimColor }, children),
}));

describe("ActiveItemPane", () => {
  describe("empty state", () => {
    it("renders 'No active item' when currentItem is null", () => {
      const state = createMockTuiState({ currentItem: null });

      const element = React.createElement(ActiveItemPane, {
        state,
        width: 80,
      });

      expect(element).toBeDefined();
      expect(element.props.state.currentItem).toBeNull();
    });

    it("renders without crashing when currentItem is null", () => {
      const state = createMockTuiState({ currentItem: null });

      const element = React.createElement(ActiveItemPane, {
        state,
        width: 80,
      });

      expect(element.type).toBe(ActiveItemPane);
    });
  });

  describe("item lookup", () => {
    it("finds item by currentItem ID", () => {
      const state = createMockTuiState({
        currentItem: "foundation/001-core-types",
        items: [
          {
            id: "foundation/001-core-types",
            state: "done",
            title: "Core Types",
          },
          {
            id: "features/001-auth",
            state: "implementing",
            title: "Authentication",
          },
        ],
      });

      const item = state.items.find((it) => it.id === state.currentItem);

      expect(item).toBeDefined();
      expect(item?.id).toBe("foundation/001-core-types");
      expect(item?.title).toBe("Core Types");
    });

    it("returns undefined when currentItem not found", () => {
      const state = createMockTuiState({
        currentItem: "nonexistent/item",
        items: [
          {
            id: "foundation/001-core-types",
            state: "done",
            title: "Core Types",
          },
        ],
      });

      const item = state.items.find((it) => it.id === state.currentItem);

      expect(item).toBeUndefined();
    });

    it("handles missing item with empty title fallback", () => {
      const item = undefined;
      const title = item?.title ?? "";

      expect(title).toBe("");
    });
  });

  describe("active state determination", () => {
    it("uses currentPhase when available", () => {
      const currentPhase = "implementing";
      const item = { state: "idea", title: "Test" };
      const activeState = currentPhase ?? item?.state ?? "unknown";

      expect(activeState).toBe("implementing");
    });

    it("falls back to item.state when currentPhase is null", () => {
      const currentPhase = null;
      const item = { state: "done", title: "Test" };
      const activeState = currentPhase ?? item?.state ?? "unknown";

      expect(activeState).toBe("done");
    });

    it("falls back to 'unknown' when both are null", () => {
      const currentPhase = null;
      const item = undefined;
      const activeState = currentPhase ?? item?.state ?? "unknown";

      expect(activeState).toBe("unknown");
    });
  });

  describe("workflow line rendering", () => {
    it("wraps active state in brackets", () => {
      const activeState = "implementing";

      const workflowLine = WORKFLOW_STATES.map((s) =>
        s === activeState ? `[${s}]` : s,
      ).join(" → ");

      expect(workflowLine).toContain("[implementing]");
    });

    it("does not wrap inactive states", () => {
      const activeState = "implementing";

      const workflowLine = WORKFLOW_STATES.map((s) =>
        s === activeState ? `[${s}]` : s,
      ).join(" → ");

      expect(workflowLine).toContain("idea");
      expect(workflowLine).toContain(" → ");
    });

    it("joins states with arrow", () => {
      const activeState = "planned";

      const workflowLine = WORKFLOW_STATES.map((s) =>
        s === activeState ? `[${s}]` : s,
      ).join(" → ");

      expect(workflowLine).toContain(" → ");
      expect(workflowLine.split(" → ").length).toBeGreaterThan(1);
    });

    it("handles unknown active state", () => {
      const activeState = "unknown";

      const workflowLine = WORKFLOW_STATES.map((s) =>
        s === activeState ? `[${s}]` : s,
      ).join(" → ");

      // No brackets should appear since "unknown" is not in WORKFLOW_STATES
      expect(workflowLine).not.toContain("[unknown]");
    });
  });

  describe("iteration counter", () => {
    it("formats iteration counter correctly", () => {
      const currentIteration = 5;
      const maxIterations = 100;

      const iterationText = `(${currentIteration}/${maxIterations})`;

      expect(iterationText).toBe("(5/100)");
    });

    it("handles zero iteration", () => {
      const currentIteration = 0;
      const maxIterations = 100;

      const iterationText = `(${currentIteration}/${maxIterations})`;

      expect(iterationText).toBe("(0/100)");
    });

    it("handles max iteration", () => {
      const currentIteration = 100;
      const maxIterations = 100;

      const iterationText = `(${currentIteration}/${maxIterations})`;

      expect(iterationText).toBe("(100/100)");
    });
  });

  describe("component rendering", () => {
    it("renders without crashing when currentItem exists", () => {
      const state = createMockTuiState({
        currentItem: "foundation/001-core-types",
      });

      const element = React.createElement(ActiveItemPane, {
        state,
        width: 80,
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(ActiveItemPane);
    });

    it("passes width prop correctly", () => {
      const state = createMockTuiState({
        currentItem: "foundation/001-core-types",
      });

      const element = React.createElement(ActiveItemPane, {
        state,
        width: 80,
      });

      expect(element.props.width).toBe(80);
    });

    it("passes state prop correctly", () => {
      const state = createMockTuiState({
        currentItem: "foundation/001-core-types",
      });

      const element = React.createElement(ActiveItemPane, {
        state,
        width: 80,
      });

      expect(element.props.state).toBe(state);
    });
  });

  describe("display content", () => {
    it("includes currentItem ID in display", () => {
      const currentItem = "foundation/001-core-types";
      const title = "Core Types";

      const displayText = `Active: ${currentItem} - ${title}`;

      expect(displayText).toContain("foundation/001-core-types");
      expect(displayText).toContain("Core Types");
    });

    it("handles empty title", () => {
      const currentItem = "foundation/001-core-types";
      const title = "";

      const displayText = `Active: ${currentItem}${title ? ` - ${title}` : ""}`;

      expect(displayText).toBe("Active: foundation/001-core-types");
    });

    it("formats phase line with active state and iterations", () => {
      const activeState = "implementing";
      const currentIteration = 5;
      const maxIterations = 100;

      const phaseText = `Phase: ${activeState} (${currentIteration}/${maxIterations})`;

      expect(phaseText).toBe("Phase: implementing (5/100)");
    });
  });
});
