defmodule Cybernetic.VSM.System2.MessageHandler do
  @moduledoc """
  Message handler for VSM System 2 (Coordination).
  Handles coordination messages and inter-system communication.
  """
  require Logger

  def handle_message(operation, payload, meta) do
    # Wrap in telemetry span for dynamic tracing
    :telemetry.span(
      [:cybernetic, :archeology, :span],
      %{system: :s2, operation: operation},
      fn ->
        Logger.debug("System2 received #{operation}: #{inspect(payload)}")

        result = do_handle_message(operation, payload, meta)

        {result, %{payload_size: byte_size(inspect(payload))}}
      end
    )
  end

  defp do_handle_message(operation, payload, meta) do
    case operation do
      "coordination" ->
        handle_coordination(payload, meta)

      "coordinate" ->
        handle_coordinate(payload, meta)

      "coordination_complete" ->
        handle_coordination_complete(payload, meta)

      "sync" ->
        handle_sync(payload, meta)

      "status_request" ->
        handle_status_request(payload, meta)

      "priority_update" ->
        handle_priority_update(payload, meta)

      "default" ->
        handle_default(payload, meta)

      _ ->
        Logger.warning("Unknown operation for System2: #{operation}")
        {:error, :unknown_operation}
    end
  rescue
    error ->
      Logger.error("Error in System2 message handler: #{inspect(error)}")
      {:error, error}
  end

  defp handle_coordination(payload, meta) do
    # Check if action is present
    unless Map.has_key?(payload, "action") || Map.has_key?(payload, :action) do
      {:error, :missing_action}
    else
      action = Map.get(payload, "action") || Map.get(payload, :action)
      Logger.info("System2: Coordination with action=#{action}")

      # Process based on action type
      case action do
        "coordinate" -> coordinate_systems(Map.get(payload, :systems, []), payload, meta)
        _ -> :ok
      end

      :ok
    end
  end

  defp handle_coordinate(payload, meta) do
    Logger.info("System2: Coordinating systems - #{inspect(payload)}")

    # Process coordination and forward intelligence to S4
    coordination_result = coordinate_operation(payload, meta)

    # Create intelligence signal for S4
    forward_to_intelligence(payload, meta, coordination_result)

    # Emit telemetry
    :telemetry.execute([:vsm, :s2, :coordination], %{count: 1}, payload)

    # Send coordination messages to specified systems if any
    case Map.get(payload, "target_systems") do
      # No specific target systems needed for S1→S2→S4 flow
      nil ->
        :ok

      systems when is_list(systems) ->
        coordinate_systems(systems, payload, meta)
        :ok

      system ->
        coordinate_systems([system], payload, meta)
        :ok
    end
  end

  defp handle_sync(payload, meta) do
    Logger.debug("System2: Sync request - #{inspect(payload)}")

    # Broadcast sync to all systems
    Cybernetic.Transport.Behaviour.publish(
      "cyb.events",
      "s2.sync_response",
      %{"timestamp" => :os.system_time(:millisecond), "data" => payload},
      source: :system2,
      meta: meta
    )

    :ok
  end

  defp handle_status_request(_payload, meta) do
    Logger.debug("System2: Status request")

    # Collect status from all systems
    status = %{
      "system2" => "active",
      "coordination_active" => true,
      "timestamp" => :os.system_time(:millisecond)
    }

    respond_with_status(status, meta)
    :ok
  end

  defp handle_priority_update(payload, _meta) do
    Logger.info("System2: Priority update - #{inspect(payload)}")
    :ok
  end

  defp handle_coordination_complete(payload, meta) do
    Logger.info("System2: Coordination complete - #{inspect(payload)}")

    # Create intelligence signal for S4 based on the coordination result
    intelligence_payload = %{
      "type" => "vsm.s4.intelligence",
      "source_system" => "s2",
      "coordination_id" => Map.get(payload, "coordination_id"),
      "original_operation" => Map.get(payload, "original_operation"),
      "resources_allocated" => Map.get(payload, "resources_allocated", []),
      "priority" => Map.get(payload, "priority", "normal"),
      "analysis_request" => "coordination_analysis",
      "timestamp" => DateTime.utc_now()
    }

    # Send intelligence to S4
    forward_to_intelligence(intelligence_payload, meta, payload)

    :ok
  end

  defp handle_default(payload, _meta) do
    Logger.debug("System2: Default handler - #{inspect(payload)}")
    :ok
  end

  defp coordinate_systems(systems, payload, meta) do
    _action = Map.get(payload, "action", "coordinate")

    Enum.each(systems, fn system ->
      Cybernetic.Transport.Behaviour.publish(
        "cyb.commands",
        "#{system}.coordination",
        Map.put(payload, "coordinator", "system2"),
        source: :system2,
        meta: meta
      )
    end)
  end

  defp respond_with_status(status, meta) do
    case Map.get(meta, :source_node) do
      nil ->
        Logger.debug("System2: No source node for status response")

      _source_node ->
        Cybernetic.Transport.Behaviour.publish(
          "cyb.events",
          "s2.status_response",
          status,
          source: :system2,
          meta: meta
        )
    end
  end

  defp coordinate_operation(payload, _meta) do
    # Simulate coordination logic
    coordination_id = Map.get(payload, "coordination_id", generate_coordination_id())

    result = %{
      "coordination_id" => coordination_id,
      "status" => "coordinated",
      "resources_allocated" => ["worker_1", "worker_2"],
      "priority" => "normal",
      "timestamp" => DateTime.utc_now()
    }

    Logger.debug("System2: Coordination complete - #{coordination_id}")
    result
  end

  defp forward_to_intelligence(payload, meta, coordination_result) do
    # Extract coordination_id from the payload first, then from coordination_result
    coordination_id =
      Map.get(payload, "coordination_id") ||
        Map.get(payload, :coordination_id) ||
        Map.get(coordination_result, "coordination_id")

    # Create intelligence message for S4
    intelligence_msg = %{
      "type" => "vsm.s4.intelligence",
      "source_system" => "s2",
      "coordination_id" => coordination_id,
      "operation" => "intelligence",
      "coordination_data" => coordination_result,
      "analysis_request" => "pattern_detection",
      "timestamp" => DateTime.utc_now()
    }

    # Send via AMQP to S4
    case Cybernetic.Transport.Behaviour.publish(
           "cyb.commands",
           "s4.intelligence",
           intelligence_msg,
           source: :system2,
           meta: meta
         ) do
      :ok ->
        Logger.debug("System2: Forwarded intelligence to S4")
        :ok

      error ->
        Logger.warning("System2: Failed to forward to S4: #{inspect(error)}")
        error
    end
  end

  defp generate_coordination_id do
    "coord_#{:os.system_time(:millisecond)}_#{:rand.uniform(1000)}"
  end
end
