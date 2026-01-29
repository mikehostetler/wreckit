defmodule Cybernetic.Edge.WASM.Validator.WasmexImpl do
  @moduledoc """
  Production WASM validator with enhanced security and monitoring.
  Provides deterministic sandboxed execution with fuel limiting.
  """
  @behaviour Cybernetic.Edge.WASM.Behaviour
  require Logger

  @telemetry [:cybernetic, :wasm, :validator]

  @impl true
  def load(bytes, opts) do
    if not wasmex_available?() do
      {:error, :wasmex_not_available}
    else
      fuel = Keyword.get(opts, :fuel, 5_000_000)
      max_pages = Keyword.get(opts, :max_memory_pages, 64)

      start_time = System.monotonic_time(:microsecond)

      with {:ok, store} <- apply(Wasmex.Store, :new, [[limits: %{fuel: fuel}]]),
           {:ok, module} <- apply(Wasmex.Module, :compile, [store, bytes]),
           {:ok, imports} <- build_imports(store),
           {:ok, instance} <-
             apply(Wasmex.Instance, :new, [
               store,
               module,
               imports,
               [fuel: fuel, memory_limits: %{max_pages: max_pages}]
             ]) do
        load_time = System.monotonic_time(:microsecond) - start_time
        :telemetry.execute(@telemetry ++ [:loaded], %{duration_us: load_time}, %{})

        {:ok, %{instance: instance, store: store, fuel_limit: fuel}}
      else
        {:error, r} ->
          Logger.error("WASM load failed: #{inspect(r)}")
          {:error, r}

        other ->
          {:error, other}
      end
    end
  end

  @impl true
  def validate(validator_state, message, opts) do
    if not wasmex_available?() do
      {:error, :wasmex_not_available}
    else
      %{instance: instance, store: store, fuel_limit: fuel_limit} = validator_state
      timeout = Keyword.get(opts, :timeout_ms, 50)

      # Reset fuel for each validation
      :ok = apply(Wasmex.Store, :set_fuel, [store, fuel_limit])

      start_time = System.monotonic_time(:microsecond)
      json = Jason.encode!(message)

      # Add security context
      context = %{
        timestamp: System.system_time(:millisecond),
        nonce: :crypto.strong_rand_bytes(16) |> Base.encode16()
      }

      result =
        apply(Wasmex.Instance, :call_exported_function, [
          instance,
          "validate",
          [json, Jason.encode!(context)],
          [timeout: timeout]
        ])

      validation_time = System.monotonic_time(:microsecond) - start_time

      fuel_consumed =
        try do
          fuel_limit - apply(Wasmex.Store, :fuel_remaining, [store])
        rescue
          # If fuel tracking fails, report 0 consumption
          _ -> 0
        end

      :telemetry.execute(
        @telemetry ++ [:executed],
        %{
          duration_us: validation_time,
          fuel_consumed: fuel_consumed
        },
        %{result: if(is_tuple(result), do: elem(result, 0), else: :unknown)}
      )

      case result do
        {:ok, 0} ->
          {:ok, %{valid: true, fuel_consumed: fuel_consumed, duration_us: validation_time}}

        {:ok, code} when is_integer(code) ->
          {:error,
           %{
             valid: false,
             error_code: code,
             error_message: decode_error(code),
             fuel_consumed: fuel_consumed
           }}

        {:error, :timeout} ->
          Logger.warning("WASM validation timeout after #{timeout}ms")
          {:error, :validation_timeout}

        {:error, :out_of_fuel} ->
          Logger.warning("WASM exhausted fuel limit: #{fuel_limit}")
          {:error, :fuel_exhausted}

        {:error, reason} ->
          {:error, reason}

        other ->
          {:error, {:unexpected_return, other}}
      end
    end
  rescue
    e ->
      Logger.error("WASM validation exception: #{Exception.format(:error, e, __STACKTRACE__)}")
      {:error, {:exception, e}}
  end

  defp wasmex_available? do
    Code.ensure_loaded?(Wasmex.Store) and Code.ensure_loaded?(Wasmex.Module) and
      Code.ensure_loaded?(Wasmex.Instance)
  end

  defp build_imports(_store) do
    # Host functions available to WASM
    {:ok,
     %{
       "env" => %{
         # Current timestamp for validation
         "host_time_ms" => fn -> System.system_time(:millisecond) end,

         # Secure random for nonces
         "host_random" => fn size ->
           :crypto.strong_rand_bytes(size) |> :binary.decode_unsigned()
         end,

         # HMAC for signatures
         "host_hmac_sha256" => fn data, key ->
           :crypto.mac(:hmac, :sha256, key, data) |> Base.encode16()
         end,

         # Logging for debugging  
         "host_log" => fn level, msg ->
           # Safe atom conversion with whitelist
           safe_level =
             case level do
               "debug" -> :debug
               "info" -> :info
               "warning" -> :warning
               "error" -> :error
               # Default to info for unknown levels
               _ -> :info
             end

           Logger.log(safe_level, "WASM: #{msg}")
           0
         end
       }
     }}
  end

  defp decode_error(code) do
    case code do
      1 -> "Invalid JSON input"
      2 -> "Missing required field"
      3 -> "Invalid message signature"
      4 -> "Timestamp outside allowed window"
      5 -> "Invalid or replay nonce"
      6 -> "Permission denied"
      7 -> "Resource limit exceeded"
      _ -> "Unknown error code: #{code}"
    end
  end
end
