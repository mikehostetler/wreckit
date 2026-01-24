# Benchmark Results

Generated: 2026-01-24T06:14:03.658Z

## Environment

- **OS**: darwin-24.6.0
- **Architecture**: arm64
- **Bun Version**: 1.2.9
- **CPU Count**: 10

**Total Duration**: 775ms

---

## resumability

_Measures overhead of resumability features (skip detection, state recovery)_

Duration: 16ms

| Metric | Mean | Unit | P50 | P95 | P99 | Samples |
|--------|------|------|-----|-----|-----|---------|
| item_read_ms | 0.06 | ms | 0.06 | 0.09 | 0.09 | 5 |
| prd_read_10_stories_ms | 0.08 | ms | 0.08 | 0.12 | 0.12 | 5 |
| story_skip_detection_50done_ms | 0.11 | ms | 0.11 | 0.13 | 0.13 | 5 |
| state_recovery_ms | 0.10 | ms | 0.08 | 0.21 | 0.21 | 5 |

## concurrency

_Measures throughput scaling with parallel worker pools_

Duration: 96ms

| Metric | Mean | Unit | P50 | P95 | P99 | Samples |
|--------|------|------|-----|-----|-----|---------|
| parallel_1_duration_ms | 5.41 | ms | 5.42 | 5.78 | 5.78 | 5 |
| parallel_1_throughput | 3699.0 | items/sec | - | - | - | 5 |
| parallel_2_duration_ms | 3.07 | ms | 3.02 | 3.42 | 3.42 | 5 |
| parallel_2_throughput | 6504.4 | items/sec | - | - | - | 5 |
| parallel_4_duration_ms | 2.87 | ms | 2.93 | 3.23 | 3.23 | 5 |
| parallel_4_throughput | 6959.9 | items/sec | - | - | - | 5 |
| parallel_8_duration_ms | 3.29 | ms | 3.33 | 3.51 | 3.51 | 5 |
| parallel_8_throughput | 6071.8 | items/sec | - | - | - | 5 |
| parallel_2_efficiency | 87.9 | % | - | - | - | - |
| parallel_4_efficiency | 47.0 | % | - | - | - | - |
| parallel_8_efficiency | 20.5 | % | - | - | - | - |

## fileops

_Measures atomic write performance and lock acquisition latency_

Duration: 662ms

| Metric | Mean | Unit | P50 | P95 | P99 | Samples |
|--------|------|------|-----|-----|-----|---------|
| atomic_write_small_ms | 0.32 | ms | 0.24 | 0.62 | 0.62 | 5 |
| atomic_write_medium_ms | 0.22 | ms | 0.22 | 0.24 | 0.24 | 5 |
| atomic_write_large_ms | 0.29 | ms | 0.30 | 0.31 | 0.31 | 5 |
| lock_acquire_exclusive_ms | 0.23 | ms | 0.20 | 0.35 | 0.35 | 5 |
| lock_with_exclusive_ms | 0.22 | ms | 0.21 | 0.24 | 0.24 | 5 |
| lock_contention_2_concurrent_ms | 67.06 | ms | 7.24 | 191.51 | 191.51 | 5 |
