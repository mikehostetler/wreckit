defmodule Cybernetic.Integrations.OhMyOpencode.VSMBridge do
  @moduledoc """
  VSM State Bridge for oh-my-opencode integration.

  Provides bidirectional state synchronization between Cybernetic's VSM
  systems (S1-S5) and oh-my-opencode's agent orchestration layer.

  ## Features

  - **State Sync**: Push/pull VSM state snapshots
  - **Delta Updates**: Efficient incremental state changes via CRDT
  - **Event Bridge**: PubSub relay for cross-platform events
  - **Context Sharing**: Shared knowledge graphs and context

  ## Architecture

  ```
  Cybernetic VSM          VSM Bridge              oh-my-opencode
  ┌─────────────┐        ┌──────────┐           ┌─────────────┐
  │ S5 Policy   │◄──────►│          │◄─────────►│ Policy/Auth │
  │ S4 Intel    │◄──────►│  State   │◄─────────►│ LLM Router  │
  │ S3 Control  │◄──────►│  Bridge  │◄─────────►│ Tool Ctrl   │
  │ S2 Coord    │◄──────►│          │◄─────────►│ Session Mgr │
  │ S1 Ops      │◄──────►│          │◄─────────►│ Operations  │
  └─────────────┘        └──────────┘           └─────────────┘
  ```

  ## Usage

      # Push current state to oh-my-opencode
      VSMBridge.push_state(tenant_id)

      # Subscribe to state changes from oh-my-opencode
      VSMBridge.subscribe(tenant_id)

      # Get merged state view
      {:ok, state} = VSMBridge.get_merged_state(tenant_id)
  """

  use GenServer
  require Logger

  # Note: We use simple delta maps instead of BeliefSet GenServer for simplicity
  alias Cybernetic.Schemas.VSM.SystemState
  alias Cybernetic.Repo

  import Ecto.Query

  @pubsub Cybernetic.PubSub
  @state_topic "vsm_bridge:state"
  @event_topic "vsm_bridge:events"

  # Sync interval in milliseconds
  @default_sync_interval_ms 5_000
  # Reserved for staleness detection - stale states older than this are refreshed
  # @max_state_age_ms 30_000

  defstruct [
    :tenant_id,
    :sync_interval_ms,
    :local_states,
    :remote_states,
    :belief_set,
    :last_sync_at,
    :subscribers
  ]

  # Public API

  @doc """
  Start the VSM bridge for a tenant.
  """
  def start_link(opts \\ []) do
    tenant_id = Keyword.fetch!(opts, :tenant_id)
    name = Keyword.get(opts, :name, via_tuple(tenant_id))
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Push current VSM state to remote (oh-my-opencode).
  """
  def push_state(tenant_id, opts \\ []) do
    GenServer.call(via_tuple(tenant_id), {:push_state, opts})
  end

  @doc """
  Pull remote state and merge with local.
  """
  def pull_state(tenant_id, opts \\ []) do
    GenServer.call(via_tuple(tenant_id), {:pull_state, opts})
  end

  @doc """
  Get merged state view combining local and remote.
  """
  def get_merged_state(tenant_id) do
    GenServer.call(via_tuple(tenant_id), :get_merged_state)
  end

  @doc """
  Get state for a specific VSM system (1-5).
  """
  def get_system_state(tenant_id, system) when system in 1..5 do
    GenServer.call(via_tuple(tenant_id), {:get_system_state, system})
  end

  @doc """
  Update local state for a system.
  """
  def update_system_state(tenant_id, system, state_update) when system in 1..5 do
    GenServer.call(via_tuple(tenant_id), {:update_system_state, system, state_update})
  end

  @doc """
  Subscribe to state changes.
  """
  def subscribe(tenant_id) do
    Phoenix.PubSub.subscribe(@pubsub, "#{@state_topic}:#{tenant_id}")
  end

  @doc """
  Publish an event to be relayed to oh-my-opencode.
  """
  def publish_event(tenant_id, event_type, payload) do
    GenServer.cast(via_tuple(tenant_id), {:publish_event, event_type, payload})
  end

  @doc """
  Register as event listener for oh-my-opencode events.
  """
  def subscribe_events(tenant_id) do
    Phoenix.PubSub.subscribe(@pubsub, "#{@event_topic}:#{tenant_id}")
  end

  @doc """
  Get bridge status and statistics.
  """
  def status(tenant_id) do
    GenServer.call(via_tuple(tenant_id), :status)
  end

  # GenServer callbacks

  @impl true
  def init(opts) do
    tenant_id = Keyword.fetch!(opts, :tenant_id)
    sync_interval = Keyword.get(opts, :sync_interval_ms, @default_sync_interval_ms)

    state = %__MODULE__{
      tenant_id: tenant_id,
      sync_interval_ms: sync_interval,
      local_states: %{},
      remote_states: %{},
      belief_set: %{},
      last_sync_at: nil,
      subscribers: MapSet.new()
    }

    # Load initial local state from database
    state = load_local_states(state)

    # Schedule periodic sync
    if sync_interval > 0 do
      schedule_sync(sync_interval)
    end

    Logger.info("VSM Bridge started for tenant #{tenant_id}")
    {:ok, state}
  end

  @impl true
  def handle_call({:push_state, opts}, _from, state) do
    # Wrap in telemetry span for dynamic tracing
    {result, _metadata} =
      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :vsm_bridge, operation: :push_state, tenant_id: state.tenant_id},
        fn ->
          force = Keyword.get(opts, :force, false)
          systems = Keyword.get(opts, :systems, 1..5 |> Enum.to_list())

          # push_system_state currently always succeeds (placeholder for remote API)
          deltas =
            Enum.map(systems, fn system ->
              {:ok, delta} = push_system_state(state, system, force)
              {system, delta}
            end)

          broadcast_state_change(state.tenant_id, :pushed, deltas)

          result = {:ok, deltas}

          metadata = %{
            systems_count: length(systems),
            tenant_id: state.tenant_id
          }

          {result, metadata}
        end
      )

    {:reply, result, %{state | last_sync_at: DateTime.utc_now()}}
  end

  @impl true
  def handle_call({:pull_state, opts}, _from, state) do
    # Wrap in telemetry span for dynamic tracing
    {result, _metadata} =
      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :vsm_bridge, operation: :pull_state, tenant_id: state.tenant_id},
        fn ->
          systems = Keyword.get(opts, :systems, 1..5 |> Enum.to_list())

          # Simulate pulling from remote - in production this would call oh-my-opencode API
          remote_updates =
            Enum.map(systems, fn system ->
              {system, get_remote_state(state.tenant_id, system)}
            end)

          _new_remote_states =
            Enum.reduce(remote_updates, state.remote_states, fn {system, remote_state}, acc ->
              Map.put(acc, system, remote_state)
            end)

          broadcast_state_change(state.tenant_id, :pulled, remote_updates)

          result = {:ok, remote_updates}

          metadata = %{
            systems_count: length(systems),
            tenant_id: state.tenant_id
          }

          {result, metadata}
        end
      )

    new_state = %{state | last_sync_at: DateTime.utc_now()}

    {:reply, result, new_state}
  end

  @impl true
  def handle_call(:get_merged_state, _from, state) do
    merged =
      1..5
      |> Enum.map(fn system ->
        local = Map.get(state.local_states, system, %{})
        remote = Map.get(state.remote_states, system, %{})
        {system, merge_states(local, remote)}
      end)
      |> Map.new()

    {:reply, {:ok, merged}, state}
  end

  @impl true
  def handle_call({:get_system_state, system}, _from, state) do
    local = Map.get(state.local_states, system, %{})
    remote = Map.get(state.remote_states, system, %{})
    merged = merge_states(local, remote)

    {:reply, {:ok, %{local: local, remote: remote, merged: merged}}, state}
  end

  @impl true
  def handle_call({:update_system_state, system, update}, _from, state) do
    current = Map.get(state.local_states, system, %{})
    new_local = Map.merge(current, update)

    # Update belief set with delta
    delta = compute_delta(current, new_local)
    new_belief_set = apply_delta_to_belief_set(state.belief_set, system, delta)

    new_state = %{
      state
      | local_states: Map.put(state.local_states, system, new_local),
        belief_set: new_belief_set
    }

    # Persist to database
    persist_system_state(state.tenant_id, system, new_local)

    # Broadcast change
    broadcast_state_change(state.tenant_id, :updated, [{system, delta}])

    {:reply, {:ok, delta}, new_state}
  end

  @impl true
  def handle_call(:status, _from, state) do
    status = %{
      tenant_id: state.tenant_id,
      sync_interval_ms: state.sync_interval_ms,
      last_sync_at: state.last_sync_at,
      local_systems: Map.keys(state.local_states),
      remote_systems: Map.keys(state.remote_states),
      belief_set_size: map_size(state.belief_set),
      subscriber_count: MapSet.size(state.subscribers)
    }

    {:reply, {:ok, status}, state}
  end

  @impl true
  def handle_cast({:publish_event, event_type, payload}, state) do
    event = %{
      type: event_type,
      payload: payload,
      tenant_id: state.tenant_id,
      timestamp: DateTime.utc_now(),
      source: :cybernetic
    }

    # Broadcast locally
    Phoenix.PubSub.broadcast(@pubsub, "#{@event_topic}:#{state.tenant_id}", {:vsm_event, event})

    # In production, also send to oh-my-opencode via HTTP/WebSocket
    relay_event_to_remote(event)

    {:noreply, state}
  end

  @impl true
  def handle_cast({:receive_remote_event, event}, state) do
    # Handle event from oh-my-opencode
    Logger.debug("Received remote event: #{inspect(event)}")

    # Broadcast to local subscribers
    Phoenix.PubSub.broadcast(
      @pubsub,
      "#{@event_topic}:#{state.tenant_id}",
      {:remote_vsm_event, event}
    )

    {:noreply, state}
  end

  @impl true
  def handle_info(:sync, state) do
    # Periodic sync
    new_state =
      case sync_all(state) do
        {:ok, updated_state} -> updated_state
        {:error, _reason} -> state
      end

    schedule_sync(state.sync_interval_ms)
    {:noreply, new_state}
  end

  @impl true
  def handle_info(_msg, state) do
    {:noreply, state}
  end

  # Private helpers

  defp via_tuple(tenant_id) do
    {:via, Registry, {Cybernetic.Integrations.Registry, {__MODULE__, tenant_id}}}
  end

  defp schedule_sync(interval_ms) when interval_ms > 0 do
    Process.send_after(self(), :sync, interval_ms)
  end

  defp schedule_sync(_), do: :ok

  defp load_local_states(state) do
    states =
      SystemState
      |> where([s], s.tenant_id == ^state.tenant_id)
      |> Repo.all()
      |> Enum.map(fn system_state ->
        {system_state.system, system_state.state}
      end)
      |> Map.new()

    %{state | local_states: states}
  rescue
    _ -> state
  end

  defp persist_system_state(tenant_id, system, state_data) do
    attrs = %{
      tenant_id: tenant_id,
      system: system,
      state: state_data,
      metadata: %{updated_by: "vsm_bridge"}
    }

    case Repo.get_by(SystemState, tenant_id: tenant_id, system: system) do
      nil ->
        %SystemState{}
        |> SystemState.changeset(attrs)
        |> Repo.insert()

      existing ->
        existing
        |> SystemState.update_changeset(attrs)
        |> Repo.update()
    end
  rescue
    e ->
      Logger.warning("Failed to persist system state: #{inspect(e)}")
      {:error, e}
  end

  defp push_system_state(state, system, _force) do
    local = Map.get(state.local_states, system, %{})

    # In production, this would POST to oh-my-opencode API
    # For now, we just compute what would be sent
    delta = compute_delta(%{}, local)
    {:ok, delta}
  end

  defp get_remote_state(_tenant_id, _system) do
    # In production, this would GET from oh-my-opencode API
    # For now, return empty placeholder
    %{}
  end

  defp relay_event_to_remote(_event) do
    # In production, this would POST to oh-my-opencode webhook/WebSocket
    :ok
  end

  defp sync_all(state) do
    # Full bidirectional sync
    with {:ok, _} <- push_all_states(state),
         {:ok, remote_updates} <- pull_all_states(state) do
      new_remote_states =
        Enum.reduce(remote_updates, state.remote_states, fn {system, remote_state}, acc ->
          Map.put(acc, system, remote_state)
        end)

      {:ok, %{state | remote_states: new_remote_states, last_sync_at: DateTime.utc_now()}}
    end
  end

  defp push_all_states(state) do
    results =
      Enum.map(state.local_states, fn {system, _} ->
        push_system_state(state, system, false)
      end)

    if Enum.all?(results, &match?({:ok, _}, &1)) do
      {:ok, results}
    else
      {:error, :push_failed}
    end
  end

  defp pull_all_states(state) do
    remote_updates =
      Enum.map(1..5, fn system ->
        {system, get_remote_state(state.tenant_id, system)}
      end)

    {:ok, remote_updates}
  end

  defp merge_states(local, remote) when is_map(local) and is_map(remote) do
    # LWW merge - prefer local for conflicts (local is source of truth)
    Map.merge(remote, local)
  end

  defp merge_states(local, _remote), do: local

  defp compute_delta(old, new) when is_map(old) and is_map(new) do
    # Compute added/changed keys
    changed =
      new
      |> Enum.filter(fn {k, v} -> Map.get(old, k) != v end)
      |> Map.new()

    # Compute removed keys
    removed = Map.keys(old) -- Map.keys(new)

    %{
      changed: changed,
      removed: removed,
      timestamp: DateTime.utc_now()
    }
  end

  defp apply_delta_to_belief_set(belief_set, system, delta) do
    # Add each changed key to belief set (simple map-based delta tracking)
    Enum.reduce(delta.changed, belief_set, fn {key, value}, bs ->
      belief_key = "s#{system}:#{key}"
      Map.put(bs, belief_key, %{value: value, updated_at: DateTime.utc_now()})
    end)
  end

  defp broadcast_state_change(tenant_id, action, changes) do
    message = {:vsm_state_change, %{action: action, changes: changes, timestamp: DateTime.utc_now()}}

    try do
      Phoenix.PubSub.broadcast(@pubsub, "#{@state_topic}:#{tenant_id}", message)
    rescue
      _ -> :ok
    end
  end
end
