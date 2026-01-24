# Research: Benchmarking suite for resumability and concurrency scaling

**Date**: 2025-01-24
**Item**: 005-benchmarking-suite-for-resumability-and-concurrenc

## Research Question
Add a benchmarking suite that measures resumability and concurrency scaling performance, generating paper-ready metrics in multiple formats.

**Success criteria:**
- Generates paper-ready metrics
- Outputs in JSON format
- Outputs in Markdown format
- Outputs in CSV format

**Technical constraints:**
- Must output JSON, MD, and CSV formats

## Summary

The wreckit codebase is a CLI tool for automating backlog-to-PR workflows through an agent loop. It has solid foundations for concurrency (via the orchestrator's parallel processing) and resumability (via file-based state in `.wreckit/` with atomic writes and locking). A benchmarking suite should measure: (1) resumability correctness and overhead when interrupted/resumed, (2) concurrency scaling as the `--parallel` flag increases, and (3) file locking contention under concurrent reads/writes.

The codebase uses Bun as the test runner with established patterns in `src/__tests__/`. Output formatting already exists in `src/commands/dryRunFormatter.ts` and `src/logging.ts` (including a `json()` method). The benchmarking suite should follow these patterns: create a new `src/benchmarks/` directory with benchmark runners, formatters for JSON/MD/CSV output, and integration with the existing test infrastructure. The suite should be runnable via `bun run benchmark` or a new CLI command.

The main technical challenges are: (1) accurately measuring resumability without flaky timing issues, (2) simulating realistic agent workloads without hitting actual LLM APIs, and (3) ensuring the benchmark results are reproducible across different machines. The existing `--mockAgent` flag and atomic file operations provide good building blocks.

## Current State Analysis

### Existing Implementation

**Concurrency Support:**
- `src/commands/orchestrator.ts:16-25` - `OrchestratorOptions` includes `parallel?: number` for concurrent processing
- `src/commands/orchestrator.ts:120-193` - Parallel execution uses a worker pool pattern with `processItemsParallel()`
- `src/commands/orchestrator.ts:210-283` - Worker pool implementation processes items from a queue with configurable concurrency

**Resumability Support:**
- `src/specs/002-research-phase.md:256-276` - Documents skip behavior for existing artifacts
- `src/specs/004-implement-phase.md:195-206` - Implement phase is "fully resumable" via PRD state tracking
- `src/workflow/itemWorkflow.ts:576-698` - Implementation loop resumes from pending stories in PRD
- File-based state in `.wreckit/items/<id>/item.json` tracks current state

**File Locking and Atomic Writes:**
- `src/fs/lock.ts:1-313` - `FileLock` class with exclusive/shared locks, stale lock detection, and retry logic
- `src/fs/atomic.ts:1-79` - `safeWriteJson()` uses write-temp-then-rename pattern for atomic writes
- `src/fs/json.ts:56-79` - `readJsonWithSchema()` and `writeJsonPretty()` support `useLock` option

**Existing Test Patterns:**
- `src/__tests__/edge-cases/concurrent.test.ts:1-176` - Tests for concurrent modification handling
- Test infrastructure uses Bun with `describe`, `it`, `beforeEach`, `afterEach` patterns
- Temp directories created via `fs.mkdtemp()` for isolated test environments

**Output Formatting Patterns:**
- `src/logging.ts:104-106` - Logger interface includes `json(data: unknown)` method for JSON output
- `src/commands/dryRunFormatter.ts:1-183` - Formatter pattern for structured output with tables and summaries
- No existing CSV formatter

### Key Files

- `src/commands/orchestrator.ts:210-283` - Parallel worker pool implementation
- `src/fs/lock.ts:16-263` - FileLock class with exclusive/shared/withLock patterns
- `src/fs/atomic.ts:14-39` - Atomic JSON write implementation
- `src/__tests__/edge-cases/concurrent.test.ts:39-145` - Concurrent write and read-during-write tests
- `src/workflow/itemWorkflow.ts:501-715` - Implement phase with iteration loop and resumability
- `src/logging.ts:66-108` - Logger creation with JSON output support
- `src/commands/dryRunFormatter.ts:85-115` - Summary formatter pattern to follow

## Technical Considerations

### Dependencies

**External dependencies needed:**
- None required - Bun's built-in test runner and timing APIs are sufficient
- `fast-check` (already in devDependencies) could be used for property-based testing of edge cases

**Internal modules to integrate with:**
- `src/fs/json.ts` - For reading/writing benchmark results
- `src/fs/atomic.ts` - For safe result persistence
- `src/logging.ts` - For consistent output formatting
- `src/schemas.ts` - For defining benchmark result schemas with Zod
- `src/commands/orchestrator.ts` - For parallel execution benchmarks

### Patterns to Follow

**Test Setup Pattern (from concurrent.test.ts:9-18):**
```typescript
function makeTempDir(): string {
  return path.join(tmpdir(), `wreckit-test-${randomBytes(8).toString("hex")}`);
}

async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}
```

**Output Formatting Pattern (from dryRunFormatter.ts:85-115):**
- Use `logger.info()` for table rows
- Use box-drawing characters for visual separation
- Group metrics by category

**Schema Definition Pattern (from schemas.ts):**
- Define Zod schemas for all data structures
- Export both schema and inferred type

### Output Format Requirements

**JSON Format:**
```json
{
  "benchmark_version": 1,
  "timestamp": "2025-01-24T...",
  "environment": { "os": "...", "node": "...", "bun": "..." },
  "suites": [
    {
      "name": "resumability",
      "metrics": [
        { "name": "skip_existing_overhead_ms", "value": 12.5, "unit": "ms" }
      ]
    }
  ]
}
```

**Markdown Format:**
```markdown
# Benchmark Results

## Resumability
| Metric | Value | Unit |
|--------|-------|------|
| Skip Existing Overhead | 12.5 | ms |

## Concurrency Scaling
...
```

**CSV Format:**
```csv
suite,metric,value,unit,timestamp
resumability,skip_existing_overhead_ms,12.5,ms,2025-01-24T...
concurrency,parallel_2_throughput,45.2,items/sec,2025-01-24T...
```

## Benchmark Suites to Implement

### 1. Resumability Benchmarks

**Skip Existing Artifact:**
- Create item with existing `research.md`
- Measure time to skip vs regenerate
- Compare with/without `--force`

**State Recovery:**
- Create item in `implementing` state with partial PRD
- Measure time to detect and resume from correct story
- Verify no data loss

**Interrupt and Resume:**
- Start phase, simulate interrupt (SIGINT)
- Measure recovery time and correctness
- Verify atomic writes prevent corruption

### 2. Concurrency Scaling Benchmarks

**Parallel Throughput:**
- Run `orchestrateAll` with parallel=1,2,4,8
- Measure items processed per second
- Calculate scaling efficiency (ideal vs actual)

**Lock Contention:**
- Concurrent reads to same item
- Concurrent writes to same item
- Mixed read/write workloads
- Measure p50/p95/p99 latencies

**Queue Processing:**
- Worker pool efficiency
- Queue drain time vs worker count

### 3. File Operations Benchmarks

**Atomic Write Performance:**
- `safeWriteJson` with varying payload sizes
- Compare with direct `writeFile`
- Measure rename overhead

**Lock Acquisition:**
- Exclusive lock acquisition time (uncontested)
- Shared lock acquisition time (uncontested)
- Lock acquisition under contention

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flaky timing measurements | High | Use statistical methods (multiple runs, percentiles, trim outliers) |
| Machine-dependent results | Medium | Report relative metrics and scaling ratios rather than absolute times |
| Test isolation failures | Medium | Use unique temp directories with random suffixes |
| Mock agent not representative | Medium | Design benchmarks around file operations, not agent execution |
| Large benchmark runtime | Low | Make benchmarks configurable (iterations, warmup) with sensible defaults |

## Recommended Approach

1. **Create `src/benchmarks/` directory structure:**
   - `src/benchmarks/index.ts` - Main entry point and CLI
   - `src/benchmarks/suites/` - Individual benchmark suites
   - `src/benchmarks/reporters/` - Output formatters (JSON, MD, CSV)
   - `src/benchmarks/utils.ts` - Timing helpers, stats calculations

2. **Define benchmark result schema in `src/benchmarks/schema.ts`:**
   - Use Zod for validation
   - Include metadata (version, timestamp, environment)
   - Support multiple suites and metrics

3. **Implement benchmark runners:**
   - Each suite exports an async function returning metrics
   - Use `performance.now()` for high-resolution timing
   - Run multiple iterations and calculate statistics

4. **Implement output formatters:**
   - JSON: Direct serialization of results
   - Markdown: Table generation with alignment
   - CSV: Header row + data rows with escaping

5. **Add CLI command or npm script:**
   - `bun run benchmark` in package.json scripts
   - Optional flags: `--suite`, `--output`, `--format`, `--iterations`

6. **Integration with existing tests:**
   - Reuse test helpers from `src/__tests__/`
   - Share mock item creation patterns
   - Consider running benchmarks in CI with threshold checks

## Open Questions

1. **Should benchmarks run against real file system or tmpfs?**
   - tmpfs would be more consistent but less representative
   - Real filesystem captures actual I/O characteristics

2. **What are acceptable baseline numbers?**
   - Need to establish initial baselines on reference hardware
   - Consider adding benchmark regression tests to CI

3. **Should we include memory profiling?**
   - V8 heap size tracking during long-running operations
   - Could help identify memory leaks in concurrent scenarios

4. **How to handle the existing `--mockAgent` flag?**
   - All benchmarks should use `mockAgent=true` to avoid LLM calls
   - Or create a dedicated `--benchmark` mode that auto-enables this

5. **Should the benchmark command be a CLI subcommand (`wreckit benchmark`) or separate script?**
   - CLI subcommand would be more discoverable
   - Separate script keeps benchmark code out of main bundle
