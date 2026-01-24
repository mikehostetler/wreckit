#!/usr/bin/env bun

import * as fs from "node:fs/promises";
import {
  runBenchmarks,
  formatOutput,
  type SuiteName,
  type OutputFormat,
} from "./runner";

/**
 * Parses command line arguments into options.
 */
function parseArgs(args: string[]): {
  suites: SuiteName[];
  format: OutputFormat;
  iterations: number;
  output: string;
} {
  const result = {
    suites: ["all"] as SuiteName[],
    format: "json" as OutputFormat,
    iterations: 10,
    output: "-",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--suite" || arg === "-s") {
      const value = args[++i];
      if (value) {
        result.suites = value.split(",") as SuiteName[];
      }
    } else if (arg === "--format" || arg === "-f") {
      const value = args[++i];
      if (value === "json" || value === "md" || value === "csv") {
        result.format = value;
      }
    } else if (arg === "--iterations" || arg === "-i") {
      const value = parseInt(args[++i], 10);
      if (!isNaN(value) && value > 0) {
        result.iterations = value;
      }
    } else if (arg === "--output" || arg === "-o") {
      const value = args[++i];
      if (value) {
        result.output = value;
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: bun run benchmark [options]

Options:
  -s, --suite <names>      Comma-separated suite names (resumability,concurrency,fileops,all)
  -f, --format <format>    Output format: json, md, csv (default: json)
  -i, --iterations <n>     Number of iterations per benchmark (default: 10)
  -o, --output <path>      Output file path, or "-" for stdout (default: -)
  -h, --help               Show this help message

Examples:
  bun run benchmark                           # Run all suites, JSON output
  bun run benchmark -f md                     # Markdown output
  bun run benchmark -s resumability -i 20     # Single suite with 20 iterations
  bun run benchmark -o results.json           # Write to file
`);
      process.exit(0);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.error("Wreckit Benchmark Suite");
  console.error("=======================");
  console.error("");

  const result = await runBenchmarks({
    suites: args.suites,
    format: args.format,
    iterations: args.iterations,
  });

  const output = formatOutput(result, args.format);

  if (args.output === "-") {
    console.log(output);
  } else {
    await fs.writeFile(args.output, output, "utf-8");
    console.error(`\nResults written to ${args.output}`);
  }

  console.error("");
  console.error(`Total duration: ${result.total_duration_ms.toFixed(0)}ms`);
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
