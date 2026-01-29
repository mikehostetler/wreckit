defmodule Mix.Tasks.Cyb.Archeology do
  @moduledoc """
  System archeology tool for Cybernetic AMCP.

  Analyzes the codebase to discover:
  - External entry points (HTTP, AMQP, CLI, cron)
  - Execution traces from each entry point
  - Shared modules across traces
  - Orphan functions (public functions with zero trace references)

  ## Usage

      mix cyb.archeology [--format=elixir|json] [--output=PATH]

  ## Options

    * `--format` - Output format: `elixir` (default) or `json`
    * `--output` - Write output to file instead of stdout
    * `--verbose` - Enable verbose logging

  ## Output

  Returns a map with the following structure:

      %{
        entry_points: [
          %{
            type: :http | :amqp | :cli | :cron,
            module: Mod,
            function: :func,
            arity: n,
            file: "path/to/file.ex",
            line: line,
            metadata: %{}
          }
        ],
        traces: [
          %{
            entry_point_id: "id",
            functions: [
              %{
                module: Mod,
                function: :func,
                arity: n,
                file: "path/to/file.ex",
                line: line
              }
            ]
          }
        ],
        shared_modules: [
          %{
            module: Mod,
            trace_count: n,
            trace_ids: ["id1", "id2"]
          }
        ],
        orphan_functions: [
          %{
            module: Mod,
            function: :func,
            arity: n,
            file: "path/to/file.ex",
            line: line
          }
        ]
      }
  """

  use Mix.Task

  @shortdoc "System archeology and architecture analysis"

  @impl true
  def run(args) do
    {opts, _, _} =
      OptionParser.parse(args,
        strict: [
          format: :string,
          output: :string,
          verbose: :boolean
        ]
      )

    format = Keyword.get(opts, :format, "elixir")
    verbose? = Keyword.get(opts, :verbose, false)

    if verbose? do
      Mix.shell().info("Starting system archeology...")
    end

    # Run the analysis pipeline
    result = analyze()

    # Output results
    output_result(result, format, opts[:output])

    if verbose? do
      Mix.shell().info("Archeology complete!")
    end

    :ok
  end

  defp analyze do
    # Phase 1: Parse all source files and build function catalog
    catalog = build_catalog()

    # Phase 2: Discover entry points
    entry_points = discover_entry_points(catalog)

    # Phase 3: Generate execution traces
    traces = generate_traces(entry_points, catalog)

    # Phase 4: Analyze shared modules
    shared_modules = analyze_shared_modules(traces)

    # Phase 5: Detect orphan functions
    orphan_functions = detect_orphans(catalog, traces)

    %{
      entry_points: entry_points,
      traces: traces,
      shared_modules: shared_modules,
      orphan_functions: orphan_functions,
      summary: %{
        entry_point_count: length(entry_points),
        trace_count: length(traces),
        shared_module_count: length(shared_modules),
        orphan_function_count: length(orphan_functions)
      }
    }
  end

  defp build_catalog do
    Cybernetic.Archeology.Catalog.build()
  end

  defp discover_entry_points(catalog) do
    Cybernetic.Archeology.EntryPoints.discover(catalog)
  end

  defp generate_traces(entry_points, catalog) do
    Cybernetic.Archeology.Tracer.trace_all(entry_points, catalog)
  end

  defp analyze_shared_modules(traces) do
    Cybernetic.Archeology.Analyzer.shared_modules(traces)
  end

  defp detect_orphans(catalog, traces) do
    Cybernetic.Archeology.Orphans.detect(catalog, traces)
  end

  defp output_result(result, "elixir", nil) do
    IO.inspect(result, pretty: true)
  end

  defp output_result(result, "elixir", path) do
    content = inspect(result, pretty: true)
    File.write!(path, content)
    Mix.shell().info("Output written to #{path}")
  end

  defp output_result(result, "json", nil) do
    json = Jason.encode!(result, pretty: true)
    IO.puts(json)
  end

  defp output_result(result, "json", path) do
    json = Jason.encode!(result, pretty: true)
    File.write!(path, json)
    Mix.shell().info("Output written to #{path}")
  end

  defp output_result(_result, format, _path) do
    Mix.raise("Unknown format: #{format}. Use 'elixir' or 'json'")
  end
end
