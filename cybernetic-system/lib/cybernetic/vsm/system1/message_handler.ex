defmodule Cybernetic.VSM.System1.MessageHandler do
  @moduledoc """
  Message handler for VSM System 1 (Operational).
  Handles incoming messages from the transport layer and routes them to appropriate system components.
  """
  require Logger

  @doc """
  Handle incoming messages for System 1.
  """
  def handle_message(operation, payload, meta) do
    # Wrap in telemetry span for dynamic tracing
    :telemetry.span(
      [:cybernetic, :archeology, :span],
      %{system: :s1, operation: operation},
      fn ->
        Logger.debug("System1 received #{operation}: #{inspect(payload)}")

        result = do_handle_message(operation, payload, meta)

        {result, %{payload_size: byte_size(inspect(payload))}}
      end
    )
  end

  defp do_handle_message(operation, payload, meta) do
    case operation do
      "operation" ->
        handle_operation(payload, meta)

      "status_update" ->
        handle_status_update(payload, meta)

      "resource_request" ->
        handle_resource_request(payload, meta)

      "coordination" ->
        handle_coordination(payload, meta)

      "telemetry" ->
        handle_telemetry(payload, meta)

      "error" ->
        handle_error(payload, meta)

      "success" ->
        handle_success(payload, meta)

      "default" ->
        handle_default(payload, meta)

      _ ->
        Logger.warning("Unknown operation for System1: #{operation}")
        {:error, :unknown_operation}
    end
  rescue
    error ->
      Logger.error("Error in System1 message handler: #{inspect(error)}")
      {:error, error}
  end

  defp handle_operation(payload, meta) do
    # Handle operational tasks and workflows
    Logger.info("System1: Processing operation - #{inspect(payload)}")

    # Process the operation locally - just verify the supervisor is running
    operation_result =
      case Process.whereis(Cybernetic.VSM.System1.Operational) do
        nil ->
          Logger.warning("System1 operational supervisor not found")
          {:error, :supervisor_not_found}

        _pid ->
          # Operation processed successfully - no circular call needed
          :ok
      end

    # Forward to S2 for coordination if operation is significant
    forward_to_coordination(payload, meta)

    # Emit telemetry for the operation
    :telemetry.execute([:vsm, :s1, :operation], %{count: 1}, payload)

    operation_result
  end

  defp handle_status_update(payload, meta) do
    # Handle status updates from other systems
    Logger.debug("System1: Status update from #{Map.get(meta, :source_node, "unknown")}")

    # Update local state or forward to monitoring
    broadcast_status_internally(payload, meta)
    :ok
  end

  defp handle_resource_request(payload, meta) do
    # Handle resource allocation requests
    Logger.info("System1: Resource request - #{inspect(payload)}")

    # Process resource request and respond
    case allocate_resources(payload) do
      {:ok, allocation} ->
        respond_to_requester(allocation, meta)
        :ok

      {:error, reason} ->
        Logger.error("System1: Resource allocation failed - #{reason}")
        {:error, reason}
    end
  end

  defp handle_coordination(payload, meta) do
    # Handle coordination messages from System 2
    Logger.debug("System1: Coordination message - #{inspect(payload)}")

    # Process coordination instructions
    case Map.get(payload, "action") do
      "start" ->
        start_coordination_task(payload, meta)

      "stop" ->
        stop_coordination_task(payload, meta)

      "update" ->
        update_coordination_task(payload, meta)

      _ ->
        Logger.warning("Unknown coordination action")
        {:error, :unknown_coordination_action}
    end
  end

  defp handle_telemetry(payload, meta) do
    # Handle telemetry data
    Logger.debug("System1: Telemetry data received")

    # Forward to telemetry collectors
    :telemetry.execute(
      [:cybernetic, :vsm, :system1, :message_received],
      %{
        payload_size: byte_size(:erlang.term_to_binary(payload)),
        processing_time: :os.system_time(:millisecond) - Map.get(meta, :timestamp, 0)
      },
      meta
    )

    :ok
  end

  defp handle_error(payload, meta) do
    # Handle error events and trigger algedonic pain signals
    Logger.warning("System1: Error event - #{inspect(payload)}")

    # Record error for algedonic analysis
    record_algedonic_event(:pain, payload, meta)

    # Emit telemetry for error
    :telemetry.execute(
      [:vsm, :s1, :error],
      %{count: 1, severity: Map.get(payload, "severity", "unknown")},
      payload
    )

    :ok
  end

  defp handle_success(payload, meta) do
    # Handle success events and trigger algedonic pleasure signals
    Logger.debug("System1: Success event - #{inspect(payload)}")

    # Record success for algedonic analysis
    record_algedonic_event(:pleasure, payload, meta)

    # Emit telemetry for success
    :telemetry.execute(
      [:vsm, :s1, :success],
      %{count: 1, latency: Map.get(payload, "latency", 0)},
      payload
    )

    :ok
  end

  defp handle_default(payload, _meta) do
    # Handle default/unknown messages
    Logger.debug("System1: Default handler - #{inspect(payload)}")
    :ok
  end

  # Helper functions
  defp broadcast_status_internally(status, meta) do
    # Broadcast status to internal components
    case Process.whereis(Cybernetic.VSM.System1.StatusManager) do
      nil -> Logger.debug("System1: StatusManager not found")
      pid -> send(pid, {:status_update, status, meta})
    end
  end

  defp allocate_resources(request) do
    # Simple resource allocation logic
    case Map.get(request, "type") do
      "cpu" -> {:ok, %{allocated: Map.get(request, "amount", 1), type: "cpu"}}
      "memory" -> {:ok, %{allocated: Map.get(request, "amount", 100), type: "memory"}}
      "network" -> {:ok, %{allocated: Map.get(request, "amount", 10), type: "network"}}
      _ -> {:error, :unsupported_resource_type}
    end
  end

  defp respond_to_requester(allocation, meta) do
    # Send response back through transport
    case Map.get(meta, :source_node) do
      nil ->
        Logger.warning("System1: No source node for response")

      source_node ->
        response = %{
          "status" => "allocated",
          "allocation" => allocation,
          "timestamp" => :os.system_time(:millisecond)
        }

        # Use AMQP Publisher to send response
        Cybernetic.Core.Transport.AMQP.Publisher.publish(
          "cyb.events",
          "s1.resource_response",
          response,
          source: :system1,
          target_node: source_node
        )
    end
  end

  defp start_coordination_task(payload, _meta) do
    Logger.info("System1: Starting coordination task - #{Map.get(payload, "task_id", "unknown")}")
    :ok
  end

  defp stop_coordination_task(payload, _meta) do
    Logger.info("System1: Stopping coordination task - #{Map.get(payload, "task_id", "unknown")}")
    :ok
  end

  defp update_coordination_task(payload, _meta) do
    Logger.info("System1: Updating coordination task - #{Map.get(payload, "task_id", "unknown")}")
    :ok
  end

  defp forward_to_coordination(payload, meta) do
    # Create coordination message for S2
    coordination_msg = %{
      "type" => "vsm.s2.coordinate",
      "source_system" => "s1",
      "operation" => Map.get(payload, "operation", Map.get(payload, :operation, "unknown")),
      "coordination_id" => generate_coordination_id(),
      "original_payload" => payload,
      "timestamp" => DateTime.utc_now()
    }

    # Send via configured transport to S2
    case Cybernetic.Transport.Behaviour.publish(
           "cyb.commands",
           "s2.coordinate",
           coordination_msg,
           source: :system1,
           meta: meta
         ) do
      :ok ->
        Logger.debug("System1: Forwarded operation to S2 for coordination")
        :ok

      error ->
        Logger.warning("System1: Failed to forward to S2: #{inspect(error)}")
        error
    end
  end

  defp generate_coordination_id do
    "coord_#{:os.system_time(:millisecond)}_#{:rand.uniform(1000)}"
  end

  defp record_algedonic_event(type, payload, _meta) do
    # Skip algedonic recording during tests to prevent feedback loops
    if Application.get_env(:cybernetic, :test_mode, false) do
      :ok
    else
      # Record algedonic events and generate signals when thresholds are met
      algedonic_data = %{
        type: type,
        severity: Map.get(payload, "severity", "normal"),
        timestamp: DateTime.utc_now(),
        source: Map.get(payload, "source", "unknown"),
        operation: Map.get(payload, "operation", "unknown")
      }

      # Store in process dictionary for simple state tracking
      events = Process.get({:algedonic_events, type}, [])
      # Keep last 100 events
      recent_events = [algedonic_data | events] |> Enum.take(100)
      Process.put({:algedonic_events, type}, recent_events)

      # Check if we should emit an algedonic signal
      check_algedonic_thresholds(type, recent_events)
    end
  end

  defp check_algedonic_thresholds(type, events) do
    case type do
      :pain ->
        # Check error rate in last time window
        recent_errors =
          Enum.filter(events, fn event ->
            # Last 10 seconds
            DateTime.diff(DateTime.utc_now(), event.timestamp, :millisecond) < 10_000
          end)

        # 5 or more errors in 10 seconds triggers pain
        if length(recent_errors) >= 5 do
          emit_algedonic_signal(:pain, %{
            severity: :moderate,
            error_count: length(recent_errors),
            time_window: 10_000
          })
        end

      :pleasure ->
        # Check success rate
        recent_successes =
          Enum.filter(events, fn event ->
            # Last 30 seconds
            DateTime.diff(DateTime.utc_now(), event.timestamp, :millisecond) < 30_000
          end)

        # 15 or more successes triggers pleasure
        if length(recent_successes) >= 15 do
          emit_algedonic_signal(:pleasure, %{
            intensity: :moderate,
            success_count: length(recent_successes),
            time_window: 30_000
          })
        end
    end
  end

  defp emit_algedonic_signal(type, data) do
    signal = %{
      "operation" => "algedonic",
      "type" => "algedonic.#{type}",
      "source_system" => "s1",
      "data" => data,
      "timestamp" => DateTime.utc_now()
    }

    # Send to S4 for processing
    case Cybernetic.Transport.Behaviour.publish(
           "cyb.commands",
           "s4.algedonic",
           signal,
           source: :system1
         ) do
      :ok ->
        Logger.info("System1: Emitted #{type} algedonic signal")
        :ok

      error ->
        Logger.warning("System1: Failed to emit algedonic signal: #{inspect(error)}")
        error
    end
  end
end
