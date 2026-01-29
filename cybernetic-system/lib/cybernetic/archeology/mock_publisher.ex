defmodule Cybernetic.Archeology.MockPublisher do
  @moduledoc """
  Mock AMQP Publisher for in-memory tracing in test/dev environments.

  This GenServer registers as `Cybernetic.Core.Transport.AMQP.Publisher` and
  intercepts publish calls, routing them synchronously to target VSM message handlers
  instead of using external RabbitMQ infrastructure.

  ## Purpose

  Enables full dynamic tracing of VSM message flows (S1 -> S2 -> S3 -> S4 -> S5)
  without requiring RabbitMQ, preventing crashes during trace generation.

  ## Routing

  Messages are routed based on routing key prefixes:
  - "s1.*" -> `Cybernetic.VSM.System1.MessageHandler`
  - "s2.*" -> `Cybernetic.VSM.System2.MessageHandler`
  - "s3.*" -> `Cybernetic.VSM.System3.MessageHandler`
  - "s4.*" -> `Cybernetic.VSM.System4.MessageHandler`
  - "s5.*" -> `Cybernetic.VSM.System5.MessageHandler`

  ## Telemetry

  Emits `[:cyb, :amqp, :publish]` events to maintain trace continuity.

  ## Usage

      # Start mock publisher (only in test/dev mode)
      {:ok, pid} = Cybernetic.Archeology.MockPublisher.start_link()

      # Publishers use it like the real AMQP publisher
      Cybernetic.Core.Transport.AMQP.Publisher.publish(
        "cyb.commands",
        "s2.coordinate",
        payload,
        opts
      )

  ## Guard Clauses

  This module only starts in test/dev environments and will refuse to start
  in production to prevent accidental use.
  """

  use GenServer
  require Logger

  @doc """
  Start the MockPublisher GenServer.

  Only starts in :dev or :test environments. Refuses to start in production.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    env = Application.get_env(:cybernetic, :environment, :prod)

    if env in [:dev, :test] do
      GenServer.start_link(__MODULE__, opts, name: Cybernetic.Core.Transport.AMQP.Publisher)
    else
      Logger.error("MockPublisher refuses to start in #{env} environment")
      {:error, :not_allowed_in_production}
    end
  end

  @impl true
  def init(_opts) do
    Logger.info("MockPublisher started - routing messages in-memory")
    {:ok, %{}}
  end

  @impl true
  def handle_call({:publish, exchange, routing_key, payload, opts}, _from, state) do
    Logger.debug("MockPublisher: #{exchange} #{routing_key}")

    # Emit telemetry span for the publish operation
    start_time = System.monotonic_time(:microsecond)

    # Extract metadata from opts
    metadata = %{
      exchange => exchange,
      routing_key: routing_key,
      payload_size: byte_size(inspect(payload)),
      source: Keyword.get(opts, :source, :mock_publisher)
    }

    # Route the message to the target handler
    result = route_message(routing_key, payload, opts)

    # Calculate duration and emit telemetry
    duration = System.monotonic_time(:microsecond) - start_time

    :telemetry.execute(
      [:cyb, :amqp, :publish],
      %{duration_us: duration},
      metadata
    )

    {:reply, result, state}
  end

  # Route message to target VSM handler based on routing key
  defp route_message(routing_key, payload, opts) do
    case parse_routing_key(routing_key) do
      {:ok, system, operation} ->
        dispatch_to_handler(system, operation, payload, opts)

      {:error, :unknown_system} ->
        Logger.warning("MockPublisher: Unknown routing key: #{routing_key}")
        {:error, :unknown_routing_key}
    end
  end

  # Parse routing key to extract system and operation
  # e.g., "s2.coordinate" -> {:ok, :s2, "coordinate"}
  defp parse_routing_key(routing_key) do
    case String.split(routing_key, ".", parts: 2) do
      [system_prefix, operation] ->
        system = system_prefix_to_atom(system_prefix)
        if system do
          {:ok, system, operation}
        else
          {:error, :unknown_system}
        end

      _ ->
        {:error, :unknown_system}
    end
  end

  # Convert routing key prefix to system atom
  defp system_prefix_to_atom("s1"), do: :s1
  defp system_prefix_to_atom("s2"), do: :s2
  defp system_prefix_to_atom("s3"), do: :s3
  defp system_prefix_to_atom("s4"), do: :s4
  defp system_prefix_to_atom("s5"), do: :s5
  defp system_prefix_to_atom(_other), do: nil

  # Dispatch message to target handler module asynchronously
  # to avoid deadlock when handler tries to publish again
  defp dispatch_to_handler(system, operation, payload, opts) do
    handler_module = handler_module_for_system(system)

    # Convert opts map to keyword list if needed
    meta = Keyword.get(opts, :meta, %{})

    # Add trace_id from opts to meta if present
    meta =
      case Keyword.get(opts, :trace_id) do
        nil -> meta
        trace_id -> Map.put(meta, :trace_id, trace_id)
      end

    # Dispatch asynchronously to avoid deadlock when the handler
    # tries to publish to another system (which would call back into MockPublisher)
    Task.start(fn ->
      try do
        apply(handler_module, :handle_message, [operation, payload, meta])
      rescue
        error ->
          Logger.error(
            "MockPublisher: Error dispatching to #{inspect(handler_module)}: #{inspect(error)}"
          )
      end
    end)

    # Return immediately - don't wait for the handler to complete
    :ok
  end

  # Get handler module for system
  defp handler_module_for_system(:s1), do: Cybernetic.VSM.System1.MessageHandler
  defp handler_module_for_system(:s2), do: Cybernetic.VSM.System2.MessageHandler
  defp handler_module_for_system(:s3), do: Cybernetic.VSM.System3.MessageHandler
  defp handler_module_for_system(:s4), do: Cybernetic.VSM.System4.MessageHandler
  defp handler_module_for_system(:s5), do: Cybernetic.VSM.System5.MessageHandler
end
