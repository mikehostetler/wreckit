defmodule Cybernetic.Intelligence.Zombie.Detector do
  @moduledoc """
  Process heartbeat monitoring and zombie detection.

  Tracks registered processes and detects:
  - Missing heartbeats (process not responding)
  - Hung processes (no progress within timeout)
  - Memory bloat (excessive memory growth)

  ## Usage

      # Register a process for monitoring
      :ok = Detector.register(self(), %{name: "worker_1", timeout_ms: 60_000})

      # Send periodic heartbeats
      :ok = Detector.heartbeat(self())

      # Report progress (resets hung detection)
      :ok = Detector.report_progress(self(), %{items_processed: 100})

      # Check for zombies
      zombies = Detector.list_zombies()
  """
  use GenServer

  require Logger

  @type process_id :: pid() | {atom(), node()}
  @type process_state :: :healthy | :warning | :zombie | :dead

  @type restart_spec :: {module(), atom(), list()} | nil

  @type monitored_process :: %{
          pid: process_id(),
          name: String.t(),
          ref: reference(),
          timeout_ms: pos_integer(),
          last_heartbeat: DateTime.t(),
          last_progress: DateTime.t(),
          progress_data: map(),
          state: process_state(),
          memory_baseline: non_neg_integer(),
          restart_mfa: restart_spec(),
          registered_at: DateTime.t()
        }

  @default_timeout_ms 60_000
  @default_check_interval_ms 10_000
  # 5x baseline = zombie
  @memory_growth_threshold 5.0

  # MFA whitelist for restart security - only allow calls to known safe modules
  # Configure via Application.put_env(:cybernetic, :zombie_restart_whitelist, [MyModule])
  @default_mfa_whitelist [
    Supervisor,
    DynamicSupervisor,
    GenServer,
    Task.Supervisor,
    Registry
  ]

  @telemetry [:cybernetic, :intelligence, :zombie]

  # Client API

  @doc "Start the zombie detector"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Register a process for monitoring"
  @spec register(process_id(), map(), keyword()) ::
          {:ok, reference()} | {:error, :process_not_alive}
  def register(pid, config \\ %{}, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:register, pid, config})
  end

  @doc "Unregister a process"
  @spec unregister(process_id(), keyword()) :: :ok
  def unregister(pid, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:unregister, pid})
  end

  @doc "Send a heartbeat from a monitored process"
  @spec heartbeat(process_id(), keyword()) :: :ok
  def heartbeat(pid, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.cast(server, {:heartbeat, pid})
  end

  @doc "Report progress (resets hung detection timer)"
  @spec report_progress(process_id(), map(), keyword()) :: :ok
  def report_progress(pid, progress_data, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.cast(server, {:progress, pid, progress_data})
  end

  @doc "List all zombie processes"
  @spec list_zombies(keyword()) :: [monitored_process()]
  def list_zombies(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :list_zombies)
  end

  @doc "List all monitored processes"
  @spec list_all(keyword()) :: [monitored_process()]
  def list_all(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :list_all)
  end

  @doc "Get status of a specific process"
  @spec get_status(process_id(), keyword()) :: {:ok, monitored_process()} | {:error, :not_found}
  def get_status(pid, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:get_status, pid})
  end

  @doc "Force restart a zombie process (if restart_fn provided)"
  @spec restart_zombie(process_id(), keyword()) :: :ok | {:error, term()}
  def restart_zombie(pid, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:restart_zombie, pid})
  end

  @doc "Get statistics"
  @spec stats(keyword()) :: map()
  def stats(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :stats)
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    Logger.info("Zombie Detector starting")

    state = %{
      processes: %{},
      check_interval: Keyword.get(opts, :check_interval_ms, @default_check_interval_ms),
      default_timeout: Keyword.get(opts, :default_timeout_ms, @default_timeout_ms),
      # Optional callback
      on_zombie: Keyword.get(opts, :on_zombie, nil),
      stats: %{
        zombies_detected: 0,
        processes_restarted: 0,
        heartbeats_received: 0
      }
    }

    schedule_check(state.check_interval)

    {:ok, state}
  end

  @impl true
  def handle_call({:register, pid, config}, _from, state) do
    # Verify process is alive before monitoring
    if not Process.alive?(pid) do
      {:reply, {:error, :process_not_alive}, state}
    else
      now = DateTime.utc_now()

      # Monitor the process for DOWN messages
      ref = Process.monitor(pid)

      # Get initial memory
      memory_baseline = get_process_memory(pid)

      # Convert restart_fn to MFA if provided as function (with warning)
      restart_mfa =
        normalize_restart_spec(Map.get(config, :restart_mfa) || Map.get(config, :restart_fn))

      process = %{
        pid: pid,
        name: Map.get(config, :name, inspect(pid)),
        ref: ref,
        timeout_ms: Map.get(config, :timeout_ms, state.default_timeout),
        last_heartbeat: now,
        last_progress: now,
        progress_data: %{},
        state: :healthy,
        memory_baseline: memory_baseline,
        restart_mfa: restart_mfa,
        registered_at: now
      }

      new_processes = Map.put(state.processes, pid, process)

      Logger.debug("Registered process for zombie monitoring",
        pid: inspect(pid),
        name: process.name
      )

      emit_telemetry(:process_registered, %{pid: inspect(pid), name: process.name})

      {:reply, {:ok, ref}, %{state | processes: new_processes}}
    end
  end

  @impl true
  def handle_call({:unregister, pid}, _from, state) do
    case Map.get(state.processes, pid) do
      nil ->
        {:reply, :ok, state}

      process ->
        Process.demonitor(process.ref, [:flush])
        new_processes = Map.delete(state.processes, pid)
        {:reply, :ok, %{state | processes: new_processes}}
    end
  end

  @impl true
  def handle_call(:list_zombies, _from, state) do
    zombies =
      state.processes
      |> Map.values()
      |> Enum.filter(&(&1.state == :zombie))

    {:reply, zombies, state}
  end

  @impl true
  def handle_call(:list_all, _from, state) do
    processes = Map.values(state.processes)
    {:reply, processes, state}
  end

  @impl true
  def handle_call({:get_status, pid}, _from, state) do
    case Map.get(state.processes, pid) do
      nil -> {:reply, {:error, :not_found}, state}
      process -> {:reply, {:ok, process}, state}
    end
  end

  @impl true
  def handle_call({:restart_zombie, pid}, _from, state) do
    case Map.get(state.processes, pid) do
      nil ->
        {:reply, {:error, :not_found}, state}

      %{state: :zombie, restart_mfa: {mod, fun, args}} = process ->
        # Validate MFA against whitelist before executing
        if mfa_whitelisted?(mod) do
          Logger.warning("Restarting zombie process", pid: inspect(pid), name: process.name)

          try do
            apply(mod, fun, args)

            new_stats = Map.update!(state.stats, :processes_restarted, &(&1 + 1))
            new_processes = Map.delete(state.processes, pid)

            emit_telemetry(:zombie_restarted, %{pid: inspect(pid), name: process.name})

            {:reply, :ok, %{state | processes: new_processes, stats: new_stats}}
          rescue
            e ->
              {:reply, {:error, Exception.message(e)}, state}
          end
        else
          Logger.warning("Rejected restart: module not whitelisted",
            pid: inspect(pid),
            module: mod,
            whitelist: mfa_whitelist()
          )

          {:reply, {:error, :module_not_whitelisted}, state}
        end

      %{state: :zombie} ->
        {:reply, {:error, :no_restart_mfa}, state}

      _ ->
        {:reply, {:error, :not_zombie}, state}
    end
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      state.stats
      |> Map.put(:monitored_count, map_size(state.processes))
      |> Map.put(:healthy_count, count_by_state(state.processes, :healthy))
      |> Map.put(:warning_count, count_by_state(state.processes, :warning))
      |> Map.put(:zombie_count, count_by_state(state.processes, :zombie))

    {:reply, stats, state}
  end

  @impl true
  def handle_cast({:heartbeat, pid}, state) do
    new_state =
      case Map.get(state.processes, pid) do
        nil ->
          state

        process ->
          now = DateTime.utc_now()

          updated = %{
            process
            | last_heartbeat: now,
              state: if(process.state == :zombie, do: :healthy, else: process.state)
          }

          new_processes = Map.put(state.processes, pid, updated)
          new_stats = Map.update!(state.stats, :heartbeats_received, &(&1 + 1))

          %{state | processes: new_processes, stats: new_stats}
      end

    {:noreply, new_state}
  end

  @impl true
  def handle_cast({:progress, pid, progress_data}, state) do
    new_state =
      case Map.get(state.processes, pid) do
        nil ->
          state

        process ->
          now = DateTime.utc_now()

          updated = %{
            process
            | last_progress: now,
              progress_data: Map.merge(process.progress_data, progress_data),
              state: :healthy
          }

          new_processes = Map.put(state.processes, pid, updated)
          %{state | processes: new_processes}
      end

    {:noreply, new_state}
  end

  @impl true
  def handle_info(:check_processes, state) do
    now = DateTime.utc_now()

    {new_processes, zombies_found} =
      Enum.reduce(state.processes, {%{}, 0}, fn {pid, process}, {acc, count} ->
        {updated_process, is_new_zombie} = check_process_health(process, now)

        {Map.put(acc, pid, updated_process), count + if(is_new_zombie, do: 1, else: 0)}
      end)

    # Execute zombie callback if configured
    if zombies_found > 0 and is_function(state.on_zombie) do
      zombies = Enum.filter(new_processes, fn {_pid, p} -> p.state == :zombie end)

      Enum.each(zombies, fn {pid, process} ->
        state.on_zombie.(pid, process)
      end)
    end

    new_stats =
      if zombies_found > 0 do
        Map.update!(state.stats, :zombies_detected, &(&1 + zombies_found))
      else
        state.stats
      end

    schedule_check(state.check_interval)

    {:noreply, %{state | processes: new_processes, stats: new_stats}}
  end

  @impl true
  def handle_info({:DOWN, ref, :process, pid, reason}, state) do
    case find_by_ref(state.processes, ref) do
      nil ->
        {:noreply, state}

      {_pid, process} ->
        Logger.info("Monitored process died",
          pid: inspect(pid),
          name: process.name,
          reason: inspect(reason)
        )

        emit_telemetry(:process_died, %{
          pid: inspect(pid),
          name: process.name,
          reason: inspect(reason)
        })

        new_processes = Map.delete(state.processes, pid)
        {:noreply, %{state | processes: new_processes}}
    end
  end

  # Private Functions

  @spec check_process_health(monitored_process(), DateTime.t()) ::
          {monitored_process(), boolean()}
  defp check_process_health(process, now) do
    heartbeat_age_ms = DateTime.diff(now, process.last_heartbeat, :millisecond)
    progress_age_ms = DateTime.diff(now, process.last_progress, :millisecond)
    current_memory = get_process_memory(process.pid)

    memory_ratio =
      if process.memory_baseline > 0 do
        current_memory / process.memory_baseline
      else
        1.0
      end

    cond do
      # Process is dead
      not Process.alive?(process.pid) ->
        {%{process | state: :dead}, false}

      # No heartbeat for too long = zombie
      heartbeat_age_ms > process.timeout_ms ->
        is_new = process.state != :zombie

        if is_new do
          Logger.warning("Zombie detected: no heartbeat",
            pid: inspect(process.pid),
            name: process.name,
            age_ms: heartbeat_age_ms
          )

          emit_telemetry(:zombie_detected, %{
            pid: inspect(process.pid),
            name: process.name,
            reason: :no_heartbeat
          })
        end

        {%{process | state: :zombie}, is_new}

      # No progress for too long = zombie
      progress_age_ms > process.timeout_ms * 2 ->
        is_new = process.state != :zombie

        if is_new do
          Logger.warning("Zombie detected: no progress",
            pid: inspect(process.pid),
            name: process.name,
            age_ms: progress_age_ms
          )

          emit_telemetry(:zombie_detected, %{
            pid: inspect(process.pid),
            name: process.name,
            reason: :no_progress
          })
        end

        {%{process | state: :zombie}, is_new}

      # Memory bloat = zombie
      memory_ratio > @memory_growth_threshold ->
        is_new = process.state != :zombie

        if is_new do
          Logger.warning("Zombie detected: memory bloat",
            pid: inspect(process.pid),
            name: process.name,
            memory_ratio: memory_ratio
          )

          emit_telemetry(:zombie_detected, %{
            pid: inspect(process.pid),
            name: process.name,
            reason: :memory_bloat
          })
        end

        {%{process | state: :zombie}, is_new}

      # Warning threshold (50% of timeout)
      heartbeat_age_ms > process.timeout_ms * 0.5 ->
        {%{process | state: :warning}, false}

      # Healthy
      true ->
        {%{process | state: :healthy}, false}
    end
  end

  @spec get_process_memory(process_id()) :: non_neg_integer()
  defp get_process_memory(pid) when is_pid(pid) do
    case Process.info(pid, :memory) do
      {:memory, bytes} -> bytes
      nil -> 0
    end
  end

  defp get_process_memory(_), do: 0

  @spec find_by_ref(map(), reference()) :: {pid(), monitored_process()} | nil
  defp find_by_ref(processes, ref) do
    Enum.find(processes, fn {_pid, process} -> process.ref == ref end)
  end

  @spec count_by_state(map(), process_state()) :: non_neg_integer()
  defp count_by_state(processes, state) do
    Enum.count(processes, fn {_pid, p} -> p.state == state end)
  end

  defp schedule_check(interval) do
    Process.send_after(self(), :check_processes, interval)
  end

  @spec normalize_restart_spec(term()) :: restart_spec()
  defp normalize_restart_spec(nil), do: nil

  defp normalize_restart_spec({m, f, a}) when is_atom(m) and is_atom(f) and is_list(a),
    do: {m, f, a}

  defp normalize_restart_spec(fun) when is_function(fun, 0) do
    Logger.warning(
      "restart_fn as anonymous function is deprecated, use restart_mfa: {Mod, :fun, []} instead"
    )

    # Wrap function in a module call - but warn that this won't work across nodes
    nil
  end

  defp normalize_restart_spec(_), do: nil

  # MFA whitelist security helpers
  @spec mfa_whitelist() :: [module()]
  defp mfa_whitelist do
    Application.get_env(:cybernetic, :zombie_restart_whitelist, @default_mfa_whitelist)
  end

  @spec mfa_whitelisted?(module()) :: boolean()
  defp mfa_whitelisted?(mod) when is_atom(mod) do
    mod in mfa_whitelist()
  end

  @spec emit_telemetry(atom(), map()) :: :ok
  defp emit_telemetry(event, metadata) do
    :telemetry.execute(@telemetry ++ [event], %{count: 1}, metadata)
  end
end
