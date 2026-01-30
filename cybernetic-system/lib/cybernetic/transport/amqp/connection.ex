defmodule Cybernetic.Transport.AMQP.Connection do
  @moduledoc """
  AMQP connection manager with automatic reconnection and pool management.
  """
  use GenServer
  require Logger

  @reconnect_interval 5_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(_opts) do
    config = Application.get_env(:cybernetic, :amqp, [])
    Process.send_after(self(), :connect, 0)

    {:ok,
     %{
       config: config,
       connection: nil,
       channel: nil,
       status: :disconnected,
       queues: config[:queues] || []
     }}
  end

  def get_channel do
    GenServer.call(__MODULE__, :get_channel)
  end

  def reconnect do
    GenServer.cast(__MODULE__, :reconnect)
  end

  def handle_call(:get_channel, _from, %{channel: channel, status: :connected} = state) do
    {:reply, {:ok, channel}, state}
  end

  def handle_call(:get_channel, _from, state) do
    {:reply, {:error, :not_connected}, state}
  end

  def handle_cast(:reconnect, state) do
    # Force reconnection by closing current connection if exists
    if state.connection do
      try do
        AMQP.Connection.close(state.connection)
      catch
        _, _ -> :ok
      end
    end

    # Trigger immediate reconnection
    Process.send_after(self(), :connect, 100)
    {:noreply, %{state | connection: nil, channel: nil, status: :reconnecting}}
  end

  def handle_info(:connect, state) do
    # Spawn async connection to avoid blocking GenServer calls
    parent = self()

    Task.start(fn ->
      result = establish_connection(state.config)
      send(parent, {:connection_result, result})
    end)

    {:noreply, %{state | status: :connecting}}
  end

  def handle_info({:connection_result, {:ok, conn, chan}}, state) do
    Logger.info("AMQP connected successfully")
    setup_exchanges_and_queues(chan, state.config)
    {:noreply, %{state | connection: conn, channel: chan, status: :connected}}
  end

  def handle_info({:connection_result, {:error, reason}}, state) do
    Logger.error("AMQP connection failed: #{inspect(reason)}")
    Process.send_after(self(), :connect, @reconnect_interval)
    {:noreply, %{state | status: :disconnected}}
  end

  def handle_info({:DOWN, _, :process, _pid, reason}, state) do
    Logger.warning("AMQP connection lost: #{inspect(reason)}")
    Process.send_after(self(), :connect, @reconnect_interval)
    {:noreply, %{state | connection: nil, channel: nil, status: :disconnected}}
  end

  defp establish_connection(config) do
    url = config[:url] || "amqp://guest:guest@localhost:5672"

    with {:ok, conn} <- AMQP.Connection.open(url),
         {:ok, chan} <- AMQP.Channel.open(conn) do
      Process.monitor(conn.pid)
      {:ok, conn, chan}
    end
  end

  defp setup_exchanges_and_queues(channel, config) do
    exchange = config[:exchange] || "cybernetic.exchange"
    exchange_type = config[:exchange_type] || :topic

    # Declare exchange
    AMQP.Exchange.declare(channel, exchange, exchange_type, durable: true)

    # Setup VSM system queues
    Enum.each(config[:queues] || [], fn {system, queue_name} ->
      AMQP.Queue.declare(channel, queue_name, durable: true)
      routing_key = "vsm.#{system}.*"
      AMQP.Queue.bind(channel, queue_name, exchange, routing_key: routing_key)
      Logger.debug("Bound queue #{queue_name} with routing key #{routing_key}")
    end)
  end

  def terminate(_reason, %{connection: conn}) when not is_nil(conn) do
    AMQP.Connection.close(conn)
  catch
    _, _ -> :ok
  end

  def terminate(_reason, _state), do: :ok
end
