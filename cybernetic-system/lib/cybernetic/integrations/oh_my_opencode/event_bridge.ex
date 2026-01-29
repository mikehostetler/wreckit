defmodule Cybernetic.Integrations.OhMyOpencode.EventBridge do
  @moduledoc """
  Bidirectional event bridge between Cybernetic and oh-my-opencode.

  Routes events between the two platforms with filtering, transformation,
  and replay capabilities.

  ## Event Types

  ### Outbound (Cybernetic → oh-my-opencode)
  - `vsm.state_changed` - VSM system state updates
  - `episode.created` - New conversation episode
  - `episode.completed` - Episode finished
  - `policy.evaluated` - Policy decision made
  - `capability.discovered` - New capability registered
  - `tool.invoked` - MCP tool was called

  ### Inbound (oh-my-opencode → Cybernetic)
  - `agent.message` - Agent sent a message
  - `agent.tool_request` - Agent requesting tool execution
  - `session.started` - New coding session
  - `session.ended` - Session terminated
  - `context.updated` - Context/memory updated

  ## Usage

      # Start the event bridge
      {:ok, pid} = EventBridge.start_link(tenant_id: "tenant_123")

      # Subscribe to all events
      EventBridge.subscribe("tenant_123")

      # Subscribe to specific event types
      EventBridge.subscribe("tenant_123", filter: [:episode, :policy])

      # Emit an event
      EventBridge.emit("tenant_123", "episode.created", %{episode_id: "ep_123"})

      # Replay events (for recovery)
      EventBridge.replay("tenant_123", since: ~U[2025-12-01 00:00:00Z])
  """

  use GenServer
  require Logger

  @pubsub Cybernetic.PubSub
  @events_topic "event_bridge"

  # Maximum events to retain for replay
  @max_event_buffer 1000
  # Event TTL for buffer (1 hour) - reserved for future time-based pruning
  # @event_buffer_ttl_ms 3_600_000

  @outbound_event_types ~w(
    vsm.state_changed
    episode.created
    episode.completed
    episode.message
    episode.analyzed
    policy.evaluated
    capability.discovered
    capability.matched
    tool.invoked
    tool.completed
    error.occurred
  )

  @inbound_event_types ~w(
    agent.message
    agent.tool_request
    agent.tool_result
    session.started
    session.ended
    session.paused
    context.updated
    context.cleared
  )

  defstruct [
    :tenant_id,
    :event_buffer,
    :event_handlers,
    :filters,
    :stats
  ]

  # Public API

  @doc """
  Start the event bridge for a tenant.
  """
  def start_link(opts \\ []) do
    tenant_id = Keyword.fetch!(opts, :tenant_id)
    name = Keyword.get(opts, :name, via_tuple(tenant_id))
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Emit an event to be relayed to oh-my-opencode.
  """
  def emit(tenant_id, event_type, payload, opts \\ []) do
    GenServer.cast(via_tuple(tenant_id), {:emit, event_type, payload, opts})
  end

  @doc """
  Receive an event from oh-my-opencode.
  """
  def receive_event(tenant_id, event) do
    GenServer.cast(via_tuple(tenant_id), {:receive, event})
  end

  @doc """
  Subscribe to events for a tenant.

  Options:
  - `:filter` - List of event type prefixes to receive (e.g., [:episode, :policy])
  - `:direction` - :outbound, :inbound, or :both (default: :both)
  """
  def subscribe(tenant_id, opts \\ []) do
    filter = Keyword.get(opts, :filter, [])
    direction = Keyword.get(opts, :direction, :both)

    topic =
      case direction do
        :outbound -> "#{@events_topic}:#{tenant_id}:outbound"
        :inbound -> "#{@events_topic}:#{tenant_id}:inbound"
        :both -> "#{@events_topic}:#{tenant_id}"
      end

    # Store filter preference in process dictionary for message handling
    if filter != [] do
      Process.put(:event_bridge_filter, filter)
    end

    Phoenix.PubSub.subscribe(@pubsub, topic)
  end

  @doc """
  Unsubscribe from events.
  """
  def unsubscribe(tenant_id, opts \\ []) do
    direction = Keyword.get(opts, :direction, :both)

    topics =
      case direction do
        :outbound ->
          ["#{@events_topic}:#{tenant_id}:outbound"]

        :inbound ->
          ["#{@events_topic}:#{tenant_id}:inbound"]

        :both ->
          [
            "#{@events_topic}:#{tenant_id}",
            "#{@events_topic}:#{tenant_id}:outbound",
            "#{@events_topic}:#{tenant_id}:inbound"
          ]
      end

    Enum.each(topics, &Phoenix.PubSub.unsubscribe(@pubsub, &1))
  end

  @doc """
  Replay events from the buffer.

  Options:
  - `:since` - DateTime, replay events after this time
  - `:types` - List of event types to replay
  - `:limit` - Maximum events to replay
  """
  def replay(tenant_id, opts \\ []) do
    GenServer.call(via_tuple(tenant_id), {:replay, opts})
  end

  @doc """
  Register a handler function for specific event types.

  The handler will be called with (event_type, payload, metadata).
  """
  def register_handler(tenant_id, event_types, handler) when is_list(event_types) do
    GenServer.call(via_tuple(tenant_id), {:register_handler, event_types, handler})
  end

  @doc """
  Get event bridge statistics.
  """
  def stats(tenant_id) do
    GenServer.call(via_tuple(tenant_id), :stats)
  end

  @doc """
  List known event types.
  """
  def event_types do
    %{
      outbound: @outbound_event_types,
      inbound: @inbound_event_types
    }
  end

  # GenServer callbacks

  @impl true
  def init(opts) do
    tenant_id = Keyword.fetch!(opts, :tenant_id)

    state = %__MODULE__{
      tenant_id: tenant_id,
      event_buffer: :queue.new(),
      event_handlers: %{},
      filters: %{},
      stats: %{
        emitted: 0,
        received: 0,
        replayed: 0,
        errors: 0,
        started_at: DateTime.utc_now()
      }
    }

    # Subscribe to internal Cybernetic events for relay
    subscribe_to_internal_events(tenant_id)

    Logger.info("Event Bridge started for tenant #{tenant_id}")
    {:ok, state}
  end

  @impl true
  def handle_cast({:emit, event_type, payload, opts}, state) do
    event = build_event(event_type, payload, state.tenant_id, :outbound, opts)

    # Add to buffer
    new_buffer = buffer_event(state.event_buffer, event)

    # Broadcast locally
    broadcast_event(state.tenant_id, event, :outbound)

    # Relay to oh-my-opencode
    relay_to_remote(event)

    # Call registered handlers
    invoke_handlers(state.event_handlers, event)

    new_stats = Map.update!(state.stats, :emitted, &(&1 + 1))
    {:noreply, %{state | event_buffer: new_buffer, stats: new_stats}}
  end

  @impl true
  def handle_cast({:receive, event}, state) do
    # Validate event structure
    case validate_inbound_event(event) do
      :ok ->
        normalized = normalize_inbound_event(event, state.tenant_id)

        # Add to buffer
        new_buffer = buffer_event(state.event_buffer, normalized)

        # Broadcast locally
        broadcast_event(state.tenant_id, normalized, :inbound)

        # Call registered handlers
        invoke_handlers(state.event_handlers, normalized)

        new_stats = Map.update!(state.stats, :received, &(&1 + 1))
        {:noreply, %{state | event_buffer: new_buffer, stats: new_stats}}

      {:error, reason} ->
        Logger.warning("Invalid inbound event: #{inspect(reason)}")
        new_stats = Map.update!(state.stats, :errors, &(&1 + 1))
        {:noreply, %{state | stats: new_stats}}
    end
  end

  @impl true
  def handle_call({:replay, opts}, _from, state) do
    since = Keyword.get(opts, :since)
    types = Keyword.get(opts, :types, [])
    limit = Keyword.get(opts, :limit, 100)

    events =
      state.event_buffer
      |> :queue.to_list()
      |> filter_events_for_replay(since, types)
      |> Enum.take(limit)

    # Broadcast replayed events
    Enum.each(events, fn event ->
      broadcast_event(state.tenant_id, Map.put(event, :replayed, true), event.direction)
    end)

    new_stats = Map.update!(state.stats, :replayed, &(&1 + length(events)))
    {:reply, {:ok, events}, %{state | stats: new_stats}}
  end

  @impl true
  def handle_call({:register_handler, event_types, handler}, _from, state) do
    new_handlers =
      Enum.reduce(event_types, state.event_handlers, fn event_type, acc ->
        handlers = Map.get(acc, event_type, [])
        Map.put(acc, event_type, [handler | handlers])
      end)

    {:reply, :ok, %{state | event_handlers: new_handlers}}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      Map.merge(state.stats, %{
        buffer_size: :queue.len(state.event_buffer),
        handler_count: map_size(state.event_handlers),
        uptime_seconds: DateTime.diff(DateTime.utc_now(), state.stats.started_at)
      })

    {:reply, {:ok, stats}, state}
  end

  # Handle VSM Bridge events (from vsm_bridge:events:tenant_id topic)
  @impl true
  def handle_info({:vsm_event, event}, state) do
    relay_internal_event("vsm.state_changed", event, state)
  end

  @impl true
  def handle_info({:remote_vsm_event, event}, state) do
    relay_internal_event("vsm.state_changed", event, state)
  end

  # Handle VSM state broadcasts (from vsm_bridge:state:tenant_id topic)
  @impl true
  def handle_info({:vsm_state_change, payload}, state) do
    relay_internal_event("vsm.state_changed", payload, state)
  end

  # Handle events published on the shared `events:*` PubSub topics (used by SSE).
  # These topics are not tenant-scoped, so we must filter by tenant_id.
  @impl true
  def handle_info({:event, event_type, payload}, state)
      when is_binary(event_type) and is_map(payload) do
    if event_belongs_to_tenant?(payload, state.tenant_id) do
      relay_internal_event(event_type, payload, state)
    else
      {:noreply, state}
    end
  end

  # Handle episode events
  @impl true
  def handle_info({:episode_created, episode}, state) do
    relay_internal_event("episode.created", episode, state)
  end

  @impl true
  def handle_info({:episode_completed, episode}, state) do
    relay_internal_event("episode.completed", episode, state)
  end

  # Handle policy events
  @impl true
  def handle_info({:policy_evaluated, result}, state) do
    relay_internal_event("policy.evaluated", result, state)
  end

  # Handle capability events
  @impl true
  def handle_info({:capability_registered, capability}, state) do
    relay_internal_event("capability.discovered", capability, state)
  end

  # Catch-all for unhandled PubSub messages
  @impl true
  def handle_info(_msg, state) do
    {:noreply, state}
  end

  defp relay_internal_event(event_type, payload, state) do
    if event_type in @outbound_event_types do
      # Build and buffer the event
      event = build_event(event_type, payload, state.tenant_id, :outbound, [])
      new_buffer = buffer_event(state.event_buffer, event)

      # Invoke handlers
      invoke_handlers(state.event_handlers, event)

      # Broadcast externally
      broadcast_event(state.tenant_id, event, :outbound)

      new_stats = Map.update!(state.stats, :emitted, &(&1 + 1))
      {:noreply, %{state | event_buffer: new_buffer, stats: new_stats}}
    else
      {:noreply, state}
    end
  end

  # Private helpers

  defp via_tuple(tenant_id) do
    {:via, Registry, {Cybernetic.Integrations.Registry, {__MODULE__, tenant_id}}}
  end

  defp subscribe_to_internal_events(tenant_id) do
    # Subscribe to internal Cybernetic PubSub topics
    # Topics must match what VSMBridge and other modules actually broadcast to
    internal_topics = [
      "vsm_bridge:state:#{tenant_id}",
      "vsm_bridge:events:#{tenant_id}",
      # Shared event topics (used by SSE). These are not tenant-scoped, so EventBridge filters by tenant_id.
      "events:episode",
      "events:policy"
    ]

    Enum.each(internal_topics, fn topic ->
      try do
        Phoenix.PubSub.subscribe(@pubsub, topic)
      rescue
        _ -> :ok
      catch
        :exit, _ -> :ok
      end
    end)
  end

  defp event_belongs_to_tenant?(payload, tenant_id)
       when is_binary(tenant_id) and tenant_id != "" do
    case Map.get(payload, :tenant_id) || Map.get(payload, "tenant_id") do
      ^tenant_id -> true
      _ -> false
    end
  end

  defp event_belongs_to_tenant?(_payload, _tenant_id), do: true

  defp build_event(event_type, payload, tenant_id, direction, opts) do
    %{
      id: generate_event_id(),
      type: event_type,
      payload: payload,
      tenant_id: tenant_id,
      direction: direction,
      timestamp: DateTime.utc_now(),
      metadata: Keyword.get(opts, :metadata, %{}),
      correlation_id: Keyword.get(opts, :correlation_id),
      source: :cybernetic
    }
  end

  defp generate_event_id do
    "evt_" <> Base.encode16(:crypto.strong_rand_bytes(8), case: :lower)
  end

  defp buffer_event(buffer, event) do
    # Add event and prune old ones
    new_buffer = :queue.in(event, buffer)

    if :queue.len(new_buffer) > @max_event_buffer do
      {_, pruned} = :queue.out(new_buffer)
      pruned
    else
      new_buffer
    end
  end

  defp broadcast_event(tenant_id, event, direction) do
    # Broadcast to both direction-specific and general topics
    topics = [
      "#{@events_topic}:#{tenant_id}",
      "#{@events_topic}:#{tenant_id}:#{direction}"
    ]

    message = {:event_bridge, event}

    Enum.each(topics, fn topic ->
      try do
        Phoenix.PubSub.broadcast(@pubsub, topic, message)
      rescue
        _ -> :ok
      end
    end)
  end

  defp relay_to_remote(_event) do
    # In production, POST to oh-my-opencode webhook
    # For now, this is a no-op placeholder
    :ok
  end

  defp validate_inbound_event(event) when is_map(event) do
    cond do
      not Map.has_key?(event, "type") and not Map.has_key?(event, :type) ->
        {:error, :missing_type}

      true ->
        :ok
    end
  end

  defp validate_inbound_event(_), do: {:error, :invalid_format}

  defp normalize_inbound_event(event, tenant_id) do
    %{
      id: Map.get(event, :id) || Map.get(event, "id") || generate_event_id(),
      type: Map.get(event, :type) || Map.get(event, "type"),
      payload: Map.get(event, :payload) || Map.get(event, "payload") || %{},
      tenant_id: tenant_id,
      direction: :inbound,
      timestamp: DateTime.utc_now(),
      metadata: Map.get(event, :metadata) || Map.get(event, "metadata") || %{},
      correlation_id: Map.get(event, :correlation_id) || Map.get(event, "correlation_id"),
      source: :oh_my_opencode
    }
  end

  defp invoke_handlers(handlers, event) do
    event_type = event.type

    # Get handlers for this specific type
    type_handlers = Map.get(handlers, event_type, [])

    # Get handlers for wildcard patterns (e.g., "episode.*")
    prefix = event_type |> String.split(".") |> List.first()
    wildcard_handlers = Map.get(handlers, "#{prefix}.*", [])

    all_handlers = type_handlers ++ wildcard_handlers

    Enum.each(all_handlers, fn handler ->
      try do
        handler.(event.type, event.payload, event)
      rescue
        e ->
          Logger.warning("Event handler error: #{inspect(e)}")
      end
    end)
  end

  defp filter_events_for_replay(events, since, types) do
    events
    |> Enum.filter(fn event ->
      after_since? =
        case since do
          nil -> true
          dt -> DateTime.compare(event.timestamp, dt) == :gt
        end

      type_match? =
        case types do
          [] ->
            true

          types ->
            event.type in types or String.starts_with?(event.type, Enum.map(types, &"#{&1}."))
        end

      after_since? and type_match?
    end)
  end
end
