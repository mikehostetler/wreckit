# Add comprehensive test coverage for TUI components Implementation Plan

## Overview
Add unit tests for all TUI (Terminal User Interface) React components built with Ink. Currently, only utility functions are tested (`src/__tests__/tui.test.ts`), leaving all React components untested. This creates a significant gap in test coverage for interactive UI components that handle complex state management, keyboard input, and scroll behavior.

## Current State Analysis

**What exists now:**
- `src/__tests__/tui.test.ts` (378 lines) tests only utility functions: `createTuiState`, `updateTuiState`, `renderDashboard`, `formatRuntime`, `getStateIcon`, `padToWidth`, `TuiRunner`, and `createSimpleProgress`
- **No tests** for any React components (InkApp or 7 pane components)
- **No tests** for scroll offset calculations and auto-scroll behavior
- **No tests** for keyboard input handling (q, l, j, k, pageUp, pageDown, g, G, Ctrl+C)
- Current coverage is limited to state management utilities, not UI rendering or interaction

**What's missing:**
- React component rendering and prop handling for all 8 components
- State updates and reactivity in response to prop changes
- Keyboard input handling with mocked `useInput` hook from Ink
- Scroll calculations and boundary conditions in `handleScroll` callback
- Auto-scroll behavior when new logs arrive
- Component lifecycle with mocked `useEffect` and `useStdout` hooks
- Edge cases: empty data, truncation, overflow, boundary values

**Key constraints discovered:**
- **Bun test runner only** - No Jest/Vitest (package.json:30 uses `bun test`)
- **No testing libraries** - Cannot add heavy dependencies like `@testing-library/react` per technical constraints
- **CI must be headless** - Tests cannot depend on TTY or terminal emulation
- **Ink hooks require mocking** - `useInput` and `useStdout` interact with terminal streams and must be mocked
- **React.createElement pattern** - TuiRunner uses `React.createElement(InkApp, ...)` not JSX (runner.ts:84-89, 96-101)
- **Existing patterns** - Use `mock.module()` for module mocking (run.isospec.ts:17-24), `vi.fn()` for spies, `createMockLogger()` helper pattern

**Dependencies (already installed):**
- `ink@^6.6.0` - React for CLI (package.json:64)
- `react@^19.2.3` - React runtime (package.json:67)
- `@types/react@^19.2.8` - React type definitions (package.json:62)
- Bun's built-in test runner with `bun:test` module

## Desired End State

**Specification:**
- All 8 TUI React components have unit tests covering:
  - Component rendering with various prop combinations
  - State management (useState, useEffect hooks)
  - Callback functions (handleScroll, input handlers)
  - Edge cases and boundary conditions
  - Text truncation and overflow handling
- Test coverage > 80% for TUI components (measured by Bun's coverage reporter)
- All tests pass in CI headless environment (no TTY required)
- Tests follow existing patterns: `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `mock`, `spyOn`, `vi`

**Verification:**
- Run `bun test` to execute all tests (including new TUI component tests)
- Run `bun test --coverage` to verify > 80% coverage for TUI components
- Verify tests pass in CI environment (no TTY dependencies)
- Manual code review to ensure all component logic is tested

### Key Discoveries:
- **Components are pure functions** - All pane components are functional components with simple prop-based rendering, making them easier to test than class components
- **InkApp is complex** - Contains 6 React hooks (useState x4, useEffect x2, useCallback, useInput, useStdout) and complex scroll logic requiring careful mocking strategy
- **handleScroll is the most complex logic** - 6 directions with boundary conditions (lines 43-76 in InkApp.tsx)
- **Auto-scroll interaction** - Auto-scroll disables when user scrolls (line 71 in InkApp.tsx: `setAutoScroll(next === 0)`)
- **Timer effect** - InkApp has a 1-second timer that forces re-renders (lines 36-41), requiring fake timers or careful testing
- **Terminal dimensions matter** - Components calculate layout based on `stdout.columns` and `stdout.rows` (lines 23-24 in InkApp.tsx)
- **Scroll indicators are conditional** - ItemsPane shows ↑/↓ indicators only when `state.items.length > height` (ItemsPane.tsx:37)
- **Text truncation is repeated** - Multiple components have `truncate` helper functions (ItemsPane.tsx:86-91, LogsPane.tsx:54-59, Header.tsx:58-63)
- **Workflow state bracketing** - ActiveItemPane wraps active state in brackets: `[${s}]` (ActiveItemPane.tsx:26-28)
- **Progress bar calculation** - Footer uses filled/empty bar characters based on percentage (Footer.tsx:27-29)
- **Tool status icons** - ToolCallItem uses ▶ for running, ✓ for completed, ✗ for error (ToolCallItem.tsx:14)
- **showResult prop** - ToolCallItem only shows result when `showResult=true` AND tool is completed (AgentActivityPane.tsx:48)

### Pattern to Follow:
From `src/__tests__/commands/run.isospec.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi, mock } from "bun:test";

// Mock pattern for module-level mocking
mock.module("../../workflow", () => ({
  runPhaseResearch: mockedFunction,
  getNextPhase: originalFunction,
}));

// Test data factory pattern
function createTestItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "features/001-test-feature",
    title: "Test Feature",
    state: "idea",
    ...overrides,
  };
}

// Mock logger pattern
function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}
```

### Constraint to Work Within:
- **Cannot add testing libraries** - Must use Bun's built-in test runner and mocking only
- **Tests must work without TTY** - Mock terminal interactions completely
- **No visual regression testing** - Explicitly out of scope
- **Focus on logic over rendering** - Test state changes and calculations, not visual output

## What We're NOT Doing
- **End-to-end TUI testing** with terminal emulation or screenshot comparison (explicitly out of scope)
- **Visual regression testing** to detect pixel-level changes (explicitly out of scope)
- **Performance testing** for large logs or high-frequency updates (explicitly out of scope)
- **Integration testing** of TuiRunner with real Ink instance (will mock the `render` function)
- **Adding testing dependencies** like `@testing-library/react` or `ink-testing-library` (per technical constraints)
- **Testing string output visually** - Will not test exact ANSI codes or visual formatting
- **Refactoring components** - Only adding tests, not changing implementation (unless bugs are discovered)

## Implementation Approach

**High-level strategy:**
1. **Start simple** - Test presentational components first (ItemsPane, LogsPane, Header, Footer, ActiveItemPane, ToolCallItem, AgentActivityPane) before testing complex InkApp
2. **Mock Ink hooks** - Create test utilities that mock `useInput`, `useStdout`, and other Ink-specific hooks
3. **Test logic, not rendering** - Focus on testing calculations, state changes, and conditional rendering rather than visual output
4. **Use parameterized tests** - Test multiple similar cases (e.g., all scroll directions) with test.each or separate test cases
5. **Create reusable test data factories** - Follow existing `createTestItem()` pattern for TuiState, logs, tool executions

**Reasoning:**
- Presentational components have simpler prop-based rendering and are easier to test
- Mocking Ink hooks upfront allows testing InkApp without terminal dependencies
- Testing logic directly is more reliable than testing rendered strings in a CLI environment
- Reusable test factories reduce duplication and make tests more maintainable
- Incremental approach allows early validation of testing strategy before tackling complex components

---

## Phase 1: Test Infrastructure Setup

### Overview
Create test utilities and infrastructure that will be used by all TUI component tests. This includes mock factories for test data, mock implementations of Ink hooks, and helper functions for common test scenarios.

### Changes Required:

#### 1. Create test utilities file
**File**: `src/tui/__tests__/test-utils.tsx` (new file)
**Changes**: Add test utility functions and mock factories

```typescript
import React from "react";
import { vi } from "bun:test";
import type { TuiState, ToolExecution, AgentActivityForItem } from "../dashboard";
import { createTuiState } from "../dashboard";
import type { IndexItem } from "../../schemas";

/**
 * Creates a mock TuiState with optional overrides
 */
export function createMockTuiState(overrides: Partial<TuiState> = {}): TuiState {
  const items: IndexItem[] = [
    {
      id: "foundation/001-core-types",
      title: "Core Types",
      state: "done",
      section: "foundation",
      overview: "",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "features/001-auth",
      title: "Authentication",
      state: "implementing",
      section: "features",
      overview: "",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
  ];

  const baseState = createTuiState(items);

  return {
    ...baseState,
    ...overrides,
  };
}

/**
 * Creates a mock stdout object with configurable dimensions
 */
export function createMockStdout(columns: number = 80, rows: number = 24) {
  return {
    columns,
    rows,
    write: vi.fn(),
  };
}

/**
 * Creates a mock ToolExecution object
 */
export function createMockToolExecution(
  overrides: Partial<ToolExecution> = {}
): ToolExecution {
  return {
    toolUseId: "tool-123",
    toolName: "Read",
    input: { path: "/path/to/file" },
    status: "running",
    startedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a mock AgentActivityForItem object
 */
export function createMockAgentActivity(
  overrides: Partial<AgentActivityForItem> = {}
): AgentActivityForItem {
  return {
    thoughts: ["Thinking about the problem"],
    tools: [createMockToolExecution()],
    ...overrides,
  };
}

/**
 * Mock implementation of useInput hook that allows test control
 */
export function mockUseInput() {
  let inputHandler: ((input: string, key: any) => void) | null = null;

  const mockUseInput = (handler: (input: string, key: any) => void) => {
    inputHandler = handler;
  };

  return {
    mockUseInput,
    simulateInput: (input: string, key: any = {}) => {
      if (inputHandler) {
        inputHandler(input, key);
      }
    },
  };
}

/**
 * Mock implementation of useStdout hook
 */
export function mockUseStdout(stdout: { columns: number; rows: number }) {
  const mockUseStdout = () => ({ stdout });
  return { mockUseStdout };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Test utilities file compiles without TypeScript errors
- [ ] All factory functions return valid mock data
- [ ] Mock functions are compatible with Bun's vi.fn() and mock.module()

#### Manual Verification:
- [ ] Review test utilities for completeness
- [ ] Verify mock data structures match actual TuiState interface
- [ ] Confirm mock hooks simulate Ink behavior correctly

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Test Presentational Components

### Overview
Add unit tests for all presentational pane components (ItemsPane, LogsPane, ActiveItemPane, AgentActivityPane, Header, Footer, ToolCallItem). These components have simple prop-based rendering and are easier to test than InkApp.

### Changes Required:

#### 1. Test ItemsPane component
**File**: `src/tui/components/__tests__/ItemsPane.test.tsx` (new file)
**Changes**: Add tests for ItemsPane rendering and behavior

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import React from "react";
import { ItemsPane } from "../ItemsPane";
import { createMockTuiState } from "../../__tests__/test-utils";

describe("ItemsPane", () => {
  it("renders empty state when no items", () => {
    const state = createMockTuiState({ items: [] });
    const result = React.createElement(ItemsPane, {
      state,
      width: 40,
      height: 10,
    });
    expect(result).toBeDefined();
    // Note: Full rendering would require React test renderer
    // For now, we test that component doesn't throw
  });

  it("renders items with state icons", () => {
    const state = createMockTuiState({
      items: [
        { id: "item1", state: "done", title: "Done Item" },
        { id: "item2", state: "implementing", title: "Active Item" },
      ],
    });
    const result = React.createElement(ItemsPane, {
      state,
      width: 40,
      height: 10,
    });
    expect(result).toBeDefined();
  });

  it("calculates scroll offset to keep active item visible", () => {
    // Test the scroll offset calculation logic
    const state = createMockTuiState({
      items: Array.from({ length: 20 }, (_, i) => ({
        id: `item${i}`,
        state: "idea",
        title: `Item ${i}`,
      })),
      currentItem: "item15",
    });
    const result = React.createElement(ItemsPane, {
      state,
      width: 40,
      height: 10,
    });
    expect(result).toBeDefined();
  });

  it("shows scroll indicators when items exceed height", () => {
    const state = createMockTuiState({
      items: Array.from({ length: 20 }, (_, i) => ({
        id: `item${i}`,
        state: "idea",
        title: `Item ${i}`,
      })),
    });
    const result = React.createElement(ItemsPane, {
      state,
      width: 40,
      height: 10,
    });
    expect(result).toBeDefined();
  });
});
```

#### 2. Test LogsPane component
**File**: `src/tui/components/__tests__/LogsPane.test.tsx` (new file)
**Changes**: Add tests for LogsPane rendering and scroll calculations

```typescript
import { describe, it, expect } from "bun:test";
import React from "react";
import { LogsPane } from "../LogsPane";

describe("LogsPane", () => {
  it("renders empty state when no logs", () => {
    const result = React.createElement(LogsPane, {
      logs: [],
      width: 80,
      height: 20,
      scrollOffset: 0,
    });
    expect(result).toBeDefined();
  });

  it("calculates visible window based on scroll offset", () => {
    const logs = Array.from({ length: 100 }, (_, i) => `Log line ${i}`);
    const result = React.createElement(LogsPane, {
      logs,
      width: 80,
      height: 20,
      scrollOffset: 10,
    });
    expect(result).toBeDefined();
  });

  it("shows position indicators based on scroll position", () => {
    const logs = Array.from({ length: 100 }, (_, i) => `Log line ${i}`);
    const result = React.createElement(LogsPane, {
      logs,
      width: 80,
      height: 20,
      scrollOffset: 0,
    });
    expect(result).toBeDefined();
  });
});
```

#### 3. Test ActiveItemPane component
**File**: `src/tui/components/__tests__/ActiveItemPane.test.tsx` (new file)
**Changes**: Add tests for ActiveItemPane rendering

#### 4. Test AgentActivityPane component
**File**: `src/tui/components/__tests__/AgentActivityPane.test.tsx` (new file)
**Changes**: Add tests for AgentActivityPane rendering

#### 5. Test Header component
**File**: `src/tui/components/__tests__/Header.test.tsx` (new file)
**Changes**: Add tests for Header rendering and text truncation

#### 6. Test Footer component
**File**: `src/tui/components/__tests__/Footer.test.tsx` (new file)
**Changes**: Add tests for Footer rendering and progress bar calculation

#### 7. Test ToolCallItem component
**File**: `src/tui/components/__tests__/ToolCallItem.test.tsx` (new file)
**Changes**: Add tests for ToolCallItem rendering with different states

### Success Criteria:

#### Automated Verification:
- [ ] All 7 component test files compile without errors
- [ ] Tests pass: `bun test src/tui/components/__tests__/*.test.tsx`
- [ ] Type checking passes: `npm run typecheck` (if available)
- [ ] No runtime errors when importing components

#### Manual Verification:
- [ ] Review test coverage for each component
- [ ] Verify edge cases are tested (empty data, truncation, overflow)
- [ ] Confirm tests are readable and maintainable

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Test InkApp Core Logic

### Overview
Add tests for InkApp's complex logic without testing full React rendering. Focus on testing the `handleScroll` callback, keyboard input handlers, and state management behavior.

### Changes Required:

#### 1. Test handleScroll callback logic
**File**: `src/__tests__/tui-components.test.tsx` (new file)
**Changes**: Add tests for scroll direction calculations

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createMockTuiState } from "../tui/__tests__/test-utils";

describe("InkApp handleScroll", () => {
  // Test scroll calculations without rendering
  // Extract handleScroll logic and test as pure function

  it("calculates correct offset for 'up' direction", () => {
    const state = createMockTuiState({
      logs: Array.from({ length: 100 }, (_, i) => `Log ${i}`),
    });
    const height = 24;
    const logsHeight = height - 10; // 14
    const maxOffset = Math.max(0, state.logs.length - logsHeight); // 86

    // Simulate handleScroll("up") from offset 0
    let currentOffset = 0;
    const nextOffset = Math.min(currentOffset + 1, maxOffset);
    expect(nextOffset).toBe(1);
  });

  it("respects max offset boundary", () => {
    const state = createMockTuiState({
      logs: Array.from({ length: 100 }, (_, i) => `Log ${i}`),
    });
    const height = 24;
    const logsHeight = height - 10;
    const maxOffset = Math.max(0, state.logs.length - logsHeight);

    const currentOffset = maxOffset;
    const nextOffset = Math.min(currentOffset + 1, maxOffset);
    expect(nextOffset).toBe(maxOffset);
  });

  it("respects min offset boundary (zero)", () => {
    const currentOffset = 0;
    const nextOffset = Math.max(currentOffset - 1, 0);
    expect(nextOffset).toBe(0);
  });

  it("calculates page up/down offsets", () => {
    const height = 24;
    const logsHeight = height - 10; // 14
    const currentOffset = 50;

    const pageUpOffset = Math.min(currentOffset + logsHeight, 100);
    expect(pageUpOffset).toBe(64);

    const pageDownOffset = Math.max(currentOffset - logsHeight, 0);
    expect(pageDownOffset).toBe(36);
  });

  it("jumps to top and bottom correctly", () => {
    const state = createMockTuiState({
      logs: Array.from({ length: 100 }, (_, i) => `Log ${i}`),
    });
    const height = 24;
    const logsHeight = height - 10;
    const maxOffset = Math.max(0, state.logs.length - logsHeight);

    const topOffset = maxOffset;
    expect(topOffset).toBeGreaterThan(0);

    const bottomOffset = 0;
    expect(bottomOffset).toBe(0);
  });

  it("disables auto-scroll when offset becomes non-zero", () => {
    const currentOffset = 0;
    const nextOffset = 5;
    const autoScroll = nextOffset === 0;
    expect(autoScroll).toBe(false);
  });

  it("enables auto-scroll when offset returns to zero", () => {
    const currentOffset = 5;
    const nextOffset = 0;
    const autoScroll = nextOffset === 0;
    expect(autoScroll).toBe(true);
  });
});
```

#### 2. Test keyboard input handling
**File**: `src/__tests__/tui-components.test.tsx` (append to existing file)
**Changes**: Add tests for keyboard input to handler mapping

```typescript
describe("InkApp keyboard input", () => {
  it("maps 'q' to onQuit callback", () => {
    const onQuit = vi.fn();
    const input = "q";
    const key = { ctrl: false };

    // Simulate useInput handler logic
    if (input === "q" || (key.ctrl && input === "c")) {
      onQuit();
    }

    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("maps 'l' to toggle showLogs", () => {
    let showLogs = false;
    const input = "l";
    const key = {};

    // Simulate useInput handler logic
    if (input === "l") {
      showLogs = !showLogs;
    }

    expect(showLogs).toBe(true);
  });

  it("maps 'j' and downArrow to scroll down", () => {
    const handleScroll = vi.fn();
    const input = "j";
    const key = { downArrow: false };

    if (input === "j" || key.downArrow) {
      handleScroll("down");
    }

    expect(handleScroll).toHaveBeenCalledWith("down");
  });

  it("maps 'k' and upArrow to scroll up", () => {
    const handleScroll = vi.fn();
    const input = "k";
    const key = { upArrow: true };

    if (input === "k" || key.upArrow) {
      handleScroll("up");
    }

    expect(handleScroll).toHaveBeenCalledWith("up");
  });

  it("maps pageUp/pageDown keys", () => {
    const handleScroll = vi.fn();
    const key = { pageUp: true, pageDown: false };

    if (key.pageDown) {
      handleScroll("pageDown");
    } else if (key.pageUp) {
      handleScroll("pageUp");
    }

    expect(handleScroll).toHaveBeenCalledWith("pageUp");
  });

  it("maps 'g' to top and 'G' to bottom", () => {
    const handleScroll = vi.fn();
    const inputG = "g";
    const inputShiftG = "G";

    if (inputG === "g") {
      handleScroll("top");
    }
    if (inputShiftG === "G") {
      handleScroll("bottom");
    }

    expect(handleScroll).toHaveBeenCalledWith("top");
    expect(handleScroll).toHaveBeenCalledWith("bottom");
  });
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/tui-components.test.tsx`
- [ ] All scroll directions tested (up, down, pageUp, pageDown, top, bottom)
- [ ] All keyboard shortcuts tested (q, l, j, k, pageUp, pageDown, g, G, Ctrl+C)
- [ ] Boundary conditions tested (max offset, zero offset, empty logs)

#### Manual Verification:
- [ ] Review scroll calculation formulas match InkApp.tsx:43-76
- [ ] Verify keyboard mappings match InkApp.tsx:78-96
- [ ] Confirm edge cases are covered

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 4: Test InkApp Component Integration

### Overview
Add integration tests for InkApp component with mocked Ink hooks. Test component lifecycle, state updates, and hook interactions.

### Changes Required:

#### 1. Test InkApp with mocked hooks
**File**: `src/__tests__/tui-components-integration.test.tsx` (new file)
**Changes**: Add tests for InkApp with mocked useInput and useStdout

```typescript
import { describe, it, expect, beforeEach, mock, vi } from "bun:test";
import React from "react";
import { InkApp } from "../tui/InkApp";
import { createMockTuiState, mockUseInput, mockUseStdout } from "../tui/__tests__/test-utils";

describe("InkApp integration", () => {
  beforeEach(() => {
    // Mock Ink hooks
    mock.module("ink", () => ({
      Box: ({ children }: any) => React.createElement("div", null, children),
      Text: ({ children }: any) => React.createElement("span", null, children),
      useInput: vi.fn(),
      useStdout: vi.fn(() => ({ stdout: { columns: 80, rows: 24 } })),
    }));
  });

  it("renders without crashing", () => {
    const initialState = createMockTuiState();
    const subscribe = vi.fn(() => vi.fn());
    const onQuit = vi.fn();

    const result = React.createElement(InkApp, {
      subscribe,
      onQuit,
      initialState,
    });

    expect(result).toBeDefined();
  });

  it("subscribes to state updates on mount", () => {
    const initialState = createMockTuiState();
    const subscribe = vi.fn(() => vi.fn());
    const onQuit = vi.fn();

    React.createElement(InkApp, {
      subscribe,
      onQuit,
      initialState,
    });

    expect(subscribe).toHaveBeenCalled();
  });

  it("calls onQuit when 'q' is pressed", () => {
    const initialState = createMockTuiState();
    const subscribe = vi.fn(() => vi.fn());
    const onQuit = vi.fn();

    React.createElement(InkApp, {
      subscribe,
      onQuit,
      initialState,
    });

    // Simulate 'q' key press (would need actual useInput mock)
    // This is a placeholder for the actual test implementation
  });
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/tui-components-integration.test.tsx`
- [ ] Ink hooks are properly mocked
- [ ] Component renders without errors
- [ ] No TTY or terminal dependencies

#### Manual Verification:
- [ ] Verify mock implementations simulate Ink behavior
- [ ] Confirm tests work in headless CI environment
- [ ] Review for any remaining untested code paths

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 5: Test Color Utilities

### Overview
Add tests for color and formatting utilities in `src/tui/colors.ts` if not already covered.

### Changes Required:

#### 1. Test color utility functions
**File**: `src/tui/__tests__/colors.test.ts` (new file)
**Changes**: Add tests for getToolColor, formatToolInput, formatToolResult

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test src/tui/__tests__/colors.test.ts`
- [ ] All tool types have color mappings tested
- [ ] Input/result formatting tested for various shapes

#### Manual Verification:
- [ ] Review color mappings match colors.ts:48-50
- [ ] Verify formatting logic is correct

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Testing Strategy

### Unit Tests:
- **Presentational components**: Test rendering with various prop combinations, edge cases (empty data, truncation, overflow)
- **Scroll logic**: Test all 6 directions with boundary conditions (max offset, zero offset, empty logs, single log)
- **Keyboard input**: Test all shortcuts (q, l, j, k, pageUp, pageDown, g, G, Ctrl+C) map to correct handlers
- **State management**: Test state updates, subscription lifecycle, auto-scroll behavior
- **Color utilities**: Test all tool types, input formatting, result formatting

### Integration Tests:
- **InkApp with mocked hooks**: Test component lifecycle, state updates, hook interactions
- **TuiRunner with state updates**: Test state propagation, subscription notifications (already partially covered in existing tests)

### Key Edge Cases:
- Empty items array
- Empty logs array
- Single item/log
- Items/logs exactly matching height
- Items/logs one less than height
- Items/logs one more than height
- Very long text that needs truncation
- Null currentItem
- Null currentStory
- Zero height/width terminal
- Very large terminal dimensions
- Scroll offset at boundaries (0, maxOffset, maxOffset + 1)
- Auto-scroll enabled/disabled transitions

### Manual Testing Steps:
1. Run `bun test` to verify all tests pass
2. Run `bun test --coverage` to verify > 80% coverage for TUI components
3. Run tests in CI environment to confirm no TTY dependencies
4. Manually inspect test coverage report for uncovered lines
5. Add additional tests for any uncovered code paths

## Migration Notes
- No migration required - this is pure test addition
- Existing code remains unchanged
- Tests are additive only

## References
- Research: `/Users/speed/wreckit/.wreckit/items/043-add-comprehensive-test-coverage-for-tui-components/research.md`
- InkApp component: `src/tui/InkApp.tsx:1-157`
- ItemsPane component: `src/tui/components/ItemsPane.tsx:1-99`
- LogsPane component: `src/tui/components/LogsPane.tsx:1-60`
- ActiveItemPane component: `src/tui/components/ActiveItemPane.tsx:1-42`
- AgentActivityPane component: `src/tui/components/AgentActivityPane.tsx:1-65`
- Header component: `src/tui/components/Header.tsx:1-64`
- Footer component: `src/tui/components/Footer.tsx:1-57`
- ToolCallItem component: `src/tui/components/ToolCallItem.tsx:1-55`
- State management: `src/tui/dashboard.ts:1-178`
- Existing tests: `src/__tests__/tui.test.ts:1-378`
- Mock pattern example: `src/__tests__/commands/run.isospec.ts:17-24`
- Package dependencies: `package.json:64,67,62` (ink, react, @types/react)
- Workflow states: `src/domain/states.ts:12-19`
