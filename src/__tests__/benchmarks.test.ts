import { describe, expect, it } from "bun:test";
import {
  calculateStats,
  makeTempDir,
  getEnvironment,
} from "../benchmarks/utils";
import { formatJson, formatMarkdown, formatCsv } from "../benchmarks/reporters";
import type { BenchmarkResult } from "../benchmarks/schema";

describe("benchmark utils", () => {
  describe("calculateStats", () => {
    it("computes correct statistics for a sample set", () => {
      const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stats = calculateStats(samples);

      expect(stats.value).toBe(5.5); // mean
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(10);
      expect(stats.p50).toBe(6); // floor(10 * 0.5) = 5, sorted[5] = 6
      expect(stats.samples).toBe(10);
    });

    it("handles single sample", () => {
      const samples = [42];
      const stats = calculateStats(samples);

      expect(stats.value).toBe(42);
      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
      expect(stats.p50).toBe(42);
      expect(stats.samples).toBe(1);
    });

    it("handles empty samples", () => {
      const samples: number[] = [];
      const stats = calculateStats(samples);

      expect(stats.value).toBe(0);
      expect(stats.samples).toBe(0);
    });

    it("sorts samples before computing percentiles", () => {
      const samples = [10, 1, 5, 2, 8, 3, 9, 4, 7, 6];
      const stats = calculateStats(samples);

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(10);
      expect(stats.p50).toBe(6);
    });
  });

  describe("makeTempDir", () => {
    it("creates unique directories", () => {
      const dir1 = makeTempDir();
      const dir2 = makeTempDir();
      expect(dir1).not.toBe(dir2);
    });

    it("uses default prefix", () => {
      const dir = makeTempDir();
      expect(dir).toContain("wreckit-bench");
    });

    it("uses custom prefix when provided", () => {
      const dir = makeTempDir("custom-prefix");
      expect(dir).toContain("custom-prefix");
    });
  });

  describe("getEnvironment", () => {
    it("returns valid environment structure", () => {
      const env = getEnvironment();

      expect(env.os).toBeTruthy();
      expect(typeof env.os).toBe("string");
      expect(env.arch).toBeTruthy();
      expect(typeof env.arch).toBe("string");
      expect(env.cpu_count).toBeGreaterThan(0);
      expect(env.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it("returns bun version when available", () => {
      const env = getEnvironment();
      // In Bun, this should return the version; otherwise "unknown"
      expect(typeof env.bun_version).toBe("string");
    });
  });
});

describe("benchmark reporters", () => {
  const mockResult: BenchmarkResult = {
    schema_version: 1,
    environment: {
      os: "darwin-23.0.0",
      arch: "arm64",
      bun_version: "1.0.0",
      cpu_count: 8,
      timestamp: "2025-01-24T12:00:00.000Z",
    },
    suites: [
      {
        name: "test",
        description: "Test suite",
        metrics: [
          {
            name: "metric1",
            value: 10.5,
            unit: "ms",
            p50: 10,
            p95: 12,
            p99: 15,
            samples: 10,
          },
          {
            name: "metric2",
            value: 100,
            unit: "items/sec",
            samples: 5,
          },
        ],
        duration_ms: 100,
      },
    ],
    total_duration_ms: 100,
  };

  describe("formatJson", () => {
    it("produces valid JSON", () => {
      const output = formatJson(mockResult);
      const parsed = JSON.parse(output);
      expect(parsed).toBeDefined();
    });

    it("preserves all fields", () => {
      const output = formatJson(mockResult);
      const parsed = JSON.parse(output);
      expect(parsed.schema_version).toBe(1);
      expect(parsed.suites.length).toBe(1);
      expect(parsed.environment.os).toBe("darwin-23.0.0");
    });

    it("uses 2-space indentation", () => {
      const output = formatJson(mockResult);
      // Check that it contains the 2-space indented pattern
      expect(output).toContain('  "schema_version": 1');
    });
  });

  describe("formatMarkdown", () => {
    it("includes title header", () => {
      const output = formatMarkdown(mockResult);
      expect(output).toContain("# Benchmark Results");
    });

    it("includes environment section", () => {
      const output = formatMarkdown(mockResult);
      expect(output).toContain("## Environment");
      expect(output).toContain("**OS**: darwin-23.0.0");
      expect(output).toContain("**Architecture**: arm64");
      expect(output).toContain("**Bun Version**: 1.0.0");
      expect(output).toContain("**CPU Count**: 8");
    });

    it("includes table headers", () => {
      const output = formatMarkdown(mockResult);
      expect(output).toContain(
        "| Metric | Mean | Unit | P50 | P95 | P99 | Samples |"
      );
      expect(output).toContain(
        "|--------|------|------|-----|-----|-----|---------|"
      );
    });

    it("includes metric rows", () => {
      const output = formatMarkdown(mockResult);
      expect(output).toContain("| metric1 |");
      expect(output).toContain("| metric2 |");
    });

    it("shows dash for missing optional fields", () => {
      const output = formatMarkdown(mockResult);
      // metric2 doesn't have p50, p95, p99
      expect(output).toContain("| - | - | - |");
    });
  });

  describe("formatCsv", () => {
    it("has correct header", () => {
      const output = formatCsv(mockResult);
      const lines = output.split("\n");
      expect(lines[0]).toBe(
        "suite,metric,value,unit,min,max,p50,p95,p99,samples,timestamp"
      );
    });

    it("has correct row count", () => {
      const output = formatCsv(mockResult);
      const lines = output.split("\n");
      // 1 header + 2 metrics
      expect(lines.length).toBe(3);
    });

    it("contains suite and metric names", () => {
      const output = formatCsv(mockResult);
      expect(output).toContain("test,metric1");
      expect(output).toContain("test,metric2");
    });

    it("escapes values with commas", () => {
      const resultWithComma: BenchmarkResult = {
        ...mockResult,
        suites: [
          {
            name: "test,suite",
            description: "Test",
            metrics: [{ name: "metric", value: 1, unit: "ms" }],
            duration_ms: 100,
          },
        ],
      };
      const output = formatCsv(resultWithComma);
      expect(output).toContain('"test,suite"');
    });

    it("includes timestamp in each row", () => {
      const output = formatCsv(mockResult);
      const lines = output.split("\n");
      expect(lines[1]).toContain("2025-01-24T12:00:00.000Z");
      expect(lines[2]).toContain("2025-01-24T12:00:00.000Z");
    });

    it("leaves empty string for missing optional fields", () => {
      const output = formatCsv(mockResult);
      const lines = output.split("\n");
      // metric2 has no min, max, p50, p95, p99
      const metric2Row = lines[2];
      const parts = metric2Row.split(",");
      expect(parts[4]).toBe(""); // min
      expect(parts[5]).toBe(""); // max
      expect(parts[6]).toBe(""); // p50
      expect(parts[7]).toBe(""); // p95
      expect(parts[8]).toBe(""); // p99
    });
  });
});
