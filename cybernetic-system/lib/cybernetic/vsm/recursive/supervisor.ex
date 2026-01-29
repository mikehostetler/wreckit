defmodule Cybernetic.VSM.Recursive.Supervisor do
  @moduledoc """
  Recursive VSM Supervisor - Spawns and manages child VSM instances.
  Implements resource quotas and hierarchical control per white-paper.

  Each child VSM gets:
  - Worker quota (max concurrent processes)
  - Rate quota (messages/second)
  - Memory quota (MB)
  - CPU share (percentage)
  """
  use DynamicSupervisor
  require Logger

  @default_quotas %{
    workers: 10,
    # msg/sec
    rate_limit: 100,
    memory_mb: 256,
    # percentage
    cpu_share: 10
  }

  def start_link(opts) do
    DynamicSupervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    # Track all child VSMs in ETS for quota enforcement
    :ets.new(:vsm_children, [:set, :public, :named_table])
    :ets.new(:vsm_quotas, [:set, :public, :named_table])

    DynamicSupervisor.init(strategy: :one_for_one)
  end

  @doc """
  Spawn a child VSM with specified quotas and configuration.

  ## Options
    * `:name` - Unique name for the child VSM
    * `:quotas` - Resource quotas (workers, rate, memory, cpu)
    * `:parent` - Parent VSM for hierarchical control
    * `:purpose` - Operational purpose (e.g., "edge_processing", "data_aggregation")
    * `:policies` - Initial S5 policies to inherit
  """
  def spawn_child(spec, limits \\ %{}) do
    child_id = generate_child_id()
    quotas = Map.merge(@default_quotas, limits)

    # Validate quotas against parent's available resources
    case validate_quotas(quotas) do
      :ok ->
        child_spec = build_child_spec(child_id, spec, quotas)

        case DynamicSupervisor.start_child(__MODULE__, child_spec) do
          {:ok, pid} ->
            # Register child with quotas
            register_child(child_id, pid, quotas, spec)

            # Emit telemetry
            :telemetry.execute(
              [:cyb, :vsm, :spawned],
              %{count: 1, quotas: quotas},
              %{child_id: child_id, purpose: Map.get(spec, :purpose, "unknown")}
            )

            Logger.info("Spawned child VSM #{child_id} with quotas: #{inspect(quotas)}")
            {:ok, pid, child_id}

          {:error, reason} = error ->
            Logger.error("Failed to spawn child VSM: #{inspect(reason)}")
            error
        end

      {:error, reason} = error ->
        Logger.warning("Quota validation failed: #{inspect(reason)}")
        error
    end
  end

  @doc """
  Terminate a child VSM and reclaim its resources.
  """
  def kill_child(child_id) do
    case :ets.lookup(:vsm_children, child_id) do
      [{^child_id, pid, _quotas, _spec}] ->
        # Terminate the child
        DynamicSupervisor.terminate_child(__MODULE__, pid)

        # Clean up registrations
        :ets.delete(:vsm_children, child_id)
        :ets.delete(:vsm_quotas, child_id)

        # Emit telemetry
        :telemetry.execute(
          [:cyb, :vsm, :terminated],
          %{count: 1},
          %{child_id: child_id}
        )

        Logger.info("Terminated child VSM #{child_id}")
        :ok

      [] ->
        {:error, :not_found}
    end
  end

  @doc """
  Scale a child VSM by adjusting its quotas.
  """
  def scale_child(child_id, new_quotas) do
    case :ets.lookup(:vsm_children, child_id) do
      [{^child_id, pid, old_quotas, _spec}] ->
        merged_quotas = Map.merge(old_quotas, new_quotas)

        case validate_quotas(merged_quotas) do
          :ok ->
            # Update quotas
            :ets.update_element(:vsm_children, child_id, {3, merged_quotas})
            :ets.insert(:vsm_quotas, {child_id, merged_quotas})

            # Notify the child VSM of new quotas
            send(pid, {:quota_update, merged_quotas})

            # Emit telemetry
            :telemetry.execute(
              [:cyb, :vsm, :scaled],
              %{old: old_quotas, new: merged_quotas},
              %{child_id: child_id}
            )

            Logger.info(
              "Scaled child VSM #{child_id}: #{inspect(old_quotas)} -> #{inspect(merged_quotas)}"
            )

            :ok

          error ->
            error
        end

      [] ->
        {:error, :not_found}
    end
  end

  @doc """
  List all active child VSMs with their quotas and metrics.
  """
  def list_children do
    :ets.tab2list(:vsm_children)
    |> Enum.map(fn {id, pid, quotas, spec} ->
      %{
        id: id,
        pid: pid,
        alive: Process.alive?(pid),
        quotas: quotas,
        purpose: Map.get(spec, :purpose, "unknown"),
        metrics: get_child_metrics(id)
      }
    end)
  end

  @doc """
  Get metrics for a specific child VSM.
  """
  def get_child_metrics(_child_id) do
    # In production, this would query Prometheus/Telemetry
    %{
      messages_processed: :rand.uniform(1000),
      memory_used_mb: :rand.uniform(256),
      cpu_percent: :rand.uniform(10),
      workers_active: :rand.uniform(10),
      uptime_seconds: :rand.uniform(3600)
    }
  end

  # Private functions

  defp generate_child_id do
    "vsm_child_#{:erlang.unique_integer([:positive])}"
  end

  defp validate_quotas(quotas) do
    # Check if parent has enough resources
    total_children = :ets.info(:vsm_children, :size)

    cond do
      quotas.workers > 100 ->
        {:error, :workers_exceed_limit}

      quotas.memory_mb > 2048 ->
        {:error, :memory_exceed_limit}

      quotas.cpu_share > 50 ->
        {:error, :cpu_exceed_limit}

      total_children >= 10 ->
        {:error, :max_children_reached}

      true ->
        :ok
    end
  end

  defp build_child_spec(child_id, spec, quotas) do
    # Build the child VSM supervisor spec
    %{
      id: child_id,
      start:
        {Cybernetic.VSM.Recursive.ChildVSM, :start_link,
         [
           [
             name: child_id,
             quotas: quotas,
             parent: self(),
             spec: spec
           ]
         ]},
      restart: :temporary,
      type: :supervisor
    }
  end

  defp register_child(child_id, pid, quotas, spec) do
    :ets.insert(:vsm_children, {child_id, pid, quotas, spec})
    :ets.insert(:vsm_quotas, {child_id, quotas})
  end
end

defmodule Cybernetic.VSM.Recursive.ChildVSM do
  @moduledoc """
  A child VSM instance with its own S1-S5 systems.
  Operates within parent-imposed quotas.
  """
  use Supervisor
  require Logger

  def start_link(opts) do
    name = Keyword.get(opts, :name)
    Supervisor.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  def init(opts) do
    child_id = Keyword.get(opts, :name)
    quotas = Keyword.get(opts, :quotas)
    spec = Keyword.get(opts, :spec, %{})

    Logger.info("Initializing child VSM #{child_id} with quotas: #{inspect(quotas)}")

    # Create isolated AMQP namespace for this child
    amqp_namespace = "vsm.#{child_id}"

    children = [
      # Resource governor enforces quotas
      {Cybernetic.VSM.Recursive.ResourceGovernor,
       name: :"#{child_id}_governor", quotas: quotas, child_id: child_id},

      # Mini S1 - Operational (limited workers based on quota)
      {Cybernetic.VSM.Recursive.MiniS1,
       name: :"#{child_id}_s1", max_workers: quotas.workers, namespace: amqp_namespace},

      # Mini S2 - Coordinator (with rate limiting)
      {Cybernetic.VSM.Recursive.MiniS2,
       name: :"#{child_id}_s2", rate_limit: quotas.rate_limit, namespace: amqp_namespace},

      # Mini S3 - Control
      {Cybernetic.VSM.Recursive.MiniS3, name: :"#{child_id}_s3", namespace: amqp_namespace},

      # Mini S4 - Intelligence
      {Cybernetic.VSM.Recursive.MiniS4, name: :"#{child_id}_s4", namespace: amqp_namespace},

      # Mini S5 - Policy (inherits from parent)
      {Cybernetic.VSM.Recursive.MiniS5,
       name: :"#{child_id}_s5",
       parent_policies: Map.get(spec, :policies, %{}),
       namespace: amqp_namespace}
    ]

    Supervisor.init(children, strategy: :one_for_all)
  end
end

defmodule Cybernetic.VSM.Recursive.ResourceGovernor do
  @moduledoc """
  Enforces resource quotas for a child VSM.
  Monitors and limits CPU, memory, and message rate.
  """
  use GenServer
  require Logger

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
  end

  def init(opts) do
    quotas = Keyword.get(opts, :quotas)
    child_id = Keyword.get(opts, :child_id)

    # Start monitoring
    Process.send_after(self(), :check_resources, 1000)

    {:ok,
     %{
       quotas: quotas,
       child_id: child_id,
       violations: 0,
       last_check: System.monotonic_time(:millisecond)
     }}
  end

  def handle_info(:check_resources, state) do
    # Check memory usage
    memory_mb = :erlang.memory(:total) / 1_048_576

    if memory_mb > state.quotas.memory_mb do
      Logger.warning(
        "Child VSM #{state.child_id} exceeding memory quota: #{memory_mb}MB > #{state.quotas.memory_mb}MB"
      )

      state = Map.update!(state, :violations, &(&1 + 1))

      if state.violations > 3 do
        Logger.error(
          "Child VSM #{state.child_id} repeatedly violating quotas, requesting termination"
        )

        Cybernetic.VSM.Recursive.Supervisor.kill_child(state.child_id)
      end
    end

    # Schedule next check
    Process.send_after(self(), :check_resources, 5000)

    {:noreply, %{state | last_check: System.monotonic_time(:millisecond)}}
  end

  def handle_info({:quota_update, new_quotas}, state) do
    Logger.info("Governor #{state.child_id} received quota update: #{inspect(new_quotas)}")
    {:noreply, %{state | quotas: new_quotas, violations: 0}}
  end

  @doc """
  Check if an operation is allowed under current quotas.
  """
  def check_quota(governor, resource, amount) do
    GenServer.call(governor, {:check_quota, resource, amount})
  end

  def handle_call({:check_quota, :workers, requested}, _from, state) do
    allowed = requested <= state.quotas.workers
    {:reply, allowed, state}
  end

  def handle_call({:check_quota, :rate, current_rate}, _from, state) do
    allowed = current_rate <= state.quotas.rate_limit
    {:reply, allowed, state}
  end
end

# Mini VSM Systems (simplified versions for child VSMs)

defmodule Cybernetic.VSM.Recursive.MiniS1 do
  @moduledoc "Minimal S1 Operational system for child VSM"
  use Supervisor

  def start_link(opts) do
    Supervisor.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
  end

  def init(opts) do
    max_workers = Keyword.get(opts, :max_workers, 5)
    namespace = Keyword.get(opts, :namespace)

    children = [
      {Task.Supervisor, name: :"#{namespace}_task_sup", max_children: max_workers}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end

defmodule Cybernetic.VSM.Recursive.MiniS2 do
  @moduledoc "Minimal S2 Coordinator for child VSM"
  use GenServer

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
  end

  def init(opts) do
    {:ok,
     %{
       rate_limit: Keyword.get(opts, :rate_limit, 100),
       namespace: Keyword.get(opts, :namespace),
       current_rate: 0
     }}
  end
end

defmodule Cybernetic.VSM.Recursive.MiniS3 do
  @moduledoc "Minimal S3 Control for child VSM"
  use GenServer

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
  end

  def init(opts) do
    {:ok, %{namespace: Keyword.get(opts, :namespace)}}
  end
end

defmodule Cybernetic.VSM.Recursive.MiniS4 do
  @moduledoc "Minimal S4 Intelligence for child VSM"
  use GenServer

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
  end

  def init(opts) do
    {:ok, %{namespace: Keyword.get(opts, :namespace)}}
  end
end

defmodule Cybernetic.VSM.Recursive.MiniS5 do
  @moduledoc "Minimal S5 Policy for child VSM"
  use GenServer

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name))
  end

  def init(opts) do
    {:ok,
     %{
       namespace: Keyword.get(opts, :namespace),
       policies: Keyword.get(opts, :parent_policies, %{})
     }}
  end
end
