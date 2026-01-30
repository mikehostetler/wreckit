defmodule Cybernetic.Health.Monitor do
  @moduledoc """
  Health monitoring service for the entire VSM system.
  Tracks the health of all components and provides a unified health status.
  """
  use GenServer
  require Logger

  # 5 seconds
  @check_interval 5_000
  # Number of failed checks before marking unhealthy
  @unhealthy_threshold 3

  defstruct [
    :checks,
    :status,
    :last_check,
    :failures
  ]

  # Public API

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def status do
    GenServer.call(__MODULE__, :status)
  catch
    :exit, _ -> %{status: :unknown, error: "Health monitor not running"}
  end

  def detailed_status do
    GenServer.call(__MODULE__, :detailed_status)
  catch
    :exit, _ -> %{status: :unknown, error: "Health monitor not running"}
  end

  def check_component(component) do
    GenServer.call(__MODULE__, {:check_component, component})
  catch
    :exit, _ -> {:error, "Health monitor not running"}
  end

  # Server Callbacks

  @impl true
  def init(_opts) do
    state = %__MODULE__{
      checks: %{},
      status: :initializing,
      last_check: nil,
      failures: %{}
    }

    # Schedule first health check
    Process.send_after(self(), :perform_checks, 1000)

    Logger.info("Health Monitor initialized")
    {:ok, state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    {:reply, %{status: state.status, last_check: state.last_check}, state}
  end

  @impl true
  def handle_call(:detailed_status, _from, state) do
    detailed = %{
      overall_status: state.status,
      last_check: state.last_check,
      components: state.checks,
      failures: state.failures
    }

    {:reply, detailed, state}
  end

  @impl true
  def handle_call({:check_component, component}, _from, state) do
    result = perform_component_check(component)
    {:reply, result, state}
  end

  @impl true
  def handle_info({:telemetry_event, _metadata, _measurements}, state) do
    # Ignore telemetry events - they're handled elsewhere
    {:noreply, state}
  end

  @impl true
  def handle_info(:perform_checks, state) do
    # Perform all health checks
    new_checks = %{
      rabbitmq: check_rabbitmq(),
      redis: check_redis(),
      prometheus: check_prometheus(),
      vsm_layers: check_vsm_layers(),
      s4_service: check_s4_service(),
      memory_system: check_memory_system(),
      disk_space: check_disk_space(),
      memory_usage: check_memory_usage()
    }

    # Update failure counts
    new_failures = update_failures(state.failures, new_checks)

    # Determine overall status
    overall_status = determine_overall_status(new_checks, new_failures)

    # Broadcast status change if needed
    if overall_status != state.status do
      broadcast_status_change(overall_status, new_checks)
    end

    new_state = %{
      state
      | checks: new_checks,
        status: overall_status,
        last_check: DateTime.utc_now(),
        failures: new_failures
    }

    # Schedule next check
    Process.send_after(self(), :perform_checks, @check_interval)

    {:noreply, new_state}
  end

  # Private Functions

  defp check_rabbitmq do
    try do
      config = Application.get_env(:cybernetic, :amqp, [])
      url = config[:url] || "amqp://cybernetic:changeme@localhost:5672"

      case AMQP.Connection.open(url) do
        {:ok, conn} ->
          AMQP.Connection.close(conn)
          :healthy

        _ ->
          :unhealthy
      end
    rescue
      _ -> :unhealthy
    end
  end

  defp check_redis do
    try do
      # Try without password first (local dev)
      case Redix.start_link(host: "localhost", port: 6379) do
        {:ok, conn} ->
          case Redix.command(conn, ["PING"]) do
            {:ok, "PONG"} ->
              GenServer.stop(conn)
              :healthy

            _ ->
              GenServer.stop(conn)
              :unhealthy
          end

        _ ->
          # Try with password (production)
          case Redix.start_link(host: "localhost", port: 6379, password: "changeme") do
            {:ok, conn} ->
              GenServer.stop(conn)
              :healthy

            _ ->
              :unhealthy
          end
      end
    rescue
      _ -> :unhealthy
    end
  end

  defp check_prometheus do
    try do
      case HTTPoison.get("http://localhost:9090/-/healthy") do
        {:ok, %{status_code: 200}} -> :healthy
        _ -> :unhealthy
      end
    rescue
      _ -> :unhealthy
    end
  end

  defp check_vsm_layers do
    layers = [:system1, :system2, :system3, :system4, :system5]

    results =
      Enum.map(layers, fn layer ->
        process_name =
          case layer do
            :system1 -> Cybernetic.VSM.System1.Operational
            :system2 -> Cybernetic.VSM.System2.Coordinator
            :system3 -> Cybernetic.VSM.System3.Control
            :system4 -> Cybernetic.VSM.System4.Service
            :system5 -> Cybernetic.VSM.System5.Policy
          end

        case Process.whereis(process_name) do
          nil ->
            {layer, :down}

          pid when is_pid(pid) ->
            if Process.alive?(pid) do
              {layer, :healthy}
            else
              {layer, :unhealthy}
            end
        end
      end)

    Map.new(results)
  end

  defp check_s4_service do
    try do
      stats = Cybernetic.VSM.System4.Service.stats()

      if is_map(stats) do
        :healthy
      else
        :unhealthy
      end
    rescue
      _ -> :unhealthy
    end
  end

  defp check_memory_system do
    try do
      stats = Cybernetic.VSM.System4.Memory.stats()

      if is_map(stats) && Map.has_key?(stats, :total_entries) do
        :healthy
      else
        :unhealthy
      end
    rescue
      _ -> :unhealthy
    end
  end

  defp check_disk_space do
    case :disksup.get_disk_data() do
      [_ | _] = disks ->
        # Check if any disk is above 90% usage
        critical =
          Enum.any?(disks, fn {_mount, _size, usage} ->
            usage > 90
          end)

        if critical, do: :critical, else: :healthy

      _ ->
        :unknown
    end
  end

  defp check_memory_usage do
    case :memsup.get_memory_data() do
      {total, _allocated, _worst} ->
        usage_percent = :erlang.memory(:total) / total * 100

        cond do
          usage_percent > 90 -> :critical
          usage_percent > 75 -> :warning
          true -> :healthy
        end

      _ ->
        :unknown
    end
  end

  defp perform_component_check(component) do
    case component do
      :rabbitmq -> check_rabbitmq()
      :redis -> check_redis()
      :prometheus -> check_prometheus()
      :vsm_layers -> check_vsm_layers()
      :s4_service -> check_s4_service()
      :memory_system -> check_memory_system()
      :disk_space -> check_disk_space()
      :memory_usage -> check_memory_usage()
      _ -> {:error, "Unknown component"}
    end
  end

  defp update_failures(failures, checks) do
    Enum.reduce(checks, failures, fn {component, status}, acc ->
      case status do
        :healthy ->
          Map.delete(acc, component)

        :unhealthy ->
          Map.update(acc, component, 1, &(&1 + 1))

        _ ->
          acc
      end
    end)
  end

  defp determine_overall_status(checks, failures) do
    unhealthy_count = Enum.count(failures, fn {_k, v} -> v >= @unhealthy_threshold end)
    critical_components = [:rabbitmq, :vsm_layers]

    critical_unhealthy =
      Enum.any?(critical_components, fn comp ->
        case checks[comp] do
          :unhealthy ->
            Map.get(failures, comp, 0) >= @unhealthy_threshold

          %{} = layer_checks when comp == :vsm_layers ->
            Enum.any?(layer_checks, fn {_layer, status} -> status != :healthy end)

          _ ->
            false
        end
      end)

    cond do
      critical_unhealthy -> :critical
      unhealthy_count > 2 -> :degraded
      unhealthy_count > 0 -> :warning
      true -> :healthy
    end
  end

  defp broadcast_status_change(new_status, checks) do
    :telemetry.execute(
      [:cybernetic, :health, :status_change],
      %{status: new_status},
      %{checks: checks}
    )

    Logger.info("Health status changed to: #{new_status}")
  end
end
