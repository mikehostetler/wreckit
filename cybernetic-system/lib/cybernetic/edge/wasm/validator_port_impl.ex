defmodule Cybernetic.Edge.WASM.Validator.PortImpl do
  @moduledoc """
  Production WASM validator using external wasmtime CLI via Port.

  This avoids rustler dependency conflicts while providing full WASM security.
  Requires wasmtime CLI to be installed: https://wasmtime.dev/

  ## Temp File Management
  The WASM bytecode is written to a temp file for wasmtime to execute.
  **IMPORTANT**: You MUST call `cleanup/1` when done with the validator to remove 
  the temp file, or temp files will accumulate. Consider using a process to manage
  the validator lifecycle and call cleanup in the terminate callback.
  """
  @behaviour Cybernetic.Edge.WASM.Behaviour
  require Logger

  @telemetry [:cybernetic, :wasm, :port]

  @impl true
  def load(wasm_bytes, opts) do
    # Write WASM to temporary file
    temp_path =
      Path.join(System.tmp_dir!(), "validator_#{:erlang.unique_integer([:positive])}.wasm")

    try do
      File.write!(temp_path, wasm_bytes)

      # Verify WASM is valid
      case System.cmd(wasmtime_path(), ["compile", temp_path]) do
        {_, 0} ->
          {:ok,
           %{
             wasm_path: temp_path,
             fuel_limit: Keyword.get(opts, :fuel, 5_000_000),
             max_memory: Keyword.get(opts, :max_memory_pages, 64)
           }}

        {error, _} ->
          File.rm(temp_path)
          {:error, {:invalid_wasm, error}}
      end
    rescue
      e ->
        # Only try to remove if file exists
        if File.exists?(temp_path), do: File.rm(temp_path)
        {:error, {:load_failed, e}}
    end
  end

  @doc """
  Clean up the temporary WASM file.
  Call this when done with the validator instance.
  """
  def cleanup(%{wasm_path: path}) when is_binary(path) do
    case File.rm(path) do
      :ok ->
        :ok

      # Already deleted
      {:error, :enoent} ->
        :ok

      {:error, reason} = error ->
        Logger.warning("Failed to cleanup WASM temp file #{path}: #{inspect(reason)}")
        error
    end
  end

  def cleanup(_), do: :ok

  @impl true
  def validate(validator_state, message, opts) do
    %{wasm_path: wasm_path, fuel_limit: fuel, max_memory: max_mem} = validator_state
    timeout = Keyword.get(opts, :timeout_ms, 50)

    # Prepare JSON input
    json_input = Jason.encode!(message)

    # Build wasmtime command with security constraints
    args = [
      "run",
      "--fuel",
      to_string(fuel),
      # pages to bytes
      "--max-memory-size",
      "#{max_mem * 64 * 1024}",
      # No --dir flag means no filesystem access
      "--env",
      "WASM_ENV=secure",
      wasm_path,
      "--",
      json_input
    ]

    # Run with timeout using Port
    port =
      Port.open({:spawn_executable, wasmtime_path()}, [
        :binary,
        :exit_status,
        args: args,
        line: 1024
      ])

    # Set timeout with a reference to verify sender
    timer_ref = make_ref()
    timer = Process.send_after(self(), {:kill_port, port, timer_ref}, timeout)

    start_time = System.monotonic_time(:microsecond)
    result = collect_port_output(port, timeout, timer_ref, timer)
    duration = System.monotonic_time(:microsecond) - start_time

    :telemetry.execute(
      @telemetry ++ [:executed],
      %{duration_us: duration},
      %{result: if(is_tuple(result), do: elem(result, 0), else: :unknown)}
    )

    case result do
      {:ok, output} ->
        parse_validation_result(output, duration)

      {:error, :timeout} ->
        {:error, :validation_timeout}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # Private functions

  defp collect_port_output(port, timeout, timer_ref, timer) do
    collect_port_output(port, timeout, timer_ref, timer, [])
  end

  defp collect_port_output(port, timeout, timer_ref, timer, acc) do
    receive do
      {^port, {:data, data}} ->
        collect_port_output(port, timeout, timer_ref, timer, [data | acc])

      {^port, {:exit_status, 0}} ->
        # Cancel timer since we completed successfully
        Process.cancel_timer(timer)
        # Flush any pending timer message
        receive do
          {:kill_port, ^port, ^timer_ref} -> :ok
        after
          0 -> :ok
        end

        output = acc |> Enum.reverse() |> IO.iodata_to_binary()
        {:ok, output}

      {^port, {:exit_status, code}} ->
        Process.cancel_timer(timer)
        # Flush any pending timer message
        receive do
          {:kill_port, ^port, ^timer_ref} -> :ok
        after
          0 -> :ok
        end

        {:error, {:wasm_exit, code}}

      {:kill_port, ^port, ^timer_ref} ->
        # Only close if this is our timer message
        if Port.info(port) != nil do
          Port.close(port)
        end

        {:error, :timeout}
    end
  end

  defp parse_validation_result(output, duration) do
    # Parse WASM output - expecting "0" for valid or error code
    trimmed = String.trim(output)

    cond do
      trimmed == "0" ->
        {:ok, %{valid: true, duration_us: duration}}

      Regex.match?(~r/^\d+$/, trimmed) ->
        code = String.to_integer(trimmed)

        {:error,
         %{
           valid: false,
           error_code: code,
           error_message: decode_error(code),
           duration_us: duration
         }}

      true ->
        Logger.warning("Unexpected WASM output: #{inspect(trimmed)}")
        {:error, {:invalid_output, trimmed}}
    end
  end

  defp decode_error(code) do
    case code do
      1 -> "Invalid JSON input"
      2 -> "Missing required field"
      3 -> "Invalid signature"
      4 -> "Expired timestamp"
      5 -> "Invalid nonce"
      _ -> "Unknown error: #{code}"
    end
  end

  # Find wasmtime at runtime, not compile time
  defp wasmtime_path do
    System.find_executable("wasmtime") || "/usr/local/bin/wasmtime"
  end
end
