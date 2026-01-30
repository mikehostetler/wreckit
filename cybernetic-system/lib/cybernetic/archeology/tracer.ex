defmodule Cybernetic.Archeology.Tracer do
  @moduledoc """
  Generates execution traces from entry points using depth-first search.

  Traces the call graph from each entry point to discover all execution paths.
  """

  require Logger

  @type trace :: %{
          entry_point_id: String.t(),
          functions: [Cybernetic.Archeology.Catalog.function_ref()],
          depth: non_neg_integer(),
          metadata: map()
        }

  @doc """
  Generates execution traces for all entry points.
  """
  @spec trace_all([Cybernetic.Archeology.EntryPoints.entry_point()], Cybernetic.Archeology.Catalog.catalog()) :: [trace()]
  def trace_all(entry_points, catalog) do
    Logger.debug("Generating traces for #{length(entry_points)} entry points...")

    entry_points
    |> Enum.map(fn entry_point ->
      trace(entry_point, catalog)
    end)
  end

  @doc """
  Generates an execution trace for a single entry point.
  """
  @spec trace(Cybernetic.Archeology.EntryPoints.entry_point(), Cybernetic.Archeology.Catalog.catalog()) :: trace()
  def trace(entry_point, catalog) do
    Logger.debug("Tracing entry point: #{entry_point.type} #{entry_point.module}.#{entry_point.function}/#{entry_point.arity}")

    # Start DFS from the entry point function
    start_fn_ref = %{
      module: entry_point.module,
      function: entry_point.function,
      arity: entry_point.arity,
      file: entry_point.file,
      line: entry_point.line,
      type: :public
    }

    visited = MapSet.new()
    trace = trace_function_dfs(start_fn_ref, catalog, visited, 0, max_depth())

    %{
      entry_point_id: entry_point.id,
      functions: trace,
      depth: get_max_depth(trace),
      metadata: %{
        entry_point: entry_point
      }
    }
  end

  # DFS tracing
  defp trace_function_dfs(fn_ref, catalog, visited, current_depth, max_depth) do
    # Check depth limit
    if current_depth >= max_depth do
      [fn_ref]
    else
      # Create a key for cycle detection
      fn_key = {fn_ref.module, fn_ref.function, fn_ref.arity}

      # Check for cycles
      if MapSet.member?(visited, fn_key) do
        [fn_ref]
      else
        # Mark as visited
        visited = MapSet.put(visited, fn_key)

        # Get all callees
        callees = Cybernetic.Archeology.Catalog.get_callees(fn_ref, catalog)

        # Recursively trace each callee
        callee_traces =
          Enum.map(callees, fn callee ->
            trace_function_dfs(callee, catalog, visited, current_depth + 1, max_depth)
          end)

        # Combine traces
        [fn_ref | List.flatten(callee_traces)]
      end
    end
  end

  defp max_depth do
    # Maximum trace depth to prevent infinite recursion
    # This can be configured via environment variable
    case System.get_env("ARCHAEOLOGY_MAX_DEPTH") do
      nil -> 50
      depth ->
        case Integer.parse(depth) do
          {n, ""} -> n
          _ -> 50
        end
    end
  end

  defp get_max_depth(trace) do
    # Calculate maximum depth of the trace
    # Depth is determined by the longest path from entry point
    trace
    |> Enum.map(fn _fn_ref ->
      # Count occurrences of each module.function/arity
      # to estimate depth (this is a simplification)
      1
    end)
    |> Enum.sum()
  end
end
