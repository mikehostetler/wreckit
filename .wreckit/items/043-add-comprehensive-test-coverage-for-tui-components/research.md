# Research: Add comprehensive test coverage for TUI components

**Date**: 2025-01-20
**Item**: 043-add-comprehensive-test-coverage-for-tui-components

## Research Question
TUI components handle complex state and user interactions but lack unit tests, making refactoring risky and bugs likely to go undetected.

**Motivation:** TUI bugs are particularly disruptive because they affect the user interface directly. Without tests, changes to scroll handling, state updates, or keyboard input handling can introduce subtle bugs.

**Success criteria:**
- Unit tests for InkApp component state management
- Tests for scroll offset calculation and auto-scroll
- Tests for keyboard input handling (q, l, j, k, etc.)
- Tests for all pane components (ItemsPane, LogsPane, etc.)
- Coverage > 80% for TUI components

**Technical constraints:**
- Testing Ink components requires specific test utilities
- Need to mock useInput, useStdout hooks
- Tests must work in CI (headless environment)
- Cannot add heavy UI testing dependencies

**In scope:**
- Add unit tests for InkApp.tsx state and hooks
- Add tests for scroll logic in handleScroll callback
- Add tests for keyboard input handlers
- Add tests for pane rendering and props
**Out of scope:**
- End-to-end TUI testing with terminal emulation
- Visual regression testing
- Performance testing for large logs

**Signals:** priority: medium

## Summary

The TUI (Terminal User Interface) components in wreckit are built using **Ink** (React for CLI), which provides a React-based approach to building terminal interfaces. The current test suite (`src/__tests__/tui.test.ts`) only tests the utility functions and state management logic, but **does not test any of the React components** themselves. This creates a significant gap in test coverage for the interactive UI components.

The TUI consists of:
1. **Main component**: `InkApp.tsx` - The root component managing state, subscriptions, keyboard input, and scroll behavior
2. **Pane components**: 7 presentational components (`ItemsPane`, `LogsPane`, `ActiveItemPane`, `AgentActivityPane`, `Header`, `Footer`, `ToolCallItem`)
3. **State management**: `dashboard.ts` with `TuiState` interface and state creation/update functions
4. **Runner**: `TuiRunner` class that manages the Ink render instance and lifecycle

To achieve >80% coverage, we need to test:
- React component rendering and prop handling
- State updates and reactivity
- Keyboard input handling with mocked `useInput` hook
- Scroll calculations and boundary conditions
- Edge cases (empty data, truncation, overflow)

The testing approach must use **Bun's built-in test runner** (not Jest/Vitest) and work in headless CI environments. Testing Ink components requires mocking the Ink-specific hooks (`useInput`, `useStdout`) since they interact with terminal streams.

## Current State Analysis

### Existing Implementation

**Current test coverage:**
- `src/__tests__/tui.test.ts` (378 lines) - Tests utility functions only:
  - `createTuiState`, `updateTuiState` - State creation and updates
  - `renderDashboard` - String-based dashboard rendering (NOT the React component)
  - `formatRuntime` - Time formatting utility
  - `getStateIcon` - Icon mapping for states
  - `padToWidth` - String padding/truncation
  - `TuiRunner` class methods (state updates, subscriptions, logging)
  - `createSimpleProgress` - Logger-based progress tracker

**What's NOT tested:**
- All React components (`InkApp.tsx` and all 7 pane components in `src/tui/components/`)
- `handleScroll` callback logic in InkApp
- Keyboard input handling (`useInput` hook usage)
- React hooks (`useState`, `useEffect`, `useCallback`, `useStdout`)
- Component prop passing and rendering
- Scroll offset calculations with real terminal dimensions
- Auto-scroll behavior when new logs arrive

**Current patterns and conventions:**
- Uses **Bun test runner** with `bun:test` module
- Test structure: `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `mock`, `spyOn`, `vi`
- Mock pattern: `mock.module()` for module-level mocking (see `src/__tests__/commands/run.isospec.ts`)
- Logger mocking: `createMockLogger()` helper returning an object with `vi.fn()` spies
- Test file naming: `*.test.ts` for unit tests, `*.integration.test.ts` for integration tests
- Test preload: `src/__tests__/test-preload.ts` runs before all tests to reset mocks

### Key Files

#### TUI Core Files
- `src/tui/InkApp.tsx:1-157` - **Main component requiring tests**
  - State: `state`, `showLogs`, `scrollOffset`, `autoScroll` (lines 17-20)
  - Subscribes to state updates via `subscribe` callback (lines 26-34)
  - **handleScroll callback** (lines 43-76) - Complex scroll logic with 6 directions
  - **Keyboard input handling** (lines 78-96) - Handles q, l, j, k, pageUp, pageDown, g, G, Ctrl+C
  - Dynamic layout calculations based on terminal size (lines 98-103)

- `src/tui/dashboard.ts:1-178` - State management (partially tested)
  - `TuiState` interface (lines 18-36)
  - `createTuiState` factory (lines 38-60)
  - `updateTuiState` updater (lines 62-67)
  - `AgentActivityForItem` and `ToolExecution` types (lines 3-16)

- `src/tui/runner.ts:1-234` - TuiRunner class (partially tested)
  - Renders InkApp with React.createElement (line 84-89, 96-101)
  - Manages Ink instance lifecycle (lines 56-104, 111-124)
  - `appendAgentEvent` method with complex event handling (lines 140-211)

#### Pane Components (All **UNTESTED**)
- `src/tui/components/ItemsPane.tsx:1-99` - Item list with auto-scroll
  - Auto-scroll calculation to keep active item visible (lines 27-34)
  - Truncation logic in `truncate` helper (lines 86-91)
  - Empty state handling (lines 19-25)

- `src/tui/components/LogsPane.tsx:1-60` - Log viewer with scroll
  - Scroll offset calculation (line 28)
  - Visible window slicing (lines 29-31)
  - Position indicators (▲▼) based on scroll state (lines 33-34)

- `src/tui/components/ActiveItemPane.tsx:1-42` - Active item display
  - Null handling for `currentItem` (lines 14-20)
  - Workflow state rendering (lines 26-28)

- `src/tui/components/AgentActivityPane.tsx:1-65` - Tool execution display
  - Activity lookup by itemId (lines 24-30)
  - Dynamic height allocation for tools vs thoughts (lines 33-37)
  - Slice of recent tools/thoughts (lines 36-37)

- `src/tui/components/Header.tsx:1-64` - Dashboard header
  - Dynamic border drawing with width calculation
  - Text truncation in `truncate` helper (lines 58-63)

- `src/tui/components/Footer.tsx:1-57` - Progress footer
  - Progress bar calculation (lines 27-29)
  - Dynamic width calculations (line 27)

- `src/tui/components/ToolCallItem.tsx:1-55` - Individual tool display
  - Status-based rendering (running vs completed/error) (lines 17-40 vs 42-53)
  - Input/result formatting (lines 15, 23-25)

- `src/tui/components/index.ts:1-8` - Component barrel exports

#### Supporting Files
- `src/tui/colors.ts:1-152` - Color and formatting utilities
  - `getToolColor`, `formatToolInput`, `formatToolResult` helpers
  - Path shortening and truncation utilities

- `src/tui/agentEvents.ts:1-8` - Agent event type definitions
  - Union type for all agent event types

- `src/domain/states.ts:1-59` - Workflow state constants
  - `WORKFLOW_STATES` array (lines 12-19) - Used in ActiveItemPane

- `src/schemas.ts:269` - `IndexItem` type definition
  - Used in TUI state and ItemsPane

### Integration Points
- **Ink library**: `import { render, Box, Text, useInput, useStdout } from "ink"` (package.json:64)
- **React**: `import React, { useState, useEffect, useCallback } from "react"` (package.json:67)
- **TypeScript**: JSX enabled with `"jsx": "react-jsx"` in tsconfig.json:13
- **Test runner**: Bun's built-in test (package.json:30)

## Technical Considerations

### Dependencies
**External (already installed):**
- `ink@^6.6.0` - React for CLI (package.json:64)
- `react@^19.2.3` - React runtime (package.json:67)
- `@types/react@^19.2.8` - React type definitions (package.json:62)

**Potential testing dependencies to add:**
- **No new dependencies required** - Can test with existing Bun test utilities
- Consider `@testing-library/react` if component testing becomes complex (currently out of scope per constraints)
- Ink doesn't provide official testing utilities, so we'll mock hooks directly

### Patterns to Follow

**From existing tests:**
1. **Mock pattern from `run.isospec.ts`:**
   ```typescript
   mock.module("../../workflow", () => ({
     runPhaseResearch: mockedFunction,
     getNextPhase: originalFunction,
   }));
   ```

2. **Logger mock pattern from `show.test.ts`:**
   ```typescript
   function createMockLogger() {
     return {
       debug: vi.fn(),
       info: vi.fn(),
       warn: vi.fn(),
       error: vi.fn(),
       json: vi.fn(),
     } satisfies Logger;
   }
   ```

3. **Test structure from `tui.test.ts`:**
   ```typescript
   describe("ComponentName", () => {
     beforeEach(() => {
       // Setup
     });
     afterEach(() => {
       // Cleanup
     });
     it("should do something", () => {
       // Arrange, Act, Assert
     });
   });
   ```

**Testing approach for Ink components:**
1. **Mock Ink hooks**: Since Ink's `useInput` and `useStdout` interact with terminal streams, we must mock them
2. **Test component logic without rendering**: Focus on testing the logic, not the visual output
3. **Test callback functions directly**: Test `handleScroll`, input handlers as pure functions where possible
4. **Use React.renderToString or similar**: If visual testing is needed, render to string and verify output
5. **Mock React hooks**: For state updates, test that state changes correctly with given inputs

**File naming conventions:**
- Unit tests: `*.test.ts` or `*.test.tsx` (for React components)
- Place tests alongside components: `src/tui/components/*.test.tsx` or in `src/__tests__/tui-components/*.test.tsx`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Ink hooks are hard to mock** | High | Create custom mock implementations of `useInput` and `useStdout` that simulate terminal behavior; test logic without full rendering |
| **Tests may not catch visual regressions** | Medium | Focus on testing logic and state changes rather than visual output; visual regression testing is out of scope |
| **CI environment lacks TTY** | Low | Tests will mock terminal interaction, so no TTY required; ensure mocks don't depend on real terminal |
| **Complex scroll logic edge cases** | Medium | Comprehensive test coverage of scroll boundaries (maxOffset, negative values, empty logs, etc.) |
| **React component testing in Bun is different from Jest** | Low | Use Bun's built-in test runner; avoid Jest-specific APIs; use `vi.fn()` for mocks (compatible with Bun) |
| **State updates in useEffect are hard to test** | Medium | Test state update functions directly; use fake timers for timing-related code; test subscription callback behavior |
| **Performance tests are out of scope** | Low | Focus on correctness, not performance; large log handling tests can verify correctness without timing constraints |

## Recommended Approach

### Phase 1: Test Infrastructure Setup
1. **Create test utilities file**: `src/tui/__tests__/test-utils.ts`
   - `createMockTuiState()` - Factory for test TuiState objects
   - `createMockStdout()` - Mock for useStdout hook with configurable dimensions
   - `mockUseInput()` - Helper to mock useInput and simulate keyboard input
   - Test data factories for items, logs, agent events

2. **Extend `src/__tests__/tui.test.ts`** or create new `src/__tests__/tui-components.test.tsx`
   - Import React component test utilities if needed
   - Set up consistent test patterns

### Phase 2: Core Logic Testing (State Management)
3. **Test InkApp state management** (new tests):
   - State initialization from props
   - Subscription lifecycle (subscribe/unsubscribe)
   - State updates from subscription callback
   - Auto-scroll behavior when logs arrive
   - Timer effect that forces re-renders

4. **Test handleScroll callback** (new tests):
   - Each direction: up, down, pageUp, pageDown, top, bottom
   - Boundary conditions: max offset, zero offset, empty logs
   - Auto-scroll disable on non-zero offset
   - Interaction with height calculations

### Phase 3: Keyboard Input Testing
5. **Test keyboard input handlers** (new tests):
   - Mock `useInput` to invoke callbacks
   - Test each key: q, l, j, k, pageUp, pageDown, g, G, Ctrl+C
   - Verify `onQuit` is called for q/Ctrl+C
   - Verify `setShowLogs` toggle for l
   - Verify `handleScroll` calls for scroll keys
   - Test multiple key combinations

### Phase 4: Pane Component Testing
6. **Test ItemsPane** (new tests):
   - Rendering with empty items array
   - Rendering with items list
   - Auto-scroll calculation to center active item
   - Active item highlighting (yellow + bold)
   - State-based coloring (green for done, yellow for active)
   - Scroll indicators (↑ more above / ↓ more below)
   - Text truncation for long IDs/titles
   - Story ID display when present

7. **Test LogsPane** (new tests):
   - Rendering with empty logs
   - Rendering with log entries
   - Scroll offset calculation
   - Visible window slicing (startIdx, endIdx)
   - Position indicators (▲▼) based on scroll position
   - Truncation of long log lines

8. **Test ActiveItemPane** (new tests):
   - Rendering when currentItem is null
   - Rendering with active item
   - Workflow state display with brackets around active state
   - Iteration counter display (current/max)

9. **Test AgentActivityPane** (new tests):
   - Rendering when no itemId
   - Rendering when no activity for item
   - Dynamic height allocation between tools and thoughts
   - Recent tools/thoughts slicing
   - ToolCallItem rendering delegation

10. **Test Header** (new tests):
    - Border rendering with dynamic width
    - Current item text (Running vs Waiting)
    - Phase text with iteration count
    - Story text with ID and title
    - Text truncation in header fields

11. **Test Footer** (new tests):
    - Progress bar calculation and rendering (█ vs ░)
    - Progress percentage calculation
    - Runtime formatting via `formatRuntime`
    - Keyboard shortcuts display (toggles based on showLogs)

12. **Test ToolCallItem** (new tests):
    - Rendering running tools (▶ icon)
    - Rendering completed tools (✓ icon with optional result)
    - Rendering error tools (✗ icon)
    - Input truncation for long inputs
    - Result formatting when showResult=true

### Phase 5: Integration Testing
13. **Test TuiRunner with InkApp integration**:
    - Start/stop lifecycle
    - State update propagation
    - AppendAgentEvent with all event types
    - Subscription notifications

14. **Test color utilities** (if not already covered):
    - `getToolColor` for all tool types
    - `formatToolInput` for various input shapes
    - `formatToolResult` for different tool types

### Test Organization
```
src/__tests__/
├── tui.test.ts (existing - keep as is)
├── tui-components.test.tsx (new - InkApp tests)
├── tui-components/
│   ├── ItemsPane.test.tsx (new)
│   ├── LogsPane.test.tsx (new)
│   ├── ActiveItemPane.test.tsx (new)
│   ├── AgentActivityPane.test.tsx (new)
│   ├── Header.test.tsx (new)
│   ├── Footer.test.tsx (new)
│   └── ToolCallItem.test.tsx (new)
└── tui/
    ├── test-utils.tsx (new - test utilities)
    └── colors.test.ts (new - if needed)
```

### Coverage Strategy
- Aim for **100% coverage** of utility functions
- Aim for **>80% coverage** of components (exclude unreachable error branches)
- Focus on **logic coverage** over visual rendering
- Test **happy paths** and **edge cases** for each component
- Use **parameterized tests** for similar test cases (e.g., all scroll directions)

## Open Questions

1. **Should we test React component rendering visually?**
   - Decision: No, out of scope. Focus on logic and state changes. Visual regression testing is explicitly out of scope.

2. **Can we use `@testing-library/react` with Bun?**
   - Research needed: Bun test may not be fully compatible with React Testing Library. Start without it, add only if necessary.
   - Alternative: Test component logic directly by calling component functions and verifying state updates.

3. **How to mock `useInput` effectively?**
   - Approach: Create a mock implementation that accepts a callback and allows tests to invoke it with simulated input.
   - Pattern: `mock.module("ink", { useInput: (cb) => { /* store cb for test invocation */ } })`

4. **Should we test the actual string output of components?**
   - Decision: Partially. Test text content and structure where meaningful, but don't test exact ANSI codes or visual formatting.
   - Focus on: Data flow, conditional rendering, prop passing, state updates.

5. **How to handle the 1-second timer in InkApp?**
   - Approach: Use `vi.useFakeTimers()` if available in Bun, or test the effect logic separately.
   - Alternative: Mock `setInterval` to avoid waiting in tests.

6. **Test file structure: co-located vs centralized?**
   - Decision: Keep tests centralized in `src/__tests__/` to match existing pattern, but organize by component.
   - Alternative: Co-locate tests next to components (e.g., `src/tui/components/__tests__/`) - may be cleaner.

7. **Should we test TuiRunner's Ink instance lifecycle?**
   - Decision: Yes, but mock the actual `render` function from Ink to avoid terminal output.
   - Focus on: State management, subscription handling, start/stop behavior.

## References
- Ink documentation: https://github.com/vadimdemedes/ink
- Bun test documentation: https://bun.sh/docs/test
- React testing patterns: https://react.dev/learn/testing-recipes
- Existing test patterns in wreckit: `src/__tests__/tui.test.ts`, `src/__tests__/commands/run.isospec.ts`
