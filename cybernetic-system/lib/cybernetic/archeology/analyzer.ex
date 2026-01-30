defmodule Cybernetic.Archeology.Analyzer do
  @moduledoc """
  Analyzes traces to identify shared modules and patterns.
  """

  require Logger

  @type shared_module :: %{
          module: module(),
          trace_count: non_neg_integer(),
          trace_ids: [String.t()],
          function_count: non_neg_integer(),
          functions: [Cybernetic.Archeology.Catalog.function_ref()]
        }

  @doc """
  Identifies modules that appear in multiple traces.
  """
  @spec shared_modules([Cybernetic.Archeology.Tracer.trace()]) :: [shared_module()]
  def shared_modules(traces) do
    Logger.debug("Analyzing shared modules across #{length(traces)} traces...")

    # Build a map of modules to their trace appearances
    module_map =
      Enum.reduce(traces, %{}, fn trace, acc ->
        # Get unique modules in this trace
        modules =
          trace.functions
          |> Enum.map(& &1.module)
          |> Enum.uniq()

        # Update module map
        Enum.reduce(modules, acc, fn module, inner_acc ->
          Map.update(inner_acc, module, %{
            trace_ids: [trace.entry_point_id],
            functions: Enum.filter(trace.functions, fn fn_ref -> fn_ref.module == module end)
          }, fn existing ->
            %{existing |
              trace_ids: [trace.entry_point_id | existing.trace_ids] |> Enum.uniq(),
              functions:
                (existing.functions ++
                  Enum.filter(trace.functions, fn fn_ref -> fn_ref.module == module end))
                |> Enum.uniq_by(fn fn_ref -> {fn_ref.function, fn_ref.arity} end)
            }
          end)
        end)
      end)

    # Filter to modules appearing in 2+ traces
    shared_modules =
      module_map
      |> Enum.filter(fn {_module, data} ->
        length(data.trace_ids) >= 2
      end)
      |> Enum.map(fn {module, data} ->
        %{
          module: module,
          trace_count: length(data.trace_ids),
          trace_ids: Enum.sort(data.trace_ids),
          function_count: length(data.functions),
          functions: data.functions
        }
      end)
      |> Enum.sort_by(&(-&1.trace_count))

    Logger.debug("Found #{length(shared_modules)} shared modules")

    shared_modules
  end

  @doc """
  Generates a summary of trace statistics.
  """
  @spec trace_summary([Cybernetic.Archeology.Tracer.trace()]) :: map()
  def trace_summary(traces) do
    total_functions =
      traces
      |> Enum.flat_map(& &1.functions)
      |> Enum.uniq_by(fn fn_ref -> {fn_ref.module, fn_ref.function, fn_ref.arity} end)
      |> length()

    total_modules =
      traces
      |> Enum.flat_map(& &1.functions)
      |> Enum.map(& &1.module)
      |> Enum.uniq()
      |> length()

    avg_trace_length =
      if length(traces) > 0 do
        total =
          traces
          |> Enum.map(&length(&1.functions))
          |> Enum.sum()

        total / length(traces)
      else
        0
      end

    %{
      trace_count: length(traces),
      total_functions: total_functions,
      total_modules: total_modules,
      avg_trace_length: Float.round(avg_trace_length, 2)
    }
  end
end
