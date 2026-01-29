defmodule Cybernetic.Core.Transport.AMQP.Publisher do
  @moduledoc """
  Enhanced AMQP publisher with confirms, durability, and causal headers.
  """
  use GenServer
  alias AMQP.{Basic, Confirm}
  alias Cybernetic.Core.Security.NonceBloom
  require Logger

  defp get_exchanges do
    # Define exchange types matching existing RabbitMQ setup
    [
      {"cyb.events", :topic},
      {"cyb.commands", :topic},
      # telemetry is fanout, not topic
      {"cyb.telemetry", :fanout},
      {"cyb.vsm.s1", :topic},
      {"cyb.vsm.s2", :topic},
      {"cyb.vsm.s3", :topic},
      {"cyb.vsm.s4", :topic},
      {"cyb.vsm.s5", :topic},
      {"cyb.mcp.tools", :topic},
      {"vsm.dlx", :fanout}
    ]
  end

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(_opts) do
    {:ok, %{channel: nil}, {:continue, :setup}}
  end

  def handle_continue(:setup, state) do
    case Cybernetic.Transport.AMQP.Connection.get_channel() do
      {:ok, channel} ->
        setup_exchanges(channel)
        Confirm.select(channel)
        {:noreply, %{state | channel: channel}}

      {:error, _} ->
        Process.send_after(self(), :retry_setup, 5000)
        {:noreply, state}
    end
  end

  def handle_info(:retry_setup, state) do
    handle_continue(:setup, state)
  end

  @doc """
  Publish with confirms and causal headers
  """
  @spec publish(String.t(), String.t(), map(), keyword()) :: :ok | {:error, term()}
  def publish(exchange, routing_key, payload, opts \\ []) do
    GenServer.call(__MODULE__, {:publish, exchange, routing_key, payload, opts}, 5000)
  end

  def handle_call(
        {:publish, exchange, routing_key, payload, opts},
        _from,
        %{channel: nil} = state
      ) do
    # Try to get channel again
    case Cybernetic.Transport.AMQP.Connection.get_channel() do
      {:ok, channel} ->
        setup_exchanges(channel)
        Confirm.select(channel)
        new_state = %{state | channel: channel}
        handle_call({:publish, exchange, routing_key, payload, opts}, nil, new_state)

      {:error, _} ->
        {:reply, {:error, :no_channel}, state}
    end
  end

  def handle_call(
        {:publish, exchange, routing_key, payload, opts},
        _from,
        %{channel: channel} = state
      ) do
    headers = build_headers(opts)

    base_message = %{
      "headers" => headers,
      "payload" => payload
    }

    # Add security envelope using NonceBloom
    secured_message = NonceBloom.enrich_message(base_message, site: node())

    case Jason.encode(secured_message) do
      {:ok, json} ->
        Basic.publish(
          channel,
          exchange,
          routing_key,
          json,
          persistent: true,
          content_type: "application/json",
          headers: []
        )

        # Wait for confirm using AMQP.Confirm
        case Confirm.wait_for_confirms(channel, 1500) do
          true ->
            {:reply, :ok, state}

          false ->
            Logger.error("Message nack'd by broker")
            {:reply, {:error, :nack}, state}

          :timeout ->
            Logger.error("Timeout waiting for confirm")
            {:reply, {:error, :confirm_timeout}, state}
        end

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  defp setup_exchanges(channel) do
    Enum.each(get_exchanges(), fn {name, type} ->
      AMQP.Exchange.declare(channel, name, type, durable: true)
      Logger.info("Declared exchange: #{name} (#{type})")
    end)

    # Setup queues using config
    exchanges = Application.get_env(:cybernetic, :amqp)[:exchanges] || %{}
    commands_exchange = Map.get(exchanges, :commands, "cyb.commands")
    telemetry_exchange = Map.get(exchanges, :telemetry, "cyb.telemetry")

    [
      {"cyb.s1.ops", commands_exchange, "s1.*"},
      {"cyb.s2.coord", commands_exchange, "s2.*"},
      {"cyb.s3.control", commands_exchange, "s3.*"},
      {"cyb.s4.llm", commands_exchange, "s4.*"},
      {"cyb.s5.policy", commands_exchange, "s5.*"},
      {"cyb.telemetry.q", telemetry_exchange, "#"}
    ]
    |> Enum.each(fn {queue, exchange, routing_key} ->
      AMQP.Queue.declare(channel, queue, durable: true)
      AMQP.Queue.bind(channel, queue, exchange, routing_key: routing_key)
      Logger.debug("Bound #{queue} to #{exchange} with key #{routing_key}")
    end)
  end

  defp build_headers(opts) do
    %{
      "causal" => opts[:causal] || %{},
      "correlation_id" => opts[:correlation_id] || generate_correlation_id(),
      "source" => opts[:source] || node()
    }
  end

  defp generate_correlation_id do
    "corr_#{System.unique_integer([:positive, :monotonic])}_#{:rand.uniform(999_999)}"
  end
end
