# Research: S4 Memory CRDT Synchronization

## Goal
Implement distributed memory synchronization for System 4 so that the "Mind" shares context across all nodes in the cluster. This ensures that if one node dies or if we scale out, the conversation history and semantic context are preserved and consistent.

## Current State
-   **`Cybernetic.VSM.System4.Memory`**: Locally implemented using ETS (`:s4_memory`). Has a placeholder for CRDT broadcast.
-   **`Cybernetic.Core.CRDT.Graph`**: Implemented using ETS with a naive Last-Write-Wins (LWW) merge strategy. It manually merges states in `handle_call(:merge, ...)`.
-   **Dependencies**: `delta_crdt` and `libcluster` are present in `mix.exs` but not fully utilized for this purpose.

## Architecture Gap
The current `Graph.ex` is a custom, naive implementation. It does not use the `delta_crdt` library, which provides robust, efficient delta-state replication.
The `Memory` service tries to call `ContextGraph.add_event/3`, which suggests a semantic layer on top of the raw CRDT.

## Proposed Solution
1.  **Replace/Augment `Graph.ex`**: Instead of custom ETS merging, wrap `DeltaCrdt` (from the library).
    -   Use `DeltaCrdt.AWLWWMap` (Add-Wins Last-Write-Wins Map) for the graph nodes/edges.
    -   Or use a custom struct if `DeltaCrdt` supports it.
2.  **Implement `ContextGraph`**:
    -   This should be the high-level API that `Memory` calls.
    -   It translates "Store Memory" -> "Add Node (Memory)" + "Add Edge (Episode -> Memory)".
3.  **Cluster Sync**:
    -   Configure `libcluster` to automatically discover nodes (using `Gossip` or `EPMD` for now).
    -   Wire `DeltaCrdt` to sync with neighbors.

## Implementation Plan
1.  **Phase 1: Core CRDT**: Create `Cybernetic.Core.CRDT.DistributedGraph` using `DeltaCrdt`.
2.  **Phase 2: Context Adapter**: Implement `Cybernetic.Core.CRDT.ContextGraph` to map Memory events to Graph operations.
3.  **Phase 3: Integration**: Update `System4.Memory` to call `ContextGraph`.
4.  **Phase 4: Verification**: Test with 2 nodes (interactive shell) to see memory appear on both.

## Key Files
-   `lib/cybernetic/vsm/system4/memory.ex`
-   `lib/cybernetic/core/crdt/graph.ex` (Refactor target)
-   `lib/cybernetic/core/crdt/context_graph.ex` (New/Update)
