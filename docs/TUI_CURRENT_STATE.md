# TUI Current State Analysis

> A comprehensive analysis of the wreckit Terminal User Interface for redesign purposes.

## Table of Contents

1. [Purpose and Modes](#1-purpose-and-modes)
2. [Module Map](#2-module-map)
3. [Data Model](#3-data-model)
4. [Event Flow](#4-event-flow)
5. [Component Hierarchy](#5-component-hierarchy)
6. [Layout System](#6-layout-system)
7. [Styling System](#7-styling-system)
8. [Input Handling](#8-input-handling)
9. [Debug Mode](#9-debug-mode)
10. [Known Limitations and Tech Debt](#10-known-limitations-and-tech-debt)

---

## 1. Purpose and Modes

The wreckit TUI provides real-time visualization of autonomous agent workflows. It shows:

- **Roadmap items** in various workflow states (idea → researched → planned → implementing → critique → in_pr → done)
- **Agent activity** including tool calls and "thoughts" (assistant reasoning)
- **Progress tracking** with runtime and completion counts
- **Raw logs** from agent execution

### Two Rendering Modes

| Mode | Implementation | Use Case |
|------|----------------|----------|
| **Ink (Interactive)** | React-based via `ink` library | Default interactive terminal UI |
| **Fallback (String)** | Pure function `renderDashboard()` | Non-interactive / CI / debug output |

---

## 2. Module Map

```
src/tui/
├── index.ts              # Public exports
├── InkApp.tsx            # Main Ink/React component
├── runner.ts             # TuiRunner - state management & Ink lifecycle
├── dashboard.ts          # TuiState type, createTuiState, updateTuiState, renderDashboard
├── agentEvents.ts        # AgentEvent type definitions
├── colors.ts             # Tool colors, icons, path/input/result formatting
└── components/
    ├── index.ts          # Component re-exports
    ├── Header.tsx        # Top border + status info
    ├── Footer.tsx        # Bottom border + progress + key hints
    ├── ItemsPane.tsx     # Left pane: roadmap items list
    ├── ActiveItemPane.tsx    # Right pane top: active item + workflow rail
    ├── AgentActivityPane.tsx # Right pane bottom: tool calls + thoughts
    ├── LogsPane.tsx      # Full-width logs view (toggled)
    └── ToolCallItem.tsx  # Individual tool execution render

src/views/
└── TuiViewAdapter.ts     # ViewAdapter implementation → TuiRunner bridge
```

### File Responsibilities

| File | Responsibility |
|------|----------------|
| `InkApp.tsx` | Main React component, terminal dimensions, keyboard input, layout decisions |
| `runner.ts` | `TuiRunner` class - owns `TuiState`, pub/sub, log/event appenders, Ink lifecycle |
| `dashboard.ts` | State types, state factory, shallow merge update, fallback string renderer |
| `agentEvents.ts` | `AgentEvent` union type (assistant_text, tool_started, tool_result, etc.) |
| `colors.ts` | Color/icon mappings for tools, path shortening, input/result summarization |
| `TuiViewAdapter.ts` | Implements `ViewAdapter` interface, translates domain events to TUI updates |

---

## 3. Data Model

### TuiState (Primary State Object)

```typescript
interface TuiState {
  // Active execution context
  currentItem: string | null;
  currentPhase: string | null;
  currentIteration: number;
  maxIterations: number;
  currentStory: { id: string; title: string } | null;
  
  // Items list
  items: Array<{
    id: string;
    state: string;
    title: string;
    currentStoryId?: string;
  }>;
  
  // Progress tracking
  completedCount: number;
  totalCount: number;
  startTime: Date;
  
  // Output
  logs: string[];
  showLogs: boolean;  // NOTE: Used by fallback renderer only
  
  // Agent activity per item
  activityByItem: Record<string, AgentActivityForItem>;
}
```

### AgentActivityForItem

```typescript
interface AgentActivityForItem {
  thoughts: string[];  // Cleaned assistant text, max 50 entries
  tools: ToolExecution[];  // Recent tool executions, max 20 entries
}
```

### ToolExecution

```typescript
interface ToolExecution {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: "running" | "completed" | "error";
  result?: unknown;
  startedAt: Date;
  finishedAt?: Date;
}
```

### AgentEvent (Inbound Events)

```typescript
type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_started"; toolUseId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; result: unknown }
  | { type: "tool_error"; toolUseId: string; error: string }
  | { type: "run_result"; subtype?: string }
  | { type: "error"; message: string };
```

---

## 4. Event Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Domain Layer                                    │
│  (Workflow engine emits item changes, phase changes, agent events)          │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TuiViewAdapter                                       │
│  Implements ViewAdapter interface                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Methods:                                                                    │
│    onItemsChanged(items)        → runner.update({items, counts})            │
│    onActiveItemChanged(id)      → runner.update({currentItem})              │
│    onPhaseChanged(phase)        → runner.update({currentPhase})             │
│    onIterationChanged(n, max)   → runner.update({currentIteration, max})    │
│    onStoryChanged(story)        → runner.update({currentStory})             │
│    onAgentEvent(itemId, event)  → runner.appendAgentEvent(itemId, event)    │
│    onRunComplete(id, ok, err?)  → appends error event if failed             │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TuiRunner                                         │
│  Owns TuiState, manages subscriptions                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  State mutation:                                                             │
│    update(partial)              → shallow merge, notify subscribers          │
│    appendLog(chunk)             → parse lines, append to logs (max 500)      │
│    appendAgentEvent(id, event)  → update activityByItem[id]                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Ink lifecycle:                                                              │
│    start()                      → render InkApp with subscribe callback      │
│    stop()                       → unmount Ink, clear subscribers             │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   │ subscribe(callback)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              InkApp                                          │
│  React component subscribes to TuiRunner                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Local state:                                                                │
│    state         ← TuiState (from subscription)                              │
│    showLogs      ← boolean (toggle items vs logs view)                       │
│    scrollOffset  ← number (logs scroll position)                             │
│    autoScroll    ← boolean (follow new logs)                                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Renders panes based on state                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AgentEvent Processing Details

| Event Type | Processing |
|------------|------------|
| `assistant_text` | Sanitize (remove code blocks, collapse whitespace, skip "tool:" lines), join with previous thought if <120 chars, cap at 50 |
| `tool_started` | Create ToolExecution with status "running", cap at 20 tools |
| `tool_result` | Find by toolUseId, mark "completed", attach result and finishedAt |
| `tool_error` | Find by toolUseId, mark "error", attach finishedAt |
| `error` | Append "[ERROR] message" to thoughts |
| `run_result` | No-op (ignored) |

---

## 5. Component Hierarchy

### Items Mode (Default View)

```
InkApp
└─ Box (flexDirection="column", full width/height)
   ├─ Header
   │     Shows: "┌─ Wreckit ─...─┐", Running item, Phase, Story
   │     Height: ~5 lines
   │
   ├─ Main Area (height = mainHeight)
   │  ├─ Left Column (width = 40%)
   │  │  └─ ItemsPane
   │  │       Shows: Scrollable list of items with state icons
   │  │       Auto-scrolls to keep active item visible
   │  │
   │  └─ Right Column (width = remaining, border-left)
   │     ├─ ActiveItemPane (fixed height = 4)
   │     │     Shows: "Active: <id> - <title>"
   │     │            "Phase: <phase> (iter/max)"
   │     │            Workflow rail: "idea → [researched] → planned → ..."
   │     │
   │     └─ AgentActivityPane (height = mainHeight - 4)
   │           Shows: "─── Agent Activity ───"
   │                  Recent tool calls (ToolCallItem components)
   │                  "Thinking:" section with recent thoughts
   │
   └─ Footer
         Shows: Progress bar, completion count, runtime
                Key hints: "[q] quit  [l] logs  [j/k] scroll"
         Height: ~4 lines
```

### Logs Mode (Toggle with 'l')

```
InkApp
└─ Box (flexDirection="column")
   ├─ Header
   │
   ├─ Main Area (full width)
   │  └─ LogsPane
   │       Shows: "─── Agent Output ─── ▲ ▼"
   │              Scrollable log lines
   │
   └─ Footer
```

### Component Responsibilities

| Component | Props | Responsibility |
|-----------|-------|----------------|
| `Header` | state, width | Top border, running item, phase, story |
| `Footer` | state, width, showLogs | Bottom border, progress bar, key hints |
| `ItemsPane` | state, width, height | Items list with auto-scroll, state coloring |
| `ActiveItemPane` | state, width | Active item summary, workflow state rail |
| `AgentActivityPane` | state, width, height | Tool calls + thoughts for current item |
| `LogsPane` | logs, width, height, scrollOffset | Scrollable raw log output |
| `ToolCallItem` | tool, width, showResult? | Single tool execution with status/input/result |

---

## 6. Layout System

### Terminal Dimensions

```typescript
const { stdout } = useStdout();
const width = stdout?.columns ?? 80;
const height = stdout?.rows ?? 24;
```

### Vertical Layout (Fixed Constants)

```typescript
const headerHeight = 5;   // ⚠️ Magic number
const footerHeight = 4;   // ⚠️ Magic number
const mainHeight = Math.max(1, height - headerHeight - footerHeight);
```

### Horizontal Layout (Items Mode)

```typescript
const leftPaneWidth = Math.floor(width * 0.4);
const rightPaneWidth = width - leftPaneWidth - 3;  // ⚠️ -3 for border/padding
```

### Right Pane Internal Split

```typescript
// ActiveItemPane gets fixed 4 lines
<Box height={4}>
  <ActiveItemPane ... />
</Box>

// AgentActivityPane gets remainder
<Box height={mainHeight - 4}>
  <AgentActivityPane ... />
</Box>
```

### ItemsPane Auto-Scroll Logic

```typescript
const activeIndex = state.items.findIndex(item => item.id === state.currentItem);
const middleOffset = Math.floor(height / 2);
const scrollOffset = Math.max(0, Math.min(
  activeIndex - middleOffset,
  state.items.length - height
));
const visibleItems = state.items.slice(scrollOffset, scrollOffset + height);
```

### LogsPane Scroll Logic

- `scrollOffset` represents "lines above bottom" (0 = at bottom, following new logs)
- Scroll calculations in LogsPane:

```typescript
const effectiveOffset = Math.min(scrollOffset, Math.max(0, logs.length - height + 1));
const startIdx = Math.max(0, logs.length - height + 1 - effectiveOffset);
const visibleLogs = logs.slice(startIdx, startIdx + height - 1);  // -1 for header
```

### Magic Numbers Summary

| Number | Location | Purpose |
|--------|----------|---------|
| `5` | InkApp | Header height |
| `4` | InkApp | Footer height |
| `3` | InkApp | Right pane width subtraction (border/padding) |
| `4` | InkApp | ActiveItemPane fixed height |
| `10` | InkApp | Log height approximation (height - 10) |
| `0.4` | InkApp | Left pane width ratio |

---

## 7. Styling System

### Color Palette

| Element | Color | Style |
|---------|-------|-------|
| Borders/Frame | `cyan` | - |
| Active item | `yellow` | `bold` |
| Done items | `green` | - |
| Inactive items | default | - |
| Phase/Story/Labels | - | `dimColor` |
| Progress bar | `green` | - |
| Error text | `red` | - |

### Tool Colors (`TOOL_COLORS`)

```typescript
const TOOL_COLORS = {
  Read: "blue",
  Edit: "yellow",
  Write: "green",
  Bash: "magenta",
  Grep: "cyan",
  Glob: "cyan",
  Task: "magenta",
  Skill: "cyan",
  AskUserQuestion: "white",
  default: "gray"
};
```

### Tool Icons (`TOOL_ICONS`)

```typescript
const TOOL_ICONS = {
  Read: "",      // Empty
  Edit: "✏️",
  Write: "📝",
  Bash: "",      // Empty
  Grep: "🔍",
  Glob: "📁",
  Task: "🤖",
  Skill: "⚡",
  AskUserQuestion: "❓",
  default: "🔧"
};
```

**Note:** Tool icons are defined but NOT currently used in `ToolCallItem`. Only status icons are shown.

### Status Icons

```typescript
// In ToolCallItem
const statusIcon = tool.status === "running" ? "▶" 
                 : tool.status === "completed" ? "✓" 
                 : "✗";

// In getStateIcon (workflow states)
switch (state) {
  case "done": return "✓";
  case "implementing":
  case "in_pr": return "→";
  default: return "○";
}
```

### Path Shortening

```typescript
// CWD → "."
// Home dir → "~"
function shortenPath(p: string): string {
  if (p.startsWith(CWD)) return path.relative(CWD, p) || ".";
  if (p.startsWith(HOME_DIR)) return "~" + p.slice(HOME_DIR.length);
  return p;
}
```

### Tool Input Formatting (`formatToolInput`)

| Input Pattern | Format |
|---------------|--------|
| `file_path` or `path` | `📄 shortened/path` |
| `command` or `cmd` | `$ summarized command` |
| `pattern` | `🔍 pattern` |
| `prompt` | `💬 truncated prompt` |
| `description` | `📋 truncated description` |
| `url` | `🌐 truncated url` |
| `filePattern` | `📁 pattern` |
| fallback | JSON stringify, truncated |

### Tool Result Formatting (`formatToolResult`)

| Tool | Format |
|------|--------|
| Bash | First stdout line, paths shortened |
| Glob | First 3 paths, "(+N more)" if more |
| Read | "read path" |
| fallback | JSON stringify, truncated |

---

## 8. Input Handling

### Keyboard Bindings (InkApp)

| Key | Action |
|-----|--------|
| `q` | Quit (calls `onQuit()`) |
| `Ctrl+C` | Quit (calls `onQuit()`) |
| `l` | Toggle logs view |
| `j` / `↓` | Scroll down (toward bottom) |
| `k` / `↑` | Scroll up (away from bottom) |
| `PageDown` | Page scroll down |
| `PageUp` | Page scroll up |
| `g` | Jump to top (oldest logs) |
| `G` | Jump to bottom (newest, enables auto-scroll) |

### Scroll Behavior

```typescript
const handleScroll = useCallback((direction) => {
  const logsHeight = height - 10;  // ⚠️ Magic number
  const maxOffset = Math.max(0, state.logs.length - logsHeight);
  
  setScrollOffset(prev => {
    let next = prev;
    switch (direction) {
      case "up": next = Math.min(prev + 1, maxOffset); break;
      case "down": next = Math.max(prev - 1, 0); break;
      case "pageUp": next = Math.min(prev + logsHeight, maxOffset); break;
      case "pageDown": next = Math.max(prev - logsHeight, 0); break;
      case "top": next = maxOffset; break;
      case "bottom": next = 0; break;
    }
    setAutoScroll(next === 0);  // Re-enable auto-scroll when at bottom
    return next;
  });
}, [height, state.logs.length]);
```

### Missing Features

- No item selection/navigation
- No filtering or sorting
- No pane focus switching
- No search functionality
- Scroll keys work even in items view (no-op but not gated)

---

## 9. Debug Mode

### Frame Capture

When `debug: true` and `debugLogger` are provided to `TuiRunner`:

```typescript
if (debug && debugLogger) {
  this.debugStream = new PassThrough();
  
  this.debugStream.on("data", (chunk: Buffer) => {
    // Parse lines and log each as [TUI Frame N] ...
    this.frameCount++;
    debugLogger.debug(`[TUI Frame ${this.frameCount}] ${line}`);
  });
  
  this.inkInstance = render(InkApp, {
    stdout: this.debugStream,
    debug: true
  });
}
```

### Purpose

- Captures every Ink render frame as text
- Useful for debugging TUI rendering issues
- Logs to provided debugLogger with frame numbers

---

## 10. Known Limitations and Tech Debt

### State Management Issues

| Issue | Description | Impact |
|-------|-------------|--------|
| **Dual showLogs** | `TuiState.showLogs` exists for fallback renderer, but Ink uses `InkApp`'s local `showLogs` | Confusion, potential divergence |
| **Shallow merge only** | `updateTuiState` does `{...state, ...update}` | Nested structures (activityByItem) require manual handling |
| **Potential mutation** | `appendAgentEvent` may mutate activity object before cloning parent | Subtle render bugs possible |

### Layout Fragility

| Issue | Description |
|-------|-------------|
| **Magic numbers** | `5`, `4`, `3`, `10` hardcoded throughout layout calculations |
| **Height mismatch** | Panes draw their own headers; ItemsPane scroll indicators consume rows not fully accounted for |
| **Width padding** | Header/Footer compute spacing using original string lengths, not truncated lengths |

### Rendering Performance

| Issue | Description |
|-------|-------------|
| **Forced re-render** | `setInterval(() => setState(prev => ({ ...prev })), 1000)` every second for clock display |
| **No virtualization** | All visible items rendered; could be slow with many items |

### Feature Gaps

| Gap | Description |
|-----|-------------|
| **Single item focus** | Agent activity only shown for `currentItem`; can't inspect other items |
| **Heavy sanitization** | Thoughts have code blocks removed, "tool:" lines dropped; may hide useful context |
| **Limited result display** | Only last completed tool shows result (when `showResult=true`) |
| **No item selection** | Can't navigate/select items with keyboard |
| **No search** | Can't search logs or items |

### Code Quality

| Issue | Location | Description |
|-------|----------|-------------|
| Duplicate `truncate` | Multiple components | Same function defined in Header, ItemsPane, LogsPane |
| Duplicate `padToWidth` | dashboard.ts, ItemsPane | Same function defined twice |
| Unused exports | colors.ts | `TOOL_ICONS` and `getToolIcon` defined but unused |

---

## Appendix: Fallback Renderer

### Purpose

`renderDashboard(state: TuiState, width = 80): string` provides a non-interactive string-based dashboard for:
- CI environments
- Debug output
- Non-TTY contexts

### Sample Output

```
┌─ Wreckit ──────────────────────────────────────────────────────────────────┐
│ Running: features/001-auth                                                  │
│ Phase: implementing (iteration 5/100)                                       │
│ Story: US-001 - User login                                                  │
├────────────────────────────────────────────────────────────────────────────┤
│ ✓ foundation/001-core-types      done                                       │
│ → features/001-auth              implementing       [US-001]                │
│ ○ features/002-user-profile      idea                                       │
├────────────────────────────────────────────────────────────────────────────┤
│ Latest: [Edit] Updated auth.ts                                              │
├────────────────────────────────────────────────────────────────────────────┤
│ Progress: 1/3 complete | Runtime: 00:05:32                                  │
│ [q] quit  [l] logs                                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

### Limitations vs Ink Mode

- No real scrolling
- No terminal height awareness (renders all items)
- No agent activity/tool visualization
- Max 15 log lines in logs mode
- Relies on `state.showLogs` (not updated by Ink mode)

---

## Summary for Redesign

### Key Integration Point

The `ViewAdapter` interface is the clean seam between the domain layer and TUI. Any redesign should:
1. Preserve this interface
2. Replace internal TUI implementation as needed

### Priority Areas for Redesign

1. **State unification** - Single source of truth for all UI state
2. **Layout system** - Replace magic numbers with computed/configurable values
3. **Component isolation** - Reduce duplicate code, improve testability
4. **Feature additions** - Item selection, multi-item activity, search
5. **Performance** - Remove forced re-renders, consider virtualization
