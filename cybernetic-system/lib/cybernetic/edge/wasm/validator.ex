defmodule Cybernetic.Edge.WASM.Validator do
  @moduledoc """
  Loads and runs WASM validators to pre-validate messages at the edge.

  Default export expected in WASM: `(func (export "validate") (param i32 i32) (result i32))`
  where the param pair points to a UTF-8 JSON slice of the message; return 0 = ok, nonzero = error.
  """
  @behaviour Cybernetic.Edge.WASM.Behaviour
  require Logger

  @telemetry [:cybernetic, :edge, :wasm, :validate]
  @default_limits [fuel: 5_000_000, timeout_ms: 50, max_memory_pages: 64]

  # Cache the implementation selection
  @implementation (cond do
                     System.find_executable("wasmtime") != nil ->
                       Cybernetic.Edge.WASM.Validator.PortImpl

                     Code.ensure_loaded?(Wasmex) ->
                       Cybernetic.Edge.WASM.Validator.WasmexImpl

                     true ->
                       Cybernetic.Edge.WASM.Validator.NoopImpl
                   end)

  @impl true
  def load(bytes, opts \\ []) when is_binary(bytes) do
    # Merge defaults first, then user opts override
    @implementation.load(bytes, Keyword.merge(@default_limits, opts))
  end

  @impl true
  def validate(instance, message, opts \\ []) when is_map(message) do
    start = System.monotonic_time()
    :telemetry.execute(@telemetry ++ [:start], %{count: 1}, %{opts: opts})

    # Merge defaults first, then user opts override
    res = @implementation.validate(instance, message, Keyword.merge(@default_limits, opts))

    :telemetry.execute(
      @telemetry ++ [:stop],
      %{duration: System.monotonic_time() - start},
      %{result: if(is_tuple(res), do: elem(res, 0), else: :unknown)}
    )

    res
  rescue
    e ->
      :telemetry.execute(@telemetry ++ [:exception], %{count: 1}, %{error: e})
      {:error, {:exception, e}}
  end

  @doc """
  Returns the current WASM implementation being used.
  """
  def implementation, do: @implementation
end
