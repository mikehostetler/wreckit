defmodule Cybernetic.Archeology.Orphans do
  @moduledoc """
  Detects orphan functions - public functions with zero trace references.

  Orphans are public functions (def) that are not called by any function
  in the execution traces from entry points.
  """

  require Logger

  @type orphan_function :: %{
          module: module(),
          function: atom(),
          arity: non_neg_integer(),
          file: String.t(),
          line: non_neg_integer(),
          reason: :no_callers | :only_private_callers | :test_function | :callback
        }

  @doc """
  Detects orphan functions by comparing the catalog against traces.
  """
  @spec detect(Cybernetic.Archeology.Catalog.catalog(), [Cybernetic.Archeology.Tracer.trace()]) :: [orphan_function()]
  def detect(catalog, traces) do
    Logger.debug("Detecting orphan functions...")

    # Get all functions referenced in traces
    traced_functions =
      traces
      |> Enum.flat_map(& &1.functions)
      |> Enum.map(fn fn_ref -> {fn_ref.module, fn_ref.function, fn_ref.arity} end)
      |> MapSet.new()

    # Find all public functions
    all_public_functions =
      Enum.filter(catalog.functions, fn fn_ref ->
        fn_ref.type == :public
      end)

    # Filter to functions not in traces
    potential_orphans =
      Enum.reject(all_public_functions, fn fn_ref ->
        key = {fn_ref.module, fn_ref.function, fn_ref.arity}
        MapSet.member?(traced_functions, key)
      end)

    # Classify orphans by reason
    orphans =
      potential_orphans
      |> Enum.map(&classify_orphan(&1, catalog))
      |> Enum.reject(&is_nil/1)

    Logger.debug("Found #{length(orphans)} orphan functions")

    orphans
  end

  # Classify orphan functions by the reason they're not in traces
  defp classify_orphan(fn_ref, catalog) do
    cond do
      # Test functions
      is_test_function?(fn_ref) ->
        nil

      # Callback functions (GenServer, etc.)
      is_callback_function?(fn_ref) ->
        nil

      # Functions with only private callers
      has_only_private_callers?(fn_ref, catalog) ->
        Map.put(fn_ref, :reason, :only_private_callers)

      # Functions with no callers at all
      has_no_callers?(fn_ref, catalog) ->
        Map.put(fn_ref, :reason, :no_callers)

      # Default
      true ->
        Map.put(fn_ref, :reason, :no_callers)
    end
  end

  defp is_test_function?(fn_ref) do
    module_name = Module.split(fn_ref.module) |> Enum.join(".") |> String.downcase()
    function_name = to_string(fn_ref.function)

    String.contains?(module_name, "test") or
      String.contains?(function_name, "test")
  end

  defp is_callback_function?(fn_ref) do
    # Common OTP callback functions
    callbacks = [
      :init, :handle_call, :handle_cast, :handle_info, :terminate, :code_change,
      :handle_continue, :format_status, :handle_debug,
      :start_link, :child_spec, :init, :post_init,
      :handle_events, :handle_subscription, :cancellable?,
      :perform, :timeout, :retry_at,
      :init, :call, :cast, :stream, :crawl,
      :call, :handle_call, :handle_cast, :handle_info
    ]

    fn_ref.function in callbacks
  end

  defp has_only_private_callers?(fn_ref, catalog) do
    callers = Cybernetic.Archeology.Catalog.get_callers(fn_ref, catalog)

    # Check if all callers are private functions
    callers != [] and Enum.all?(callers, &(&1.type == :private))
  end

  defp has_no_callers?(fn_ref, catalog) do
    callers = Cybernetic.Archeology.Catalog.get_callers(fn_ref, catalog)
    callers == []
  end
end
