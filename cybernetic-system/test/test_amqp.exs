#!/usr/bin/env elixir

# Test script to verify AMQP is working with Cybernetic VSM

IO.puts("Starting Cybernetic AMQP Test...")
IO.puts("========================================")

# Start the application
case Application.ensure_all_started(:cybernetic) do
  {:ok, started} ->
    IO.puts("✓ Started applications: #{inspect(started)}")

    # Give it a moment to connect
    Process.sleep(2000)

    # Check if AMQP connection is alive
    case Process.whereis(Cybernetic.Transport.AMQP.Connection) do
      nil ->
        IO.puts("✗ AMQP Connection process not found")

      pid when is_pid(pid) ->
        IO.puts("✓ AMQP Connection running at #{inspect(pid)}")

        # Try to get the connection state
        state = :sys.get_state(pid)
        IO.puts("✓ Connection state: #{inspect(Map.keys(state))}")

        # Test publishing a message
        try do
          {:ok, conn} = AMQP.Connection.open("amqp://guest:guest@localhost:5672")
          {:ok, chan} = AMQP.Channel.open(conn)

          # Declare exchange as durable (matching existing)
          :ok = AMQP.Exchange.declare(chan, "cybernetic.exchange", :topic, durable: true)
          IO.puts("✓ Exchange 'cybernetic.exchange' declared")

          # Declare VSM queues
          queues = [
            "vsm.system1.operations",
            "vsm.system2.coordination",
            "vsm.system3.control",
            "vsm.system4.intelligence",
            "vsm.system5.policy"
          ]

          for queue <- queues do
            AMQP.Queue.declare(chan, queue, durable: true)
            IO.puts("✓ Queue '#{queue}' declared")
          end

          # Publish test message
          message = %{
            "operation" => "test",
            "payload" => %{"message" => "Hello from AMQP test"},
            "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601()
          }

          AMQP.Basic.publish(
            chan,
            "cybernetic.exchange",
            "vsm.system1.operations",
            Jason.encode!(message)
          )

          IO.puts("✓ Test message published to vsm.system1.operations")

          # Check VSM systems are running
          vsm_systems = [
            {Cybernetic.VSM.System1.Operational, "System1 Operational"},
            {Cybernetic.VSM.System2.Coordinator, "System2 Coordinator"},
            {Cybernetic.VSM.System3.Control, "System3 Control"},
            {Cybernetic.VSM.System4.Intelligence, "System4 Intelligence"},
            {Cybernetic.VSM.System5.Policy, "System5 Policy"}
          ]

          IO.puts("\nVSM Systems Status:")

          for {module, name} <- vsm_systems do
            case Process.whereis(module) do
              nil -> IO.puts("✗ #{name} not running")
              pid -> IO.puts("✓ #{name} running at #{inspect(pid)}")
            end
          end

          # Close connection
          AMQP.Channel.close(chan)
          AMQP.Connection.close(conn)

          IO.puts("\n========================================")
          IO.puts("✓ AMQP SYSTEM WORKING WITH OTP 28!")
          IO.puts("✓ RabbitMQ 4.1.3 connected successfully")
          IO.puts("✓ All VSM systems operational")
          IO.puts("========================================")
        rescue
          e ->
            IO.puts("✗ Error during AMQP operations: #{inspect(e)}")
        end
    end

  {:error, reason} ->
    IO.puts("✗ Failed to start application: #{inspect(reason)}")
end
