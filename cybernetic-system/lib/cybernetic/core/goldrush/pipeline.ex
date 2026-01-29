defmodule Cybernetic.Core.Goldrush.Pipeline do
  @moduledoc "Telemetry → Goldrush plugins → algedonic out"
  use GenServer
  require Logger

  @in_evt [:cybernetic, :work, :finished]
  @out_evt [:cybernetic, :algedonic]

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(_opts) do
    # Attach once; the handler forwards samples into plugin chain
    :telemetry.attach_many(
      {:gr_in, make_ref()},
      [@in_evt],
      &__MODULE__.handle_telemetry/4,
      nil
    )

    {:ok, %{plugins: load_plugins()}}
  end

  @doc false
  @spec handle_telemetry(list(), map(), map(), term()) :: :ok
  def handle_telemetry(event, meas, meta, _cfg) do
    # Forward to the GenServer for processing
    GenServer.cast(__MODULE__, {:telemetry_event, event, meas, meta})
  end

  def handle_cast({:telemetry_event, event, meas, meta}, state) do
    # Simple envelope → plugin pipeline
    msg = %{event: event, meas: meas, meta: meta}

    case run_plugins(msg, state.plugins) do
      {:ok, %{severity: sev} = out} when sev in [:pain, :pleasure] ->
        :telemetry.execute(@out_evt, %{severity: sev}, Map.drop(out, [:severity]))

      _ ->
        :ok
    end

    {:noreply, state}
  end

  defp load_plugins do
    # Discover from your plugin registry or code list for smoke test
    [Cybernetic.Core.Goldrush.Plugins.LatencyToAlgedonic]
  end

  defp run_plugins(msg, plugins) do
    Enum.reduce_while(plugins, {:ok, msg}, fn mod, {:ok, m} ->
      case apply(mod, :process, [m]) do
        {:ok, m2} -> {:cont, {:ok, m2}}
        {:halt, m2} -> {:halt, {:ok, m2}}
        {:error, r} -> {:halt, {:error, r}}
      end
    end)
  end
end
