defmodule Cybernetic.Archeology.Overlay do
  @moduledoc """
  Static-Dynamic Overlay Analysis.

  Correlates static analysis results (from archeology) with dynamic execution traces
  to identify dead code, ghost paths, and coverage metrics.

  ## Data Normalization

  Both static functions and dynamic spans are normalized to a unified format:
  `{module_string, function_string, arity}`

  This allows efficient set operations to identify:
  - Dead code: static functions never appearing in dynamic traces
  - Ghost paths: dynamic spans without corresponding static calls
  - Coverage: percentage of static code exercised per module
  """

  require Logger

  @type static_function :: %{
          module: String.t(),
          function: String.t(),
          arity: non_neg_integer(),
          file: String.t(),
          line: non_neg_integer(),
          type: String.t()
        }

  @type dynamic_span :: %{
          module: String.t(),
          function: String.t(),
          arity: non_neg_integer(),
          file: String.t(),
          line: non_neg_integer(),
          timestamp: pos_integer(),
          duration_us: non_neg_integer(),
          metadata: map()
        }

  @type normalized_key :: {String.t(), String.t(), non_neg_integer()}

  @doc """
  Loads static analysis data from archeology-results.json.

  Returns a map with traces and orphan_functions.
  """
  @spec load_static_data(String.t()) :: %{traces: [map()], orphan_functions: [map()]}
  def load_static_data(path) do
    Logger.debug("Loading static data from #{path}")

    case File.read(path) do
      {:ok, content} ->
        case Jason.decode(content) do
          {:ok, data} ->
            Logger.debug("Loaded static data: #{length(data["traces"])} traces")
            data

          {:error, reason} ->
            raise "Failed to decode #{path}: #{inspect(reason)}"
        end

      {:error, reason} ->
        raise "Failed to read #{path}: #{inspect(reason)}"
    end
  end

  @doc """
  Loads dynamic trace data from dynamic-traces.json.

  Returns a map with traces.
  """
  @spec load_dynamic_data(String.t()) :: %{traces: [map()]}
  def load_dynamic_data(path) do
    Logger.debug("Loading dynamic data from #{path}")

    case File.read(path) do
      {:ok, content} ->
        case Jason.decode(content) do
          {:ok, data} ->
            Logger.debug("Loaded dynamic data: #{length(data["traces"])} traces")
            data

          {:error, reason} ->
            raise "Failed to decode #{path}: #{inspect(reason)}"
        end

      {:error, reason} ->
        raise "Failed to read #{path}: #{inspect(reason)}"
    end
  end

  @doc """
  Normalizes static functions from archeology traces into a MapSet.

  Extracts unique {module, function, arity} tuples from all trace functions.
  """
  @spec normalize_static_functions(map()) :: MapSet.t(normalized_key())
  def normalize_static_functions(static_data) do
    static_data["traces"]
    |> Enum.flat_map(fn trace -> trace["functions"] end)
    |> Enum.filter(fn fn_ref ->
      # Filter out unknown type functions (., ::, etc.)
      fn_ref["type"] != "unknown"
    end)
    |> Enum.map(fn fn_ref ->
      {fn_ref["module"], fn_ref["function"], fn_ref["arity"]}
    end)
    |> MapSet.new()
  end

  @doc """
  Normalizes dynamic spans from dynamic traces into a MapSet.

  Extracts unique {module, function, arity} tuples from all spans.
  """
  @spec normalize_dynamic_spans(map()) :: MapSet.t(normalized_key())
  def normalize_dynamic_spans(dynamic_data) do
    dynamic_data["traces"]
    |> Enum.flat_map(fn trace -> trace["spans"] end)
    |> Enum.map(fn span ->
      {span["module"], span["function"], span["arity"]}
    end)
    |> MapSet.new()
  end

  @doc """
  Groups static functions by module for coverage analysis.

  Returns a map where keys are module names and values are lists of function references.
  """
  @spec group_static_functions_by_module(map()) :: %{String.t() => [static_function()]}
  def group_static_functions_by_module(static_data) do
    static_data["traces"]
    |> Enum.flat_map(fn trace -> trace["functions"] end)
    |> Enum.filter(fn fn_ref ->
      # Filter out unknown type functions
      fn_ref["type"] != "unknown"
    end)
    |> Enum.group_by(fn fn_ref -> fn_ref["module"] end)
  end

  @doc """
  Groups dynamic spans by module and counts executions.

  Returns a map where keys are module names and values are maps with
  function keys and execution counts.
  """
  @spec group_dynamic_spans_by_module(map()) :: %{String.t() => %{normalized_key() => pos_integer()}}
  def group_dynamic_spans_by_module(dynamic_data) do
    dynamic_data["traces"]
    |> Enum.flat_map(fn trace -> trace["spans"] end)
    |> Enum.reduce(%{}, fn span, acc ->
      module = span["module"]
      key = {module, span["function"], span["arity"]}

      Map.update(acc, module, %{key => 1}, fn module_map ->
        Map.update(module_map, key, 1, &(&1 + 1))
      end)
    end)
  end

  @doc """
  Detects dead code - static functions that never appear in dynamic traces.

  Filters out test functions and callback functions to reduce false positives.
  Returns a list of static function references with metadata.
  """
  @spec detect_dead_code(map(), map()) :: [static_function()]
  def detect_dead_code(static_data, dynamic_data) do
    Logger.debug("Detecting dead code...")

    static_functions = normalize_static_functions(static_data)
    dynamic_functions = normalize_dynamic_spans(dynamic_data)

    # Compute set difference: static - dynamic
    dead_code_keys = MapSet.difference(static_functions, dynamic_functions)

    Logger.debug("Found #{MapSet.size(dead_code_keys)} potential dead code functions")

    # Get full function references for dead code
    all_functions =
      static_data["traces"]
      |> Enum.flat_map(fn trace -> trace["functions"] end)
      |> Enum.filter(fn fn_ref -> fn_ref["type"] != "unknown" end)

    # Filter to dead code and apply exclusions
    all_functions
    |> Enum.filter(fn fn_ref ->
      key = {fn_ref["module"], fn_ref["function"], fn_ref["arity"]}
      MapSet.member?(dead_code_keys, key)
    end)
    |> Enum.reject(fn fn_ref -> is_test_function?(fn_ref) end)
    |> Enum.reject(fn fn_ref -> is_callback_function?(fn_ref) end)
    |> Enum.sort_by(fn fn_ref -> {fn_ref["module"], fn_ref["function"], fn_ref["arity"]} end)
  end

  @doc """
  Checks if a function reference is a test function.

  Test functions are identified by module name ending with "Test" or
  function name starting with "test_".
  """
  @spec is_test_function?(static_function() | dynamic_span()) :: boolean()
  def is_test_function?(fn_ref) do
    module_name = fn_ref["module"]
    function_name = fn_ref["function"]

    # Check if module name ends with "Test" (case-sensitive, avoiding false positives)
    String.ends_with?(module_name, "Test") or
      # Check if function name starts with "test_" (common Elixir convention)
      String.starts_with?(function_name, "test_")
  end

  @doc """
  Checks if a function reference is a callback function.

  Callback functions are standard OTP callbacks for GenServer, GenStage, etc.
  """
  @spec is_callback_function?(static_function() | dynamic_span()) :: boolean()
  def is_callback_function?(fn_ref) do
    callbacks = [
      "init", "handle_call", "handle_cast", "handle_info", "terminate", "code_change",
      "handle_continue", "format_status", "handle_debug",
      "start_link", "child_spec", "post_init",
      "handle_events", "handle_subscription", "cancellable?",
      "perform", "timeout", "retry_at",
      "call", "stream", "crawl"
    ]

    fn_ref["function"] in callbacks
  end

  @doc """
  Detects ghost paths - dynamic spans that don't appear in static analysis.

  Ghost paths are functions that execute at runtime but weren't captured in
  static traces, possibly due to dynamic dispatch (apply/3, runtime eval, etc.).

  Returns a list of maps with module, function, arity, and execution_count.
  """
  @spec detect_ghost_paths(map(), map()) :: [%{module: String.t(), function: String.t(), arity: non_neg_integer(), execution_count: pos_integer()}]
  def detect_ghost_paths(static_data, dynamic_data) do
    Logger.debug("Detecting ghost paths...")

    static_functions = normalize_static_functions(static_data)
    dynamic_spans_by_module = group_dynamic_spans_by_module(dynamic_data)

    # Find all dynamic spans not in static analysis
    ghost_spans =
      dynamic_spans_by_module
      |> Enum.flat_map(fn {_module, spans} ->
        spans
        |> Enum.filter(fn {key, _count} ->
          not MapSet.member?(static_functions, key)
        end)
        |> Enum.map(fn {key, count} ->
          {module, function, arity} = key
          %{
            "module" => module,
            "function" => function,
            "arity" => arity,
            "execution_count" => count
          }
        end)
      end)
      |> Enum.sort_by(fn ghost -> {ghost["module"], ghost["function"], ghost["arity"]} end)

    Logger.debug("Found #{length(ghost_spans)} ghost path functions")

    ghost_spans
  end

  @doc """
  Calculates coverage metrics per module.

  Coverage is the percentage of static functions that appear in dynamic traces.
  Also identifies hot modules (high coverage) and cold modules (low coverage).

  ## Options

    * `:hot_threshold` - Coverage percentage above which a module is considered "hot" (default: 75)
    * `:cold_threshold` - Coverage percentage below which a module is considered "cold" (default: 25)

  ## Returns

  A list of maps with module, coverage statistics, and hot/cold classification.
  """
  @spec calculate_coverage(map(), map(), keyword()) :: [
          %{
            module: String.t(),
            static_function_count: non_neg_integer(),
            dynamic_function_count: non_neg_integer(),
            coverage_pct: float(),
            hot_path: boolean(),
            cold_path: boolean()
          }
        ]
  def calculate_coverage(static_data, dynamic_data, opts \\ []) do
    Logger.debug("Calculating coverage metrics...")

    hot_threshold = Keyword.get(opts, :hot_threshold, 75)
    cold_threshold = Keyword.get(opts, :cold_threshold, 25)

    static_by_module = group_static_functions_by_module(static_data)
    dynamic_by_module = group_dynamic_spans_by_module(dynamic_data)

    coverage =
      static_by_module
      |> Enum.map(fn {module, static_functions} ->
        # Filter out test and callback functions
        static_funcs =
          static_functions
          |> Enum.reject(&is_test_function?/1)
          |> Enum.reject(&is_callback_function?/1)

        static_count = length(static_funcs)

        # Get unique dynamic functions for this module
        dynamic_funcs =
          Map.get(dynamic_by_module, module, %{})
          |> Map.keys()

        dynamic_count =
          static_funcs
          |> Enum.count(fn fn_ref ->
            key = {fn_ref["module"], fn_ref["function"], fn_ref["arity"]}
            MapSet.member?(MapSet.new(dynamic_funcs), key)
          end)

        coverage_pct =
          if static_count > 0 do
            (dynamic_count / static_count * 100) |> Float.round(1)
          else
            0.0
          end

        %{
          "module" => module,
          "static_function_count" => static_count,
          "dynamic_function_count" => dynamic_count,
          "coverage_pct" => coverage_pct,
          "hot_path" => coverage_pct >= hot_threshold,
          "cold_path" => coverage_pct <= cold_threshold
        }
      end)
      |> Enum.sort_by(fn cov -> {-cov["coverage_pct"], cov["module"]} end)

    Logger.debug("Calculated coverage for #{length(coverage)} modules")

    coverage
  end

  @doc """
  Orchestrates the complete overlay analysis pipeline.

  Runs all analysis phases and returns a complete result map with:
  - dead_code: functions in static but not in dynamic
  - ghost_paths: functions in dynamic but not in static
  - module_coverage: per-module coverage metrics
  - summary: high-level statistics

  ## Options

    * `:static_path` - Path to archeology-results.json (required)
    * `:dynamic_path` - Path to dynamic-traces.json (required)
    * `:hot_threshold` - Coverage threshold for hot modules (default: 75)
    * `:cold_threshold` - Coverage threshold for cold modules (default: 25)

  ## Returns

  A map with all analysis results.
  """
  @spec analyze(keyword()) :: %{
          dead_code: [static_function()],
          ghost_paths: [%{String.t() => String.t() | non_neg_integer()}],
          module_coverage: [%{String.t() => String.t() | number() | boolean()}],
          summary: %{
            dead_code_count: non_neg_integer(),
            ghost_path_count: non_neg_integer(),
            modules_analyzed: non_neg_integer(),
            avg_coverage_pct: float(),
            hot_module_count: non_neg_integer(),
            cold_module_count: non_neg_integer()
          }
        }
  def analyze(opts) do
    static_path = Keyword.fetch!(opts, :static_path)
    dynamic_path = Keyword.fetch!(opts, :dynamic_path)
    hot_threshold = Keyword.get(opts, :hot_threshold, 75)
    cold_threshold = Keyword.get(opts, :cold_threshold, 25)

    Logger.debug("Starting overlay analysis...")
    Logger.debug("Static data: #{static_path}")
    Logger.debug("Dynamic data: #{dynamic_path}")

    # Load data
    static_data = load_static_data(static_path)
    dynamic_data = load_dynamic_data(dynamic_path)

    # Run all analyses
    dead_code = detect_dead_code(static_data, dynamic_data)
    ghost_paths = detect_ghost_paths(static_data, dynamic_data)

    coverage_opts = [hot_threshold: hot_threshold, cold_threshold: cold_threshold]
    module_coverage = calculate_coverage(static_data, dynamic_data, coverage_opts)

    # Calculate summary statistics
    avg_coverage =
      if length(module_coverage) > 0 do
        total_coverage = Enum.reduce(module_coverage, 0, fn cov, acc -> acc + cov["coverage_pct"] end)
        total_coverage / length(module_coverage) |> Float.round(1)
      else
        0.0
      end

    hot_modules = Enum.filter(module_coverage, & &1["hot_path"])
    cold_modules = Enum.filter(module_coverage, & &1["cold_path"])

    summary = %{
      "dead_code_count" => length(dead_code),
      "ghost_path_count" => length(ghost_paths),
      "modules_analyzed" => length(module_coverage),
      "avg_coverage_pct" => avg_coverage,
      "hot_module_count" => length(hot_modules),
      "cold_module_count" => length(cold_modules)
    }

    Logger.debug("Analysis complete:")
    Logger.debug("  Dead code: #{summary["dead_code_count"]}")
    Logger.debug("  Ghost paths: #{summary["ghost_path_count"]}")
    Logger.debug("  Modules: #{summary["modules_analyzed"]}")
    Logger.debug("  Avg coverage: #{summary["avg_coverage_pct"]}%")

    %{
      dead_code: dead_code,
      ghost_paths: ghost_paths,
      module_coverage: module_coverage,
      summary: summary
    }
  end
end
