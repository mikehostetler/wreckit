defmodule Mix.Tasks.Cyb.Overlay do
  @moduledoc """
  Static-Dynamic Overlay Analysis tool.

  Correlates static analysis results (from archeology) with dynamic execution traces
  to identify dead code, ghost paths, and coverage metrics.

  ## Usage

      mix cyb.overlay [options]

  ## Options

    * `--static=PATH` - Path to archeology-results.json (default: "archeology-results.json")
    * `--dynamic=PATH` - Path to dynamic-traces.json (default: "dynamic-traces.json")
    * `--format=json|elixir` - Output format (default: "json")
    * `--output=PATH` - Write output to file instead of stdout
    * `--hot-threshold=N` - Coverage % for hot modules (default: 75)
    * `--cold-threshold=N` - Coverage % for cold modules (default: 25)
    * `--verbose` - Enable verbose logging

  ## Examples

      # Run with default paths and output to overlay-report.json
      mix cyb.overlay

      # Use custom input files
      mix cyb.overlay --static=/path/to/archeology.json --dynamic=/path/to/traces.json

      # Customize coverage thresholds
      mix cyb.overlay --hot-threshold=80 --cold-threshold=20

      # Output to console in elixir format
      mix cyb.overlay --format=elixir

  ## Output

  Generates a JSON report with the following structure:

      {
        "summary": {
          "dead_code_count": 123,
          "ghost_path_count": 5,
          "modules_analyzed": 45,
          "avg_coverage_pct": 67.8,
          "hot_module_count": 12,
          "cold_module_count": 8
        },
        "dead_code": [...],
        "ghost_paths": [...],
        "module_coverage": [...]
      }
  """

  use Mix.Task

  alias Cybernetic.Archeology.Overlay

  @shortdoc "Static-dynamic overlay analysis"

  @default_static "archeology-results.json"
  @default_dynamic "dynamic-traces.json"
  @default_format "json"
  @default_hot_threshold 75
  @default_cold_threshold 25

  @impl true
  def run(args) do
    {opts, _, _} =
      OptionParser.parse(args,
        strict: [
          static: :string,
          dynamic: :string,
          format: :string,
          output: :string,
          hot_threshold: :integer,
          cold_threshold: :integer,
          verbose: :boolean
        ]
      )

    static_path = Keyword.get(opts, :static, @default_static)
    dynamic_path = Keyword.get(opts, :dynamic, @default_dynamic)
    format = Keyword.get(opts, :format, @default_format)
    verbose? = Keyword.get(opts, :verbose, false)
    hot_threshold = Keyword.get(opts, :hot_threshold, @default_hot_threshold)
    cold_threshold = Keyword.get(opts, :cold_threshold, @default_cold_threshold)

    if verbose? do
      Mix.shell().info("🔍 Starting Static-Dynamic Overlay Analysis...")
      Mix.shell().info("   Static: #{static_path}")
      Mix.shell().info("   Dynamic: #{dynamic_path}")
      Mix.shell().info("   Hot threshold: #{hot_threshold}%")
      Mix.shell().info("   Cold threshold: #{cold_threshold}%")
      Mix.shell().info("")
    end

    # Run the analysis
    result =
      Overlay.analyze(
        static_path: static_path,
        dynamic_path: dynamic_path,
        hot_threshold: hot_threshold,
        cold_threshold: cold_threshold
      )

    # Output results
    output_result(result, format, opts[:output], verbose?)

    :ok
  end

  defp output_result(result, "elixir", nil, _verbose?) do
    IO.inspect(result, pretty: true)
  end

  defp output_result(result, "elixir", path, _verbose?) do
    content = inspect(result, pretty: true)
    File.write!(path, content)
    Mix.shell().info("✓ Output written to #{path}")
  end

  defp output_result(result, "json", nil, verbose?) do
    json = Jason.encode!(result, pretty: true)

    if verbose? do
      # Print console summary before JSON output
      print_console_summary(result)
      IO.puts("\n📄 Full Report (JSON):")
    end

    IO.puts(json)
  end

  defp output_result(result, "json", path, verbose?) do
    json = Jason.encode!(result, pretty: true)
    File.write!(path, json)

    if verbose? do
      print_console_summary(result)
      Mix.shell().info("\n✓ Report written to #{path}")
    else
      Mix.shell().info("✓ Report written to #{path}")
    end
  end

  defp output_result(_result, format, _path, _verbose?) do
    Mix.raise("Unknown format: #{format}. Use 'elixir' or 'json'")
  end

  defp print_console_summary(result) do
    summary = result.summary

    IO.puts("\n📊 Summary:")
    IO.puts("   ├─ Dead code candidates: #{summary["dead_code_count"]}")
    IO.puts("   ├─ Ghost paths detected: #{summary["ghost_path_count"]}")
    IO.puts("   ├─ Modules analyzed: #{summary["modules_analyzed"]}")
    IO.puts("   ├─ Average coverage: #{summary["avg_coverage_pct"]}%")
    IO.puts("   ├─ Hot modules: #{summary["hot_module_count"]}")
    IO.puts("   └─ Cold modules: #{summary["cold_module_count"]}")

    # Top dead code
    if length(result.dead_code) > 0 do
      IO.puts("\n💀 Dead Code (Top 10):")
      result.dead_code
      |> Enum.take(10)
      |> Enum.with_index(1)
      |> Enum.each(fn {fn_ref, idx} ->
        marker = if idx == 10, do: "└", else: "├"
        IO.puts("   #{marker}─ #{fn_ref["module"]}.#{fn_ref["function"]}/#{fn_ref["arity"]} (#{Path.basename(fn_ref["file"])}:#{fn_ref["line"]})")
      end)

      if length(result.dead_code) > 10 do
        IO.puts("   └─ ... and #{length(result.dead_code) - 10} more")
      end
    end

    # Ghost paths
    if length(result.ghost_paths) > 0 do
      IO.puts("\n👻 Ghost Paths:")
      result.ghost_paths
      |> Enum.take(10)
      |> Enum.with_index(1)
      |> Enum.each(fn {ghost, idx} ->
        marker = if idx == min(10, length(result.ghost_paths)), do: "└", else: "├"
        IO.puts("   #{marker}─ #{ghost["module"]}.#{ghost["function"]}/#{ghost["arity"]} (#{ghost["execution_count"]} executions)")
      end)

      if length(result.ghost_paths) > 10 do
        IO.puts("   └─ ... and #{length(result.ghost_paths) - 10} more")
      end
    end

    # Hot modules
    hot_modules = Enum.filter(result.module_coverage, & &1["hot_path"])
    if length(hot_modules) > 0 do
      IO.puts("\n🔥 Hot Modules (>=#{result[:hot_threshold] || 75}% coverage):")
      hot_modules
      |> Enum.take(5)
      |> Enum.with_index(1)
      |> Enum.each(fn {mod, idx} ->
        marker = if idx == min(5, length(hot_modules)), do: "└", else: "├"
        IO.puts("   #{marker}─ #{mod["module"]} (#{mod["coverage_pct"]}% - #{mod["dynamic_function_count"]}/#{mod["static_function_count"]} functions)")
      end)

      if length(hot_modules) > 5 do
        IO.puts("   └─ ... and #{length(hot_modules) - 5} more")
      end
    end

    # Cold modules
    cold_modules = Enum.filter(result.module_coverage, & &1["cold_path"])
    if length(cold_modules) > 0 do
      IO.puts("\n❄️  Cold Modules (<=#{result[:cold_threshold] || 25}% coverage):")
      cold_modules
      |> Enum.take(5)
      |> Enum.with_index(1)
      |> Enum.each(fn {mod, idx} ->
        marker = if idx == min(5, length(cold_modules)), do: "└", else: "├"
        IO.puts("   #{marker}─ #{mod["module"]} (#{mod["coverage_pct"]}% - #{mod["dynamic_function_count"]}/#{mod["static_function_count"]} functions)")
      end)

      if length(cold_modules) > 5 do
        IO.puts("   └─ ... and #{length(cold_modules) - 5} more")
      end
    end
  end
end
