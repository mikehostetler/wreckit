defmodule Cybernetic.VSM.System2.Coordinator do
  use GenServer

  @moduledoc """
  S2: Attention/coordination engine (Layer 6B analog).
  """
  alias Cybernetic.Telemetry.OTEL

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  def init(opts) do
    state = %{
      attention: %{},
      priorities: %{},
      resource_slots: %{},
      max_slots: Keyword.get(opts, :max_slots, 8),
      wait_since: %{},
      aging_ms: Keyword.get(opts, :aging_ms, 2_000),
      aging_boost: Keyword.get(opts, :aging_boost, 0.5),
      aging_cap: Keyword.get(opts, :aging_cap, 3.0)
    }

    {:ok, state}
  end

  @doc "Focus attention on a task"
  @spec focus(term()) :: :ok
  def focus(task_id), do: GenServer.cast(__MODULE__, {:focus, task_id})

  @doc "Set priority weight for a topic (higher = more resources)"
  @spec set_priority(term(), number()) :: :ok
  def set_priority(topic, weight), do: GenServer.cast(__MODULE__, {:set_priority, topic, weight})

  @doc "Reserve a processing slot (returns :ok | :backpressure)"
  @spec reserve_slot(term()) :: :ok | :backpressure
  def reserve_slot(topic), do: GenServer.call(__MODULE__, {:reserve_slot, topic})

  @doc "Release a processing slot"
  @spec release_slot(term()) :: :ok
  def release_slot(topic), do: GenServer.cast(__MODULE__, {:release_slot, topic})

  def handle_cast({:focus, task_id}, state) do
    att =
      Map.update(state.attention, task_id, %{weight: 1.1, last: System.monotonic_time()}, fn a ->
        %{a | weight: a.weight * 1.05, last: System.monotonic_time()}
      end)

    {:noreply, %{state | attention: att}}
  end

  def handle_cast({:set_priority, topic, weight}, state) do
    {:noreply, put_in(state.priorities[topic], weight)}
  end

  def handle_cast({:release_slot, topic}, state) do
    slots = Map.update(state.resource_slots, topic, 0, fn s -> max(s - 1, 0) end)
    {:noreply, %{state | resource_slots: slots}}
  end

  # Handle transport messages from in-memory transport
  def handle_cast({:transport_message, message, opts}, state) do
    # Extract operation from type field first (for routing keys), then fallback to operation field
    operation =
      case Map.get(message, :type) || Map.get(message, "type") do
        "vsm.s2.coordinate" ->
          "coordinate"

        "vsm.s2.coordination" ->
          "coordination"

        "vsm.s2.coordination_complete" ->
          "coordination_complete"

        "vsm.s2.sync" ->
          "sync"

        "vsm.s2.status_request" ->
          "status_request"

        _ ->
          # Fallback to operation field
          Map.get(message, :operation, Map.get(message, "operation", "unknown"))
      end

    meta = Keyword.get(opts, :meta, %{})

    # Process the message through the message handler
    Cybernetic.VSM.System2.MessageHandler.handle_message(operation, message, meta)

    {:noreply, state}
  end

  def handle_call({:reserve_slot, topic}, _from, state) do
    # Start OTEL span for reserve operation
    OTEL.with_span "s2.reserve_slot", %{"coordinator.topic" => topic} do
      start_time = System.monotonic_time(:nanosecond)
      max_slots = calculate_max_slots(topic, state)
      current = Map.get(state.resource_slots, topic, 0)

      OTEL.set_attributes(%{
        "coordinator.max_slots" => max_slots,
        "coordinator.current_slots" => current,
        "coordinator.available" => max_slots - current
      })

      if current < max_slots do
        new_state =
          state
          |> put_in([:resource_slots, topic], current + 1)
          |> put_in([:wait_since, topic], System.monotonic_time(:millisecond))

        duration_ns = System.monotonic_time(:nanosecond) - start_time

        # Golden telemetry emit
        :telemetry.execute(
          [:cyb, :s2, :reserve],
          %{duration: duration_ns, reserved: 1, requested: 1, current: current + 1},
          %{lane: to_string(topic), granted: true, max_slots: max_slots}
        )

        # Legacy telemetry for compatibility
        :telemetry.execute(
          [:cybernetic, :s2, :coordinator, :schedule],
          %{reserved: 1, requested: 1, current: current + 1},
          %{topic: topic, max_slots: max_slots}
        )

        OTEL.add_event("slot_reserved", %{"topic" => topic, "slot" => current + 1})
        {:reply, :ok, new_state}
      else
        # Update wait time if not already waiting
        new_state =
          Map.update(state, :wait_since, %{topic => System.monotonic_time(:millisecond)}, fn ws ->
            Map.put_new(ws, topic, System.monotonic_time(:millisecond))
          end)

        duration_ns = System.monotonic_time(:nanosecond) - start_time

        # Golden telemetry emit
        :telemetry.execute(
          [:cyb, :s2, :reserve],
          %{duration: duration_ns, current: current, max_slots: max_slots},
          %{lane: to_string(topic), granted: false}
        )

        # Legacy telemetry
        :telemetry.execute(
          [:cybernetic, :s2, :coordinator, :pressure],
          %{current: current, max_slots: max_slots},
          %{topic: topic}
        )

        OTEL.add_event("backpressure", %{"topic" => topic, "reason" => "max_slots_reached"})
        {:reply, :backpressure, new_state}
      end
    end
  end

  # Fair share calculation with aging to prevent starvation
  defp calculate_max_slots(topic, state) do
    # Base weight
    priority = Map.get(state.priorities, topic, 1.0)

    total_priority =
      state.priorities
      |> Map.values()
      |> Enum.sum()
      |> max(1.0)

    # Aging boost for waiting topics
    now = System.monotonic_time(:millisecond)
    waited_ms = now - Map.get(state.wait_since, topic, now)
    aging_boost = state.aging_boost * min(waited_ms / state.aging_ms, state.aging_cap)

    # Effective priority with aging
    effective_priority = max(priority + aging_boost, 0.0)
    share = effective_priority / (total_priority + state.aging_boost * map_size(state.priorities))
    slots = share * state.max_slots

    # Guarantee at least 1 slot to prevent total starvation
    max(1, round(slots))
  end

  @doc "Test interface - routes messages through the message handler"
  @spec handle_message(map(), map()) :: :ok | {:error, term()}
  def handle_message(message, meta \\ %{}) do
    # Extract operation from type field or operation field
    operation =
      case Map.get(message, :type) || Map.get(message, "type") do
        "vsm.s2.coordination" ->
          "coordination"

        "vsm.s2.coordination_complete" ->
          "coordination_complete"

        "vsm.s2.coordinate" ->
          "coordinate"

        "vsm.s2.sync" ->
          "sync"

        "vsm.s2.status_request" ->
          "status_request"

        _ ->
          # Fallback to operation field
          Map.get(message, :operation, Map.get(message, "operation", "unknown"))
      end

    Cybernetic.VSM.System2.MessageHandler.handle_message(operation, message, meta)
  end
end
