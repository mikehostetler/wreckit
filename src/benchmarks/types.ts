import type { WorkflowState } from "../schemas";

export interface MetricPoint {
  label: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface StatsSummary {
  count: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface ResumabilityMetrics {
  state: WorkflowState;
  stats: StatsSummary;
  measurements: number[];
}

export interface ScalingMetrics {
  parallelism: number;
  throughput: number;
  totalTimeMs: number;
  itemCount: number;
  stats?: StatsSummary;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  cpuCount: number;
  nodeVersion: string;
  bunVersion: string | null;
  totalMemoryMb: number;
}

export interface BenchmarkResult {
  name: string;
  timestamp: string;
  system: SystemInfo;
  config: BenchmarkConfig;
  totalDurationMs: number;
  resumability?: ResumabilityMetrics[];
  scaling?: ScalingMetrics[];
}

export interface BenchmarkConfig {
  iterations: number;
  warmupRuns: number;
  itemCount: number;
  parallelismLevels: number[];
  outputFormat: "json" | "md" | "csv";
  outputFile?: string;
}

export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  iterations: 5,
  warmupRuns: 1,
  itemCount: 20,
  parallelismLevels: [1, 2, 4, 8, 16],
  outputFormat: "json",
};

export type BenchmarkProgressCallback = (
  phase: string,
  current: number,
  total: number,
  message?: string
) => void;