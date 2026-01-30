defmodule Cybernetic.Archeology.MockPublisherTest do
  use ExUnit.Case, async: false
  alias Cybernetic.Archeology.MockPublisher

  describe "start_link/1" do
    test "starts in test environment" do
      # Ensure we're in test mode
      assert Application.get_env(:cybernetic, :environment) == :test

      # Start the mock publisher
      assert {:ok, pid} = MockPublisher.start_link()
      assert is_pid(pid)

      # Verify it's registered as the AMQP Publisher
      assert Process.whereis(Cybernetic.Core.Transport.AMQP.Publisher) == pid

      # Clean up
      GenServer.stop(pid)
    end

    test "refuses to start in production environment" do
      # Temporarily set environment to :prod
      original_env = Application.get_env(:cybernetic, :environment)
      Application.put_env(:cybernetic, :environment, :prod)

      try do
        assert {:error, :not_allowed_in_production} = MockPublisher.start_link()
      after
        # Restore original environment
        Application.put_env(:cybernetic, :environment, original_env)
      end
    end
  end

  describe "handle_call :publish" do
    setup do
      # Start the mock publisher if not already running
      pid = Process.whereis(Cybernetic.Core.Transport.AMQP.Publisher)

      if pid == nil do
        {:ok, pid} = MockPublisher.start_link()
        on_exit(fn ->
          if Process.alive?(pid), do: GenServer.stop(pid, :normal, 1000)
        end)
      end

      :ok
    end

    test "routes s2.coordinate messages to System2 handler" do
      payload = %{
        "coordination_id" => "test_123",
        "operation" => "test",
        "source_system" => "s1"
      }

      meta = %{trace_id: "test_trace_id"}

      # Publish via the Publisher interface
      assert :ok =
               Cybernetic.Core.Transport.AMQP.Publisher.publish(
                 "cyb.commands",
                 "s2.coordinate",
                 payload,
                 meta: meta
               )

      # Give the async handler time to process
      Process.sleep(100)
    end

    test "routes s4.intelligence messages to System4 handler" do
      payload = %{
        "coordination_id" => "test_456",
        "operation" => "intelligence",
        "source_system" => "s2"
      }

      meta = %{trace_id: "test_trace_id_2"}

      # Publish via the Publisher interface
      assert :ok =
               Cybernetic.Core.Transport.AMQP.Publisher.publish(
                 "cyb.commands",
                 "s4.intelligence",
                 payload,
                 meta: meta
               )

      # Give the async handler time to process
      Process.sleep(100)
    end

    test "returns error for unknown routing keys" do
      payload = %{"test" => "data"}

      # Publish with unknown routing key
      assert {:error, :unknown_routing_key} =
               Cybernetic.Core.Transport.AMQP.Publisher.publish(
                 "cyb.commands",
                 "unknown.system",
                 payload,
                 []
               )
    end
  end
end
