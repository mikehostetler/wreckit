# Plan: S4 Memory CRDT Synchronization

## Objective
Enable distributed memory synchronization for System 4 using Delta CRDTs.

## Implementation Steps

### 1. Core CRDT Infrastructure
-   **File**: `lib/cybernetic/core/crdt/distributed_graph.ex` (New)
-   **Action**: Create a GenServer that wraps `DeltaCrdt`.
-   **Config**: Use `DeltaCrdt.AWLWWMap`.
-   **Sync**: Enable neighbor discovery via `libcluster`.

### 2. Context Graph Adapter
-   **File**: `lib/cybernetic/core/crdt/context_graph.ex`
-   **Action**: Implement `add_event/3`.
-   **Logic**:
    -   Convert `memory_update` events into Graph Nodes/Edges.
    -   `Node`: The Memory Entry (ID, Content, Embedding).
    -   `Edge`: Episode -> Memory.
    -   Call `DistributedGraph.mutate`.

### 3. Memory Service Integration
-   **File**: `lib/cybernetic/vsm/system4/memory.ex`
-   **Action**: Uncomment and fix the `broadcast_memory_update` function.
-   **Logic**: Call `ContextGraph.add_event`.

### 4. Cluster Configuration
-   **File**: `lib/cybernetic/application.ex`
-   **Action**: Ensure `libcluster` is started with a `Gossip` topology in `dev` (or `epmd`).
-   **File**: `config/dev.exs` / `config/config.exs`
-   **Action**: Add `delta_crdt` configuration if needed.

## Verification Plan
1.  Start Node A: `iex --sname a -S mix phx.server`
2.  Start Node B: `iex --sname b -S mix phx.server`
3.  Connect: `Node.connect(:b@hostname)`
4.  Store memory on Node A: `System4.Memory.store(...)`
5.  Read memory on Node B: `System4.Memory.get_context(...)`
6.  Expect: Memory from A appears on B.
