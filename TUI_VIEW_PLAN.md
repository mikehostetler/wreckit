# TUI View Enhancement Plan

> Transform wreckit's terminal UI from a simple log viewer into a comprehensive workflow visualization and agent activity dashboard.

## Executive Summary

The current TUI shows items and raw agent output. This plan extends it to:
1. **Queue view** — all items with workflow state progression
2. **Active item pane** — current item with phase/iteration details and workflow pipeline visualization
3. **Agent activity pane** — structured tool calls, thinking, and file edits in real-time

**Key architectural decisions:**
- **ViewAdapter abstraction** — Decouple state/events from rendering to enable future web views
- **Structured events only** — Remove stdout/stderr chunk callbacks; SDK emits structured `AgentEvent`s
- **Stay with Ink** — TypeScript-native React paradigm, no external TUI libraries

---

## 1. Current Architecture Analysis

### 1.1 Claude SDK Integration (`src/agent/claude-sdk-runner.ts`)

**What exists:**
- Uses `for await (const message of query(prompt, sdkOptions))` to stream structured messages
- `formatSdkMessage()` flattens messages to text (discards structure)
- Pipes chunks via `onStdoutChunk` / `onStderrChunk` callbacks

**Limitation:** Rich message structure (tool IDs, inputs, results, timing) is discarded. TUI receives plain strings only.

### 1.2 TUI Architecture (`src/tui/`)

**What exists:**
- `TuiRunner` class with subscribe/notify pattern
- Ink-based React components: `InkApp`, `Header`, `ItemsPane`, `LogsPane`, `Footer`
- `ToolCallItem` component exists but is **not wired up**
- `TuiState` tracks:
  ```typescript
  {
    currentItem, currentPhase, currentIteration, maxIterations,
    items: [{ id, state, title }],
    logs: string[],  // raw output
    showLogs: boolean
  }
  ```

**Limitations:**
- No per-item activity tracking
- No structured tool execution visualization
- No workflow pipeline visualization
- `currentIteration` / `maxIterations` exist but aren't updated

### 1.3 Domain State Machine (`src/domain/states.ts`)

**Workflow states (linear progression):**
```
raw → researched → planned → implementing → in_pr → done
```

This deterministic state machine is the source of truth. TUI should reflect it accurately.

---

## 2. ViewAdapter Architecture

### 2.1 Design Goals

Separate **state/events** from **rendering** to enable:
- Current: Ink-based TUI
- Future: Web dashboard (WebSocket → browser)
- Future: JSON stream for CI/headless mode

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Runner                          │
│  (Claude SDK → structured AgentEvent stream)            │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │     ViewAdapter       │
              │     (interface)       │
              └───────────┬───────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ TuiView  │    │ WebView  │    │ JsonView │
   │  (Ink)   │    │ (Future) │    │ (Future) │
   └──────────┘    └──────────┘    └──────────┘
```

### 2.2 ViewAdapter Interface

Create `src/views/ViewAdapter.ts`:

```typescript
import type { AgentEvent } from "../tui/agentEvents";
import type { WorkflowState } from "../schemas";

/**
 * Abstraction for rendering wreckit state.
 * Implementations: TuiViewAdapter (Ink), future WebViewAdapter, JsonViewAdapter
 */
export interface ViewAdapter {
  /** Called when the item queue changes (new items, state updates) */
  onItemsChanged(items: ItemSnapshot[]): void;

  /** Called when a different item becomes active */
  onActiveItemChanged(itemId: string | null): void;

  /** Called when the active item's phase changes */
  onPhaseChanged(phase: WorkflowState | null): void;

  /** Called on each agent loop iteration */
  onIterationChanged(iteration: number, maxIterations: number): void;

  /** Called for each structured agent event (tool calls, thinking, results) */
  onAgentEvent(itemId: string, event: AgentEvent): void;

  /** Called when a run completes (success or failure) */
  onRunComplete(itemId: string, success: boolean, error?: string): void;

  /** Start the view (mount Ink, open WebSocket, etc.) */
  start(): void;

  /** Stop the view (unmount, close connections) */
  stop(): void;
}

export interface ItemSnapshot {
  id: string;
  title: string;
  state: WorkflowState;
  storyId?: string;
}
```

### 2.3 TuiViewAdapter Implementation

Create `src/views/TuiViewAdapter.ts`:

```typescript
import type { ViewAdapter, ItemSnapshot } from "./ViewAdapter";
import type { AgentEvent } from "../tui/agentEvents";
import type { WorkflowState } from "../schemas";
import { TuiRunner } from "../tui/runner";

export class TuiViewAdapter implements ViewAdapter {
  private runner: TuiRunner;

  constructor(items: ItemSnapshot[], options?: TuiOptions) {
    this.runner = new TuiRunner(items, options);
  }

  onItemsChanged(items: ItemSnapshot[]): void {
    this.runner.update({
      items: items.map((it) => ({
        id: it.id,
        state: it.state,
        title: it.title,
        currentStoryId: it.storyId,
      })),
      completedCount: items.filter((it) => it.state === "done").length,
      totalCount: items.length,
    });
  }

  onActiveItemChanged(itemId: string | null): void {
    this.runner.update({ currentItem: itemId });
  }

  onPhaseChanged(phase: WorkflowState | null): void {
    this.runner.update({ currentPhase: phase });
  }

  onIterationChanged(iteration: number, maxIterations: number): void {
    this.runner.update({ currentIteration: iteration, maxIterations });
  }

  onAgentEvent(itemId: string, event: AgentEvent): void {
    this.runner.appendAgentEvent(itemId, event);
  }

  onRunComplete(itemId: string, success: boolean, error?: string): void {
    if (error) {
      this.runner.appendAgentEvent(itemId, { type: "error", message: error });
    }
  }

  start(): void {
    this.runner.start();
  }

  stop(): void {
    this.runner.stop();
  }
}
```

### 2.4 Future: WebViewAdapter (Sketch)

```typescript
// src/views/WebViewAdapter.ts (future implementation)
export class WebViewAdapter implements ViewAdapter {
  private wss: WebSocketServer;

  onAgentEvent(itemId: string, event: AgentEvent): void {
    this.broadcast({ type: "agent_event", itemId, event });
  }

  // ... broadcast all state changes to connected clients
}
```

### 2.5 Future: JsonViewAdapter (CI/Headless)

```typescript
// src/views/JsonViewAdapter.ts (future implementation)
export class JsonViewAdapter implements ViewAdapter {
  onAgentEvent(itemId: string, event: AgentEvent): void {
    console.log(JSON.stringify({ type: "agent_event", itemId, event }));
  }

  // ... NDJSON output for scripting/CI
}
```

---

## 3. Target UX

### 3.1 Queue View (Left Pane)

```
┌─ Queue ────────────────────────┐
│ ID                   STATE     │
│ ✓ feature-auth       done      │
│ → feature-payments   implementing │
│ ○ feature-reports    planned   │
│ ○ feature-dashboard  raw       │
└────────────────────────────────┘
```

- All items visible with current workflow state
- Icons: `✓` (done), `→` (active/in-progress), `○` (pending)
- Color coding: green (done), yellow (active), dim (pending)
- Scrollable if many items

### 3.2 Active Item Pane (Top Right)

```
┌─ Active ───────────────────────┐
│ feature-payments               │
│ Phase: implementing (3/10)     │
│ raw → researched → planned → [implementing] → in_pr → done │
└────────────────────────────────┘
```

- Current item ID and title
- Phase with iteration counter
- Visual workflow pipeline with current state highlighted

### 3.3 Agent Activity Pane (Bottom Right)

```
┌─ Agent Activity ───────────────┐
│ [▶] Read                       │
│     📄 src/payments/handler.ts │
│ [✓] Grep                       │
│     🔍 "processPayment"        │
│     → 3 matches found          │
│ [▶] Edit                       │
│     ✏️ src/payments/handler.ts │
│                                │
│ Thinking:                      │
│   Analyzing the payment flow...│
└────────────────────────────────┘
```

- Real-time tool executions with status icons (`▶` running, `✓` complete, `✗` error)
- Tool-specific colors and icons
- Input summaries (file paths, commands, patterns)
- Optional result previews
- Recent "thinking" text from assistant

### 3.4 Toggle Modes

- **Default view**: Queue (left) + Active Item + Agent Activity (right)
- **`l` key**: Full-screen raw logs (existing `LogsPane`)
- **Scroll keys** (`j/k`, arrows): Navigate within visible pane

---

## 4. Data Model Changes

### 4.1 New Agent Event Types

Create `src/tui/agentEvents.ts`:

```typescript
export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_started"; toolUseId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; result: unknown }
  | { type: "tool_error"; toolUseId: string; error: string }
  | { type: "run_result"; subtype?: string }
  | { type: "error"; message: string };
```

### 4.2 Tool Execution Model

Extend `src/tui/dashboard.ts`:

```typescript
export interface ToolExecution {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: "running" | "completed" | "error";
  result?: unknown;
  startedAt: Date;
  finishedAt?: Date;
}
```

This aligns with the existing (unused) `ToolCallItem` component.

### 4.3 Extended TuiState

```typescript
export interface AgentActivityForItem {
  thoughts: string[];       // Recent assistant text chunks (max 50)
  tools: ToolExecution[];   // Tool executions for this item (max 20)
}

export interface TuiState {
  // Existing
  currentItem: string | null;
  currentPhase: string | null;
  currentIteration: number;
  maxIterations: number;
  currentStory: { id: string; title: string } | null;
  items: ItemView[];
  completedCount: number;
  totalCount: number;
  startTime: Date;
  logs: string[];           // Raw output fallback
  showLogs: boolean;

  // NEW
  activityByItem: Record<string, AgentActivityForItem>;
}
```

---

## 5. SDK Integration Changes

### 5.1 Simplified Agent Options (Remove stdout/stderr)

With structured events, we no longer need raw text streaming. Simplify `RunAgentOptions` in `src/agent/runner.ts`:

```typescript
export interface RunAgentOptions {
  config: AgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  mockAgent?: boolean;
  
  // REMOVED: onStdoutChunk, onStderrChunk
  // REPLACED WITH: structured event callback
  onAgentEvent?: (event: AgentEvent) => void;
}
```

**Migration:** Remove all `onStdoutChunk`/`onStderrChunk` usages from:
- `src/agent/runner.ts`
- `src/agent/claude-sdk-runner.ts`
- `src/commands/orchestrator.ts`
- `src/commands/run.ts`

### 5.2 Emit Structured Events from Claude SDK

Update `src/agent/claude-sdk-runner.ts`:

```typescript
export async function runClaudeSdkAgent(options: RunAgentOptions, config: AgentConfig): Promise<AgentResult> {
  // ...existing setup...

  for await (const message of query(prompt, sdkOptions)) {
    if (timedOut) break;

    // Emit structured events (replaces text streaming)
    if (options.onAgentEvent) {
      emitAgentEventsFromSdkMessage(message, options.onAgentEvent);
    }
    
    // Still accumulate output for AgentResult (for logging/debugging)
    output += formatSdkMessage(message);
  }
}

function emitAgentEventsFromSdkMessage(message: any, emit: (event: AgentEvent) => void): void {
  const ctorName = message.constructor?.name;

  if (message.type === "assistant" || ctorName === "AssistantMessage") {
    for (const block of message.content ?? []) {
      if (block.type === "text" && block.text?.trim()) {
        emit({ type: "assistant_text", text: block.text });
      } else if (block.type === "tool_use") {
        emit({
          type: "tool_started",
          toolUseId: block.id ?? `${block.name}-${Date.now()}`,
          toolName: block.name,
          input: block.input ?? {},
        });
      }
    }
    return;
  }

  if (message.type === "tool_result" || ctorName === "ToolResultMessage") {
    emit({
      type: "tool_result",
      toolUseId: message.tool_use_id ?? message.id ?? "unknown",
      result: message.result ?? message.content ?? "",
    });
    return;
  }

  if (message.type === "result" || ctorName === "ResultMessage") {
    emit({ type: "run_result", subtype: message.subtype });
    return;
  }

  if (message.type === "error" || ctorName === "ErrorMessage") {
    emit({ type: "error", message: message.message ?? String(message) });
  }
}
```

### 5.3 Wire Through Orchestrator (Using ViewAdapter)

Update `src/commands/orchestrator.ts` to use `ViewAdapter` instead of direct `TuiRunner`:

```typescript
import { TuiViewAdapter } from "../views/TuiViewAdapter";
import type { ViewAdapter } from "../views/ViewAdapter";

// In orchestrateAll:
const view: ViewAdapter = useTui
  ? new TuiViewAdapter(items, { onQuit: () => process.exit(0) })
  : new JsonViewAdapter(); // or null for no view

view.start();

for (const item of nonDoneItems) {
  view.onActiveItemChanged(item.id);
  view.onPhaseChanged(item.state);

  await runCommand(item.id, {
    force,
    dryRun: false,
    mockAgent,
    onAgentEvent: (event) => view.onAgentEvent(item.id, event),
    onIteration: (iter, max) => view.onIterationChanged(iter, max),
  }, logger);

  view.onRunComplete(item.id, true);
}

view.stop();
```

---

## 6. TuiRunner Changes

### 6.1 Add Event Handler Method (with itemId)

Add to `src/tui/runner.ts`:

```typescript
// Now accepts explicit itemId (no longer infers from currentItem)
appendAgentEvent(itemId: string, event: AgentEvent): void {

  const prevActivity = this.state.activityByItem[itemId] ?? { thoughts: [], tools: [] };
  let nextActivity = prevActivity;

  switch (event.type) {
    case "assistant_text": {
      const maxThoughts = 50;
      const thoughts = [...prevActivity.thoughts, event.text].slice(-maxThoughts);
      nextActivity = { ...prevActivity, thoughts };
      break;
    }
    case "tool_started": {
      const tool: ToolExecution = {
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        input: event.input,
        status: "running",
        startedAt: new Date(),
      };
      nextActivity = { ...prevActivity, tools: [...prevActivity.tools, tool] };
      break;
    }
    case "tool_result": {
      const tools = prevActivity.tools.map((t) =>
        t.toolUseId === event.toolUseId
          ? { ...t, status: "completed" as const, result: event.result, finishedAt: new Date() }
          : t
      );
      nextActivity = { ...prevActivity, tools };
      break;
    }
    case "tool_error": {
      const tools = prevActivity.tools.map((t) =>
        t.toolUseId === event.toolUseId
          ? { ...t, status: "error" as const, result: event.error, finishedAt: new Date() }
          : t
      );
      nextActivity = { ...prevActivity, tools };
      break;
    }
    case "error": {
      nextActivity = { ...prevActivity, thoughts: [...prevActivity.thoughts, `ERROR: ${event.message}`] };
      break;
    }
    case "run_result": {
      nextActivity = { ...prevActivity, thoughts: [...prevActivity.thoughts, `✅ ${event.subtype ?? "Complete"}`] };
      break;
    }
  }

  const activityByItem = { ...this.state.activityByItem, [itemId]: nextActivity };
  this.state = updateTuiState(this.state, { activityByItem });
  this.notify();
}
```

### 6.2 Update createTuiState

```typescript
export function createTuiState(items: IndexItem[]): TuiState {
  const activityByItem: Record<string, AgentActivityForItem> = {};
  for (const item of items) {
    activityByItem[item.id] = { thoughts: [], tools: [] };
  }

  return {
    // ...existing fields...
    activityByItem,
  };
}
```

---

## 7. New UI Components

### 7.1 ActiveItemPane

Create `src/tui/components/ActiveItemPane.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { TuiState } from "../dashboard";
import { WORKFLOW_STATES } from "../../domain/states";

interface ActiveItemPaneProps {
  state: TuiState;
  width: number;
}

export function ActiveItemPane({ state, width }: ActiveItemPaneProps): React.ReactElement {
  const { currentItem, currentPhase, currentIteration, maxIterations, items } = state;
  
  if (!currentItem) {
    return <Text dimColor>No active item</Text>;
  }

  const item = items.find((it) => it.id === currentItem);
  const title = item?.title ?? "";

  // Workflow pipeline visualization
  const workflowLine = WORKFLOW_STATES
    .map((s) => (s === item?.state ? `[${s}]` : s))
    .join(" → ");

  return (
    <Box flexDirection="column" width={width}>
      <Text bold color="yellow">
        Active: {currentItem} {title ? `- ${title}` : ""}
      </Text>
      <Text>
        Phase: {currentPhase ?? item?.state ?? "unknown"} ({currentIteration}/{maxIterations})
      </Text>
      <Text dimColor>{workflowLine}</Text>
    </Box>
  );
}
```

### 7.2 AgentActivityPane

Create `src/tui/components/AgentActivityPane.tsx`:

```tsx
import React from "react";
import { Box, Text } from "ink";
import type { TuiState, ToolExecution } from "../dashboard";
import { ToolCallItem } from "./ToolCallItem";

interface AgentActivityPaneProps {
  state: TuiState;
  width: number;
  height: number;
}

export function AgentActivityPane({ state, width, height }: AgentActivityPaneProps): React.ReactElement {
  const innerWidth = width - 2;
  const itemId = state.currentItem;

  if (!itemId) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text dimColor>No active agent activity</Text>
      </Box>
    );
  }

  const activity = state.activityByItem[itemId];
  if (!activity) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text dimColor>Waiting for agent activity...</Text>
      </Box>
    );
  }

  const maxTools = Math.max(1, Math.floor(height * 0.7));
  const maxThoughts = Math.max(1, height - maxTools - 2);

  const recentTools = activity.tools.slice(-maxTools);
  const recentThoughts = activity.thoughts.slice(-maxThoughts);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text dimColor>{"─".repeat(10)} Agent Activity {"─".repeat(Math.max(0, innerWidth - 28))}</Text>

      {recentTools.map((tool) => (
        <ToolCallItem key={tool.toolUseId} tool={tool} width={innerWidth} />
      ))}

      {recentThoughts.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Thinking:</Text>
          {recentThoughts.map((t, idx) => (
            <Text key={idx} dimColor wrap="truncate-end">
              {t.slice(0, innerWidth)}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

### 7.3 Update InkApp Layout

Modify `src/tui/InkApp.tsx` main content area:

```tsx
import { ActiveItemPane } from "./components/ActiveItemPane";
import { AgentActivityPane } from "./components/AgentActivityPane";

// In the non-logs view:
{showLogs ? (
  <LogsPane ... />
) : (
  <Box height={mainHeight}>
    {/* Left: Queue */}
    <Box flexDirection="column" width={leftPaneWidth} paddingLeft={1}>
      <ItemsPane state={state} width={leftPaneWidth} height={mainHeight} />
    </Box>
    
    {/* Right: Active Item + Agent Activity */}
    <Box flexDirection="column" width={rightPaneWidth} borderStyle="single" paddingLeft={1}>
      <Box height={4}>
        <ActiveItemPane state={state} width={rightPaneWidth - 2} />
      </Box>
      <Box height={mainHeight - 4}>
        <AgentActivityPane 
          state={state} 
          width={rightPaneWidth - 2} 
          height={mainHeight - 4} 
        />
      </Box>
    </Box>
  </Box>
)}
```

---

## 8. Enhanced ItemsPane

Update `src/tui/components/ItemsPane.tsx`:

```tsx
// Add state-based coloring
function getStateColor(state: string, isActive: boolean): string | undefined {
  if (state === "done") return "green";
  if (isActive) return "yellow";
  if (state === "implementing" || state === "in_pr") return "yellow";
  return undefined; // dim for pending states
}

// In render:
<Text
  color={getStateColor(item.state, isActive)}
  bold={isActive}
  dimColor={!isActive && item.state !== "done"}
>
  {truncate(line, innerWidth)}
</Text>
```

---

## 9. Iteration Counter Wiring

Add iteration callbacks to the agent loop:

### 9.1 Extend runCommand Options

In `src/commands/run.ts`:

```typescript
interface RunCommandOptions {
  // existing...
  onAgentEvent?: (event: AgentEvent) => void;
  onIteration?: (iteration: number, maxIterations: number) => void;
}
```

### 9.2 Call from Agent Loop

Wherever iterations occur:

```typescript
for (let i = 0; i < maxIterations; i++) {
  options.onIteration?.(i + 1, maxIterations);
  // ... run agent iteration
}
```

---

## 10. Implementation Phases

### Phase 1: ViewAdapter Architecture (Small)
- [ ] Create `src/views/ViewAdapter.ts` interface
- [ ] Create `src/views/TuiViewAdapter.ts` implementation
- [ ] Export from `src/views/index.ts`

### Phase 2: Data Model (Small)
- [ ] Create `src/tui/agentEvents.ts` with event types
- [ ] Extend `TuiState` with `activityByItem`
- [ ] Update `ToolExecution` type in dashboard.ts
- [ ] Update `createTuiState` to initialize `activityByItem`

### Phase 3: SDK Event Emission (Medium)
- [ ] Remove `onStdoutChunk`/`onStderrChunk` from `RunAgentOptions`
- [ ] Add `onAgentEvent` to `RunAgentOptions`
- [ ] Implement `emitAgentEventsFromSdkMessage` in claude-sdk-runner.ts
- [ ] Wire through `runAgentUnion` dispatch
- [ ] Update process-based agent to emit basic events (or graceful no-op)

### Phase 4: TuiRunner Integration (Medium)
- [ ] Add `appendAgentEvent(itemId, event)` method to TuiRunner
- [ ] Update orchestrator to use `ViewAdapter` interface
- [ ] Ensure `runCommand` passes events through

### Phase 5: UI Components (Medium)
- [ ] Create `ActiveItemPane` component
- [ ] Create `AgentActivityPane` component
- [ ] Update `ToolCallItem` to use new `ToolExecution` type
- [ ] Update `ItemsPane` with better state coloring

### Phase 6: Layout Integration (Small)
- [ ] Update `InkApp` layout for new panes
- [ ] Export new components from `components/index.ts`
- [ ] Test keyboard navigation still works

### Phase 7: Iteration Counter (Small)
- [ ] Add iteration callback to agent loop
- [ ] Wire through ViewAdapter

---

## 11. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| SDK message shape changes | Isolate adapter in `emitAgentEventsFromSdkMessage`; easy to update |
| Non-SDK agents have no events | Graceful fallback; show "no structured activity" message |
| State bloat with many items | Cap arrays: 50 thoughts, 20 tools per item |
| Process agents lose structure | Accept limitation; TUI degrades gracefully |
| ViewAdapter overhead | Minimal — just interface indirection, no performance impact |

---

## 12. Future Enhancements (Out of Scope)

If needs grow beyond this plan:

1. **Web dashboard** — Implement `WebViewAdapter` with WebSocket server
2. **Parallel item processing** — Multiple active items, multi-column activity
3. **Event persistence** — JSONL logging per item for replay
4. **Session replay** — `wreckit view <session>` command
5. **Interactive control** — Pause/resume, skip steps, manual transitions
6. **Multi-pane focus** — Tab between queue/activity with independent scrolling

---

## 13. Success Criteria

- [ ] `ViewAdapter` interface implemented and used by orchestrator
- [ ] Queue shows all items with accurate workflow states
- [ ] Active item displays workflow pipeline with current state highlighted
- [ ] Tool calls appear in real-time as Claude SDK emits them
- [ ] Thinking/reasoning text streams into activity pane
- [ ] `l` key toggles to full-screen raw logs (unchanged behavior)
- [ ] Non-SDK agents gracefully fall back to "no structured activity" view
- [ ] No stdout/stderr chunk callbacks remain in codebase
- [ ] No regressions in existing TUI functionality
