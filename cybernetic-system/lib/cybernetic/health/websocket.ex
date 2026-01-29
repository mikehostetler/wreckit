defmodule Cybernetic.Health.WebSocket do
  @moduledoc """
  WebSocket server for real-time health monitoring.
  Broadcasts system health updates to connected clients.
  """
  use GenServer
  require Logger

  # 2 seconds
  @broadcast_interval 2_000

  defstruct [
    :clients,
    :last_broadcast
  ]

  # Public API

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def register_client(client_pid) do
    GenServer.cast(__MODULE__, {:register, client_pid})
  end

  def unregister_client(client_pid) do
    GenServer.cast(__MODULE__, {:unregister, client_pid})
  end

  def broadcast_update(data) do
    GenServer.cast(__MODULE__, {:broadcast, data})
  end

  # Server Callbacks

  @impl true
  def init(_opts) do
    state = %__MODULE__{
      clients: [],
      last_broadcast: nil
    }

    # Schedule periodic broadcasts
    Process.send_after(self(), :periodic_broadcast, @broadcast_interval)

    # Subscribe to telemetry events
    :telemetry.attach(
      "websocket-health",
      [:cybernetic, :health, :status_change],
      &__MODULE__.handle_health_event/4,
      nil
    )

    Logger.info("Health WebSocket server initialized")
    {:ok, state}
  end

  @impl true
  def handle_cast({:register, client_pid}, state) do
    Process.monitor(client_pid)

    # Send initial status to new client
    send_health_update(client_pid)

    new_state = %{state | clients: [client_pid | state.clients]}
    Logger.info("WebSocket client registered: #{inspect(client_pid)}")

    {:noreply, new_state}
  end

  @impl true
  def handle_cast({:unregister, client_pid}, state) do
    new_clients = List.delete(state.clients, client_pid)
    {:noreply, %{state | clients: new_clients}}
  end

  @impl true
  def handle_cast({:broadcast, data}, state) do
    broadcast_to_clients(state.clients, data)
    {:noreply, %{state | last_broadcast: System.system_time(:millisecond)}}
  end

  @impl true
  def handle_info(:periodic_broadcast, state) do
    # Get current health status
    health_data = gather_health_data()

    # Broadcast to all clients
    broadcast_to_clients(state.clients, health_data)

    # Schedule next broadcast
    Process.send_after(self(), :periodic_broadcast, @broadcast_interval)

    {:noreply, %{state | last_broadcast: System.system_time(:millisecond)}}
  end

  @impl true
  def handle_info({:DOWN, _ref, :process, pid, _reason}, state) do
    # Remove disconnected client
    new_clients = List.delete(state.clients, pid)
    Logger.info("WebSocket client disconnected: #{inspect(pid)}")
    {:noreply, %{state | clients: new_clients}}
  end

  @impl true
  def handle_info({:health_event, data}, state) do
    # Immediate broadcast on health status change
    broadcast_to_clients(state.clients, data)
    {:noreply, state}
  end

  # Private Functions

  defp gather_health_data do
    %{
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
      health: Cybernetic.Health.Monitor.detailed_status(),
      metrics: Cybernetic.Health.Collector.current_metrics(),
      system: %{
        node: node(),
        uptime_ms: System.system_time(:millisecond),
        vm_memory: :erlang.memory(),
        schedulers: System.schedulers_online()
      }
    }
  end

  defp broadcast_to_clients(clients, data) do
    message =
      Jason.encode!(%{
        type: "health_update",
        data: data
      })

    Enum.each(clients, fn client ->
      send(client, {:websocket_push, message})
    end)
  end

  defp send_health_update(client_pid) do
    data = gather_health_data()

    message =
      Jason.encode!(%{
        type: "initial_status",
        data: data
      })

    send(client_pid, {:websocket_push, message})
  end

  def handle_health_event(_event_name, measurements, metadata, _config) do
    send(__MODULE__, {:health_event, %{measurements: measurements, metadata: metadata}})
  end
end
