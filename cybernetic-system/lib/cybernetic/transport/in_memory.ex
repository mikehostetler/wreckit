defmodule Cybernetic.Transport.InMemory do
  @moduledoc """
  In-memory transport implementation for tests.
  Routes messages directly to VSM system GenServers without AMQP.
  """

  @behaviour Cybernetic.Transport.Behaviour
  require Logger

  @impl true
  def publish(_exchange, routing_key, message, opts) do
    Logger.debug("InMemory transport: #{routing_key} -> #{inspect(message)}")

    # Route based on routing key to appropriate VSM system
    case routing_key do
      "s2.coordinate" ->
        send_to_system(:system2, message, opts)

      "s4.intelligence" ->
        send_to_system(:system4, message, opts)

      "s4.algedonic" ->
        send_to_system(:system4, message, opts)

      "s3.control" ->
        send_to_system(:system3, message, opts)

      "s5.policy" ->
        send_to_system(:system5, message, opts)

      _ ->
        Logger.warning("InMemory transport: Unknown routing key #{routing_key}")
        {:error, :unknown_routing_key}
    end
  end

  defp send_to_system(system, message, opts) do
    # For tests, send message to test collector if present
    if test_collector = :persistent_term.get({:test_collector, __MODULE__}, nil) do
      send(test_collector, {:"#{system}_message", message})
    end

    # Also try to send to the actual system if it's running
    case system do
      :system2 ->
        if pid = Process.whereis(Cybernetic.VSM.System2.Coordinator) do
          GenServer.cast(pid, {:transport_message, message, opts})
        end

      :system3 ->
        if pid = Process.whereis(Cybernetic.VSM.System3.Control) do
          GenServer.cast(pid, {:transport_message, message, opts})
        end

      :system4 ->
        if pid = Process.whereis(Cybernetic.VSM.System4.Intelligence) do
          GenServer.cast(pid, {:transport_message, message, opts})
        end

      :system5 ->
        if pid = Process.whereis(Cybernetic.VSM.System5.Policy) do
          GenServer.cast(pid, {:transport_message, message, opts})
        end

      _ ->
        :ok
    end

    :ok
  end

  @doc """
  Set the test collector process for receiving messages during tests.
  """
  def set_test_collector(collector_pid) when is_pid(collector_pid) do
    :persistent_term.put({:test_collector, __MODULE__}, collector_pid)
  end

  def set_test_collector(nil) do
    :persistent_term.erase({:test_collector, __MODULE__})
  catch
    # Key doesn't exist
    :error, :badarg -> :ok
  end
end
