import { z } from "zod";

/**
 * Schema for a single benchmark metric.
 * Includes the measured value and optional statistical details.
 */
export const MetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  // Optional statistical details
  min: z.number().optional(),
  max: z.number().optional(),
  p50: z.number().optional(),
  p95: z.number().optional(),
  p99: z.number().optional(),
  samples: z.number().optional(),
});

/**
 * Schema for the results of a single benchmark suite.
 */
export const SuiteResultSchema = z.object({
  name: z.string(),
  description: z.string(),
  metrics: z.array(MetricSchema),
  duration_ms: z.number(),
});

/**
 * Schema for environment metadata captured during benchmark execution.
 */
export const EnvironmentSchema = z.object({
  os: z.string(),
  arch: z.string(),
  bun_version: z.string(),
  cpu_count: z.number(),
  timestamp: z.string(),
});

/**
 * Schema for the complete benchmark result including all suites.
 */
export const BenchmarkResultSchema = z.object({
  schema_version: z.literal(1),
  environment: EnvironmentSchema,
  suites: z.array(SuiteResultSchema),
  total_duration_ms: z.number(),
});

// Export inferred types
export type Metric = z.infer<typeof MetricSchema>;
export type SuiteResult = z.infer<typeof SuiteResultSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;
