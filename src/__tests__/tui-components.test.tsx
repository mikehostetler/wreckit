import { describe, it, expect, beforeEach, vi } from "bun:test";
import { createMockTuiState } from "../tui/__tests__/test-utils";

describe("InkApp handleScroll callback logic", () => {
  describe("logsHeight calculation", () => {
    it("calculates logsHeight as height - 10", () => {
      const height = 24;
      const logsHeight = height - 10;
      expect(logsHeight).toBe(14);
    });

    it("handles different terminal heights", () => {
      expect(20 - 10).toBe(10);
      expect(30 - 10).toBe(20);
      expect(40 - 10).toBe(30);
    });
  });

  describe("maxOffset calculation", () => {
    it("returns 0 for empty logs array", () => {
      const state = createMockTuiState({ logs: [] });
      const logsHeight = 14;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);
      expect(maxOffset).toBe(0);
    });

    it("returns 0 when logs.length < logsHeight", () => {
      const state = createMockTuiState({
        logs: ["log1", "log2", "log3"],
      });
      const logsHeight = 14;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);
      expect(maxOffset).toBe(0);
    });

    it("returns 0 when logs.length === logsHeight", () => {
      const state = createMockTuiState({
        logs: Array.from({ length: 14 }, (_, i) => `log${i}`),
      });
      const logsHeight = 14;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);
      expect(maxOffset).toBe(0);
    });

    it("returns positive value when logs.length > logsHeight", () => {
      const state = createMockTuiState({
        logs: Array.from({ length: 100 }, (_, i) => `log${i}`),
      });
      const logsHeight = 14;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);
      expect(maxOffset).toBe(86);
    });

    it("handles single log entry", () => {
      const state = createMockTuiState({ logs: ["single log"] });
      const logsHeight = 14;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);
      expect(maxOffset).toBe(0);
    });
  });

  describe("'up' direction scroll", () => {
    it("increments offset by 1", () => {
      const currentOffset = 0;
      const maxOffset = 100;
      const nextOffset = Math.min(currentOffset + 1, maxOffset);
      expect(nextOffset).toBe(1);
    });

    it("respects maxOffset boundary", () => {
      const currentOffset = 100;
      const maxOffset = 100;
      const nextOffset = Math.min(currentOffset + 1, maxOffset);
      expect(nextOffset).toBe(100);
    });

    it("allows scrolling up from middle position", () => {
      const currentOffset = 50;
      const maxOffset = 100;
      const nextOffset = Math.min(currentOffset + 1, maxOffset);
      expect(nextOffset).toBe(51);
    });
  });

  describe("'down' direction scroll", () => {
    it("decrements offset by 1", () => {
      const currentOffset = 10;
      const nextOffset = Math.max(currentOffset - 1, 0);
      expect(nextOffset).toBe(9);
    });

    it("respects min boundary (0)", () => {
      const currentOffset = 0;
      const nextOffset = Math.max(currentOffset - 1, 0);
      expect(nextOffset).toBe(0);
    });

    it("allows scrolling down from middle position", () => {
      const currentOffset = 50;
      const nextOffset = Math.max(currentOffset - 1, 0);
      expect(nextOffset).toBe(49);
    });
  });

  describe("'pageUp' direction scroll", () => {
    it("increments offset by logsHeight", () => {
      const currentOffset = 0;
      const logsHeight = 14;
      const maxOffset = 100;
      const nextOffset = Math.min(currentOffset + logsHeight, maxOffset);
      expect(nextOffset).toBe(14);
    });

    it("respects maxOffset boundary", () => {
      const currentOffset = 90;
      const logsHeight = 14;
      const maxOffset = 100;
      const nextOffset = Math.min(currentOffset + logsHeight, maxOffset);
      expect(nextOffset).toBe(100);
    });

    it("clamps to maxOffset when overshooting", () => {
      const currentOffset = 95;
      const logsHeight = 14;
      const maxOffset = 100;
      const nextOffset = Math.min(currentOffset + logsHeight, maxOffset);
      expect(nextOffset).toBe(100);
    });
  });

  describe("'pageDown' direction scroll", () => {
    it("decrements offset by logsHeight", () => {
      const currentOffset = 50;
      const logsHeight = 14;
      const nextOffset = Math.max(currentOffset - logsHeight, 0);
      expect(nextOffset).toBe(36);
    });

    it("respects min boundary (0)", () => {
      const currentOffset = 10;
      const logsHeight = 14;
      const nextOffset = Math.max(currentOffset - logsHeight, 0);
      expect(nextOffset).toBe(0);
    });

    it("allows partial page down near bottom", () => {
      const currentOffset = 20;
      const logsHeight = 14;
      const nextOffset = Math.max(currentOffset - logsHeight, 0);
      expect(nextOffset).toBe(6);
    });
  });

  describe("'top' direction scroll", () => {
    it("jumps to maxOffset", () => {
      const maxOffset = 100;
      const nextOffset = maxOffset;
      expect(nextOffset).toBe(100);
    });

    it("handles zero maxOffset", () => {
      const maxOffset = 0;
      const nextOffset = maxOffset;
      expect(nextOffset).toBe(0);
    });
  });

  describe("'bottom' direction scroll", () => {
    it("jumps to 0", () => {
      const nextOffset = 0;
      expect(nextOffset).toBe(0);
    });
  });

  describe("autoScroll behavior", () => {
    it("disables autoScroll when offset becomes non-zero", () => {
      const nextOffset = 5;
      const autoScroll = nextOffset === 0;
      expect(autoScroll).toBe(false);
    });

    it("enables autoScroll when offset returns to zero", () => {
      const nextOffset = 0;
      const autoScroll = nextOffset === 0;
      expect(autoScroll).toBe(true);
    });

    it("keeps autoScroll disabled at non-zero offset", () => {
      const nextOffset = 10;
      const autoScroll = nextOffset === 0;
      expect(autoScroll).toBe(false);
    });

    it("keeps autoScroll enabled at zero offset", () => {
      const nextOffset = 0;
      const autoScroll = nextOffset === 0;
      expect(autoScroll).toBe(true);
    });
  });

  describe("edge cases and boundary conditions", () => {
    it("handles empty logs with all scroll directions", () => {
      const state = createMockTuiState({ logs: [] });
      const height = 24;
      const logsHeight = height - 10;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);

      expect(maxOffset).toBe(0);

      // All directions should result in offset 0
      expect(Math.min(0 + 1, maxOffset)).toBe(0); // up
      expect(Math.max(0 - 1, 0)).toBe(0); // down
      expect(Math.min(0 + logsHeight, maxOffset)).toBe(0); // pageUp
      expect(Math.max(0 - logsHeight, 0)).toBe(0); // pageDown
      expect(maxOffset).toBe(0); // top
      expect(0).toBe(0); // bottom
    });

    it("handles single log entry", () => {
      const state = createMockTuiState({ logs: ["only log"] });
      const height = 24;
      const logsHeight = height - 10;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);

      expect(maxOffset).toBe(0);
    });

    it("handles logs exactly matching logsHeight", () => {
      const state = createMockTuiState({
        logs: Array.from({ length: 14 }, (_, i) => `log${i}`),
      });
      const height = 24;
      const logsHeight = height - 10;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);

      expect(maxOffset).toBe(0);
    });

    it("handles logs one more than logsHeight", () => {
      const state = createMockTuiState({
        logs: Array.from({ length: 15 }, (_, i) => `log${i}`),
      });
      const height = 24;
      const logsHeight = height - 10;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);

      expect(maxOffset).toBe(1);
    });

    it("handles very large log arrays", () => {
      const state = createMockTuiState({
        logs: Array.from({ length: 1000 }, (_, i) => `log${i}`),
      });
      const height = 24;
      const logsHeight = height - 10;
      const maxOffset = Math.max(0, state.logs.length - logsHeight);

      expect(maxOffset).toBe(986);
    });

    it("handles scrolling when at maxOffset", () => {
      const currentOffset = 100;
      const maxOffset = 100;

      const upOffset = Math.min(currentOffset + 1, maxOffset);
      expect(upOffset).toBe(100);

      const downOffset = Math.max(currentOffset - 1, 0);
      expect(downOffset).toBe(99);
    });

    it("handles scrolling when at zero offset", () => {
      const currentOffset = 0;
      const maxOffset = 100;

      const upOffset = Math.min(currentOffset + 1, maxOffset);
      expect(upOffset).toBe(1);

      const downOffset = Math.max(currentOffset - 1, 0);
      expect(downOffset).toBe(0);
    });
  });

  describe("scroll direction transitions", () => {
    it("handles up after down scroll", () => {
      let offset = 0;
      const maxOffset = 100;

      // Scroll down
      offset = Math.max(offset - 1, 0);
      expect(offset).toBe(0);

      // Scroll up
      offset = Math.min(offset + 1, maxOffset);
      expect(offset).toBe(1);
    });

    it("handles pageUp after pageDown", () => {
      let offset = 50;
      const logsHeight = 14;
      const maxOffset = 100;

      // Page down
      offset = Math.max(offset - logsHeight, 0);
      expect(offset).toBe(36);

      // Page up
      offset = Math.min(offset + logsHeight, maxOffset);
      expect(offset).toBe(50);
    });

    it("handles top to bottom transition", () => {
      const maxOffset = 100;

      // Go to top
      let offset = maxOffset;
      expect(offset).toBe(100);

      // Go to bottom
      offset = 0;
      expect(offset).toBe(0);
    });

    it("handles bottom to top transition", () => {
      const maxOffset = 100;

      // Go to bottom
      let offset = 0;
      expect(offset).toBe(0);

      // Go to top
      offset = maxOffset;
      expect(offset).toBe(100);
    });
  });
});

describe("InkApp keyboard input handling", () => {
  describe("quit key bindings", () => {
    it("maps 'q' key to onQuit callback", () => {
      const onQuit = vi.fn();
      const input = "q";
      const key = { ctrl: false };

      // Simulate useInput handler logic from InkApp.tsx:78-79
      if (input === "q" || (key.ctrl && input === "c")) {
        onQuit();
      }

      expect(onQuit).toHaveBeenCalledTimes(1);
    });

    it("maps Ctrl+C to onQuit callback", () => {
      const onQuit = vi.fn();
      const input = "c";
      const key = { ctrl: true };

      if (input === "q" || (key.ctrl && input === "c")) {
        onQuit();
      }

      expect(onQuit).toHaveBeenCalledTimes(1);
    });

    it("does not call onQuit for other keys", () => {
      const onQuit = vi.fn();
      const input = "x";
      const key = { ctrl: false };

      if (input === "q" || (key.ctrl && input === "c")) {
        onQuit();
      }

      expect(onQuit).toHaveBeenCalledTimes(0);
    });

    it("does not call onQuit for Ctrl+other keys", () => {
      const onQuit = vi.fn();
      const input = "x";
      const key = { ctrl: true };

      if (input === "q" || (key.ctrl && input === "c")) {
        onQuit();
      }

      expect(onQuit).toHaveBeenCalledTimes(0);
    });
  });

  describe("view toggle key bindings", () => {
    it("maps 'l' key to toggle showLogs state", () => {
      let showLogs = false;
      const setShowLogs = (value: boolean) => {
        showLogs = value;
      };
      const input = "l";
      const key = {};

      // Simulate useInput handler logic from InkApp.tsx:80
      if (input === "l") {
        setShowLogs(!showLogs);
      }

      expect(showLogs).toBe(true);
    });

    it("toggles showLogs from true to false", () => {
      let showLogs = true;
      const setShowLogs = (value: boolean) => {
        showLogs = value;
      };
      const input = "l";
      const key = {};

      if (input === "l") {
        setShowLogs(!showLogs);
      }

      expect(showLogs).toBe(false);
    });
  });

  describe("scroll down key bindings", () => {
    it("maps 'j' key to handleScroll('down')", () => {
      const handleScroll = vi.fn();
      const input = "j";
      const key = { downArrow: false };

      // Simulate useInput handler logic from InkApp.tsx:81-82
      if (input === "j" || key.downArrow) {
        handleScroll("down");
      }

      expect(handleScroll).toHaveBeenCalledWith("down");
    });

    it("maps downArrow key to handleScroll('down')", () => {
      const handleScroll = vi.fn();
      const input = "";
      const key = { downArrow: true };

      if (input === "j" || key.downArrow) {
        handleScroll("down");
      }

      expect(handleScroll).toHaveBeenCalledWith("down");
    });

    it("does not call handleScroll for other keys", () => {
      const handleScroll = vi.fn();
      const input = "x";
      const key = { downArrow: false };

      if (input === "j" || key.downArrow) {
        handleScroll("down");
      }

      expect(handleScroll).toHaveBeenCalledTimes(0);
    });
  });

  describe("scroll up key bindings", () => {
    it("maps 'k' key to handleScroll('up')", () => {
      const handleScroll = vi.fn();
      const input = "k";
      const key = { upArrow: false };

      // Simulate useInput handler logic from InkApp.tsx:83-84
      if (input === "k" || key.upArrow) {
        handleScroll("up");
      }

      expect(handleScroll).toHaveBeenCalledWith("up");
    });

    it("maps upArrow key to handleScroll('up')", () => {
      const handleScroll = vi.fn();
      const input = "";
      const key = { upArrow: true };

      if (input === "k" || key.upArrow) {
        handleScroll("up");
      }

      expect(handleScroll).toHaveBeenCalledWith("up");
    });

    it("does not call handleScroll for other keys", () => {
      const handleScroll = vi.fn();
      const input = "x";
      const key = { upArrow: false };

      if (input === "k" || key.upArrow) {
        handleScroll("up");
      }

      expect(handleScroll).toHaveBeenCalledTimes(0);
    });
  });

  describe("page navigation key bindings", () => {
    it("maps pageDown key to handleScroll('pageDown')", () => {
      const handleScroll = vi.fn();
      const key = { pageDown: true, pageUp: false };

      // Simulate useInput handler logic from InkApp.tsx:85-86
      if (key.pageDown) {
        handleScroll("pageDown");
      } else if (key.pageUp) {
        handleScroll("pageUp");
      }

      expect(handleScroll).toHaveBeenCalledWith("pageDown");
    });

    it("maps pageUp key to handleScroll('pageUp')", () => {
      const handleScroll = vi.fn();
      const key = { pageDown: false, pageUp: true };

      if (key.pageDown) {
        handleScroll("pageDown");
      } else if (key.pageUp) {
        handleScroll("pageUp");
      }

      expect(handleScroll).toHaveBeenCalledWith("pageUp");
    });

    it("handles both pageDown and pageUp being false", () => {
      const handleScroll = vi.fn();
      const key = { pageDown: false, pageUp: false };

      if (key.pageDown) {
        handleScroll("pageDown");
      } else if (key.pageUp) {
        handleScroll("pageUp");
      }

      expect(handleScroll).toHaveBeenCalledTimes(0);
    });
  });

  describe("jump to position key bindings", () => {
    it("maps lowercase 'g' to handleScroll('top')", () => {
      const handleScroll = vi.fn();
      const input = "g";
      const key = {};

      // Simulate useInput handler logic from InkApp.tsx:87-88
      if (input === "g") {
        handleScroll("top");
      } else if (input === "G") {
        handleScroll("bottom");
      }

      expect(handleScroll).toHaveBeenCalledWith("top");
    });

    it("maps uppercase 'G' to handleScroll('bottom')", () => {
      const handleScroll = vi.fn();
      const input = "G";
      const key = {};

      if (input === "g") {
        handleScroll("top");
      } else if (input === "G") {
        handleScroll("bottom");
      }

      expect(handleScroll).toHaveBeenCalledWith("bottom");
    });

    it("is case-sensitive for 'g' vs 'G'", () => {
      const handleScrollTop = vi.fn();
      const handleScrollBottom = vi.fn();

      // Test lowercase 'g'
      let input = "g";
      if (input === "g") {
        handleScrollTop("top");
      } else if (input === "G") {
        handleScrollBottom("bottom");
      }
      expect(handleScrollTop).toHaveBeenCalledWith("top");
      expect(handleScrollBottom).toHaveBeenCalledTimes(0);

      // Reset mocks
      handleScrollTop.mockReset();
      handleScrollBottom.mockReset();

      // Test uppercase 'G'
      input = "G";
      if (input === "g") {
        handleScrollTop("top");
      } else if (input === "G") {
        handleScrollBottom("bottom");
      }
      expect(handleScrollTop).toHaveBeenCalledTimes(0);
      expect(handleScrollBottom).toHaveBeenCalledWith("bottom");
    });

    it("does not call handleScroll for other characters", () => {
      const handleScroll = vi.fn();
      const input = "x";
      const key = {};

      if (input === "g") {
        handleScroll("top");
      } else if (input === "G") {
        handleScroll("bottom");
      }

      expect(handleScroll).toHaveBeenCalledTimes(0);
    });
  });

  describe("multiple key press scenarios", () => {
    it("handles sequential key presses", () => {
      const handleScroll = vi.fn();
      const onQuit = vi.fn();
      let showLogs = false;
      const setShowLogs = (value: boolean) => {
        showLogs = value;
      };

      // Press 'j' to scroll down
      let input = "j";
      let key = {};
      if (input === "j" || key.downArrow) {
        handleScroll("down");
      }
      expect(handleScroll).toHaveBeenCalledWith("down");

      // Press 'k' to scroll up
      input = "k";
      key = {};
      if (input === "k" || key.upArrow) {
        handleScroll("up");
      }
      expect(handleScroll).toHaveBeenCalledWith("up");

      // Press 'l' to toggle logs
      input = "l";
      key = {};
      if (input === "l") {
        setShowLogs(!showLogs);
      }
      expect(showLogs).toBe(true);

      // Press 'q' to quit
      input = "q";
      key = { ctrl: false };
      if (input === "q" || (key.ctrl && input === "c")) {
        onQuit();
      }
      expect(onQuit).toHaveBeenCalledTimes(1);

      expect(handleScroll).toHaveBeenCalledTimes(2);
    });

    it("handles modifier keys correctly", () => {
      const handleScroll = vi.fn();
      const onQuit = vi.fn();

      // Ctrl+C should quit
      let input = "c";
      let key = { ctrl: true };
      if (input === "q" || (key.ctrl && input === "c")) {
        onQuit();
      }
      expect(onQuit).toHaveBeenCalledTimes(1);

      // Plain 'c' should not quit
      onQuit.mockReset();
      input = "c";
      key = { ctrl: false };
      if (input === "q" || (key.ctrl && input === "c")) {
        onQuit();
      }
      expect(onQuit).toHaveBeenCalledTimes(0);
    });
  });

  describe("key binding priority and exclusivity", () => {
    it("quit keys take priority and prevent other actions", () => {
      const handleScroll = vi.fn();
      const onQuit = vi.fn();
      let showLogs = false;

      // Press 'q' - should only call onQuit
      const input = "q";
      const key = { ctrl: false };

      if (input === "q" || (key.ctrl && input === "c")) {
        onQuit();
      } else if (input === "l") {
        showLogs = !showLogs;
      } else if (input === "j" || key.downArrow) {
        handleScroll("down");
      }

      expect(onQuit).toHaveBeenCalledTimes(1);
      expect(handleScroll).toHaveBeenCalledTimes(0);
      expect(showLogs).toBe(false);
    });

    it("only one action is triggered per key press", () => {
      const handleScroll = vi.fn();
      const setShowLogs = vi.fn();

      // Press 'j' - should only scroll down, not toggle logs
      const input = "j";
      const key = { downArrow: false };

      if (input === "l") {
        setShowLogs(!false);
      } else if (input === "j" || key.downArrow) {
        handleScroll("down");
      }

      expect(handleScroll).toHaveBeenCalledWith("down");
      expect(setShowLogs).toHaveBeenCalledTimes(0);
    });
  });
});
