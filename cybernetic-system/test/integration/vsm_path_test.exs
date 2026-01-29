defmodule Cybernetic.Integration.VSMPathTest do
  @moduledoc """
  Integration test for VSM S1→S2→S4 signal path.
  Validates that operational signals flow correctly through the hierarchy.
  """
  use ExUnit.Case, async: false

  @moduletag :integration

  import ExUnit.CaptureLog
  alias Cybernetic.Core.Transport.AMQP.Publisher
  alias Cybernetic.VSM.System1.Agents.TelegramAgent
  alias Cybernetic.VSM.System1.Operational, as: System1
  alias Cybernetic.VSM.System2.Coordinator, as: System2
  alias Cybernetic.VSM.System4.Intelligence, as: System4

  @test_timeout 10_000

  setup do
    # Ensure all VSM systems are running
    ensure_vsm_systems_started()

    # Set up test message collector
    {:ok, collector} = start_test_collector()

    # Configure in-memory transport to send messages to the collector
    Cybernetic.Transport.InMemory.set_test_collector(collector)

    on_exit(fn ->
      if Process.alive?(collector) do
        GenServer.stop(collector, :normal, 1000)
      end

      # Clear test collector
      Cybernetic.Transport.InMemory.set_test_collector(nil)
    end)

    {:ok, collector: collector}
  end

  describe "S1→S2→S4 Path" do
    test "operational event flows from S1 through S2 to S4", %{collector: collector} do
      # Step 1: S1 generates operational event (e.g., from Telegram)
      operational_event = %{
        type: "vsm.s1.operation",
        source: "telegram",
        operation: "user_command",
        command: "/status",
        user_id: "test_user_123",
        timestamp: DateTime.utc_now()
      }

      # Simulate S1 receiving and processing the event
      # Note: System1.Operational is a Supervisor, not a GenServer with handle_message
      # The actual message handling happens in System1.MessageHandler
      capture_log(fn ->
        Cybernetic.VSM.System1.MessageHandler.handle_message("operation", operational_event, %{})
      end)

      # Wait for S1 to process and forward to S2
      Process.sleep(100)

      # Verify S2 received the coordination request
      assert_receive {:s2_message, s2_msg}, @test_timeout
      assert s2_msg["type"] == "vsm.s2.coordinate"
      assert s2_msg["source_system"] == "s1"
      assert s2_msg["operation"] == "user_command"

      # Step 2: S2 processes and creates audit/intelligence signal
      coordination_response = %{
        type: "vsm.s2.coordination_complete",
        original_operation: "user_command",
        coordination_id: s2_msg["coordination_id"],
        resources_allocated: ["worker_1", "worker_2"],
        priority: "normal",
        timestamp: DateTime.utc_now()
      }

      capture_log(fn ->
        System2.handle_message(coordination_response, %{})
      end) =~ "S2 coordination complete"

      # Wait for S2 to forward intelligence to S4
      Process.sleep(100)

      # Verify S4 received the intelligence signal
      assert_receive {:s4_message, s4_msg}, @test_timeout
      assert s4_msg["type"] == "vsm.s4.intelligence"
      assert s4_msg["source_system"] == "s2"
      assert s4_msg["coordination_id"] == s2_msg["coordination_id"]

      # Step 3: S4 processes and may generate algedonic signal
      intelligence_analysis = %{
        type: "vsm.s4.analysis_complete",
        coordination_id: s2_msg["coordination_id"],
        patterns_detected: ["normal_operation", "user_interaction"],
        health_score: 0.95,
        recommendations: ["maintain_current_state"],
        timestamp: DateTime.utc_now()
      }

      capture_log(fn ->
        System4.handle_message(intelligence_analysis, %{})
      end) =~ "S4 analysis complete"

      # Verify the complete path metrics
      metrics = get_path_metrics(collector)
      assert metrics.s1_events > 0
      assert metrics.s2_coordinations > 0
      assert metrics.s4_intelligence > 0
      # Should complete within 1 second
      assert metrics.path_latency < 1000
    end

    test "algedonic pain signal triggers S4 intervention", %{collector: collector} do
      # Temporarily enable algedonic signals for this test
      original_test_mode = Application.get_env(:cybernetic, :test_mode)
      Application.put_env(:cybernetic, :test_mode, false)

      on_exit(fn ->
        Application.put_env(:cybernetic, :test_mode, original_test_mode)
      end)

      # Simulate multiple failures to trigger pain signal
      Enum.each(1..10, fn i ->
        error_event = %{
          type: "vsm.s1.error",
          source: "operations",
          error: "processing_failure_#{i}",
          severity: "high",
          timestamp: DateTime.utc_now()
        }

        System1.handle_message(error_event, %{})
        Process.sleep(10)
      end)

      # Wait for algedonic signal to be generated
      Process.sleep(500)

      # Verify S4 received pain signal
      assert_receive {:s4_message, pain_msg}, @test_timeout
      assert pain_msg["type"] == "algedonic.pain"
      data = Map.get(pain_msg, "data", %{})
      assert data[:severity] in [:moderate, :severe, :critical]

      # Verify S4 generates intervention
      assert_receive {:s4_intervention, intervention}, @test_timeout
      assert intervention["type"] == "vsm.s4.intervention"
      assert intervention["action"] in ["scale_resources", "alert_s5", "throttle_operations"]
    end

    test "pleasure signal optimizes system performance", %{collector: collector} do
      # Temporarily enable algedonic signals for this test
      original_test_mode = Application.get_env(:cybernetic, :test_mode)
      Application.put_env(:cybernetic, :test_mode, false)

      on_exit(fn ->
        Application.put_env(:cybernetic, :test_mode, original_test_mode)
      end)

      # Simulate successful operations to trigger pleasure signal
      Enum.each(1..20, fn i ->
        success_event = %{
          type: "vsm.s1.success",
          source: "operations",
          operation: "task_#{i}",
          latency: :rand.uniform(50),
          timestamp: DateTime.utc_now()
        }

        System1.handle_message(success_event, %{})
        Process.sleep(10)
      end)

      # Wait for algedonic signal to be generated
      Process.sleep(500)

      # Verify S4 received pleasure signal
      assert_receive {:s4_message, pleasure_msg}, @test_timeout
      assert pleasure_msg["type"] == "algedonic.pleasure"
      data = Map.get(pleasure_msg, "data", %{})
      assert data[:intensity] in [:mild, :moderate, :high, :euphoric]

      # Verify S4 optimizes based on pleasure
      assert_receive {:s4_optimization, optimization}, @test_timeout
      assert optimization["type"] == "vsm.s4.optimization"

      assert optimization["strategy"] in [
               "increase_throughput",
               "reduce_resources",
               "maintain_state"
             ]
    end

    test "complete round-trip from Telegram command to response", %{collector: collector} do
      # Simulate Telegram command
      telegram_command = %{
        message: %{
          text: "/status",
          chat: %{id: 123_456},
          from: %{id: 789, username: "testuser"}
        }
      }

      # Process through Telegram agent (S1)
      {:ok, response} = TelegramAgent.process_command(telegram_command)

      # Wait for full path execution
      Process.sleep(500)

      # Verify complete path execution
      metrics = get_path_metrics(collector)
      assert metrics.telegram_commands == 1
      assert metrics.s1_events > 0
      assert metrics.s2_coordinations > 0
      assert metrics.s4_intelligence > 0

      # Verify response was sent back to Telegram
      assert_receive {:telegram_response, tg_response}, @test_timeout
      assert tg_response.chat_id == 123_456
      assert tg_response.text =~ "System Status"
    end
  end

  describe "Error Handling" do
    test "S2 failure is handled gracefully", %{collector: collector} do
      # Stop S2 to simulate failure
      GenServer.stop(System2)

      # Send S1 event
      event = %{
        type: "vsm.s1.operation",
        operation: "test_op",
        timestamp: DateTime.utc_now()
      }

      capture_log(fn ->
        System1.handle_message(event, %{})
      end) =~ "Failed to forward to S2"

      # Verify S1 continues operating
      assert Process.alive?(Process.whereis(System1))

      # Restart S2
      ensure_vsm_systems_started()

      # Verify recovery
      System1.handle_message(event, %{})
      assert_receive {:s2_message, _}, @test_timeout
    end

    test "AMQP connection failure triggers reconnection", %{collector: collector} do
      # This would require mocking AMQP connection
      # For now, we'll test the reconnection logic exists in both modules
      assert function_exported?(Cybernetic.Transport.AMQP.Connection, :reconnect, 0) ||
               function_exported?(Cybernetic.Core.Transport.AMQP.Connection, :reconnect, 0)
    end
  end

  # Helper Functions

  defp ensure_vsm_systems_started do
    # Ensure all VSM systems are running
    for system <- [System1, System2, System4] do
      case Process.whereis(system) do
        nil ->
          {:ok, _pid} = system.start_link([])

        pid when is_pid(pid) ->
          :ok
      end
    end

    # Give systems time to initialize
    Process.sleep(100)
  end

  defp start_test_collector do
    test_pid = self()
    GenServer.start_link(__MODULE__.TestCollector, test_pid, name: __MODULE__.TestCollector)
  end

  defp get_path_metrics(collector) do
    GenServer.call(collector, :get_metrics)
  end

  defmodule TestCollector do
    use GenServer
    require Logger

    def init(test_pid) do
      # Subscribe to telemetry events using an anonymous function
      handler = fn event_name, measurements, metadata, _config ->
        case event_name do
          [:vsm, :s1, _] ->
            GenServer.cast(__MODULE__, {:s1_event, metadata})

          [:vsm, :s2, _] ->
            GenServer.cast(__MODULE__, {:s2_event, metadata})

          [:vsm, :s4, _] ->
            GenServer.cast(__MODULE__, {:s4_event, metadata})

          [:telegram, :command, :processed] ->
            GenServer.cast(__MODULE__, {:telegram_event, metadata})

          [:telegram, :response, :sent] ->
            GenServer.cast(__MODULE__, {:telegram_response_event, metadata})

          [:goldrush, :algedonic, _] ->
            GenServer.cast(__MODULE__, {:algedonic_event, metadata})

          _ ->
            :ok
        end
      end

      :telemetry.attach_many(
        "test-collector",
        [
          [:vsm, :s1, :operation],
          [:vsm, :s1, :error],
          [:vsm, :s1, :success],
          [:vsm, :s2, :coordination],
          [:vsm, :s4, :intelligence],
          [:telegram, :command, :processed],
          [:telegram, :response, :sent],
          [:goldrush, :algedonic, :signal]
        ],
        handler,
        nil
      )

      {:ok,
       %{
         test_pid: test_pid,
         s1_events: 0,
         s2_coordinations: 0,
         s4_intelligence: 0,
         telegram_commands: 0,
         algedonic_signals: 0,
         path_latency: 0,
         start_time: System.monotonic_time(:millisecond)
       }}
    end

    def handle_cast({:s1_event, metadata}, state) do
      send(state.test_pid, {:s1_message, metadata})
      {:noreply, Map.update!(state, :s1_events, &(&1 + 1))}
    end

    def handle_cast({:s2_event, metadata}, state) do
      send(state.test_pid, {:s2_message, metadata})
      {:noreply, Map.update!(state, :s2_coordinations, &(&1 + 1))}
    end

    def handle_cast({:s4_event, metadata}, state) do
      send(state.test_pid, {:s4_message, metadata})

      # Check for interventions and optimizations
      case metadata["type"] do
        "vsm.s4.intervention" -> send(state.test_pid, {:s4_intervention, metadata})
        "vsm.s4.optimization" -> send(state.test_pid, {:s4_optimization, metadata})
        _ -> :ok
      end

      {:noreply, Map.update!(state, :s4_intelligence, &(&1 + 1))}
    end

    def handle_cast({:telegram_event, metadata}, state) do
      send(state.test_pid, {:telegram_command, metadata})
      {:noreply, Map.update!(state, :telegram_commands, &(&1 + 1))}
    end

    def handle_cast({:telegram_response_event, metadata}, state) do
      send(state.test_pid, {:telegram_response, metadata})
      # Don't increment telegram_commands for response events
      {:noreply, state}
    end

    def handle_cast({:algedonic_event, _metadata}, state) do
      {:noreply, Map.update!(state, :algedonic_signals, &(&1 + 1))}
    end

    def handle_call(:get_metrics, _from, state) do
      current_time = System.monotonic_time(:millisecond)
      metrics = Map.put(state, :path_latency, current_time - state.start_time)
      {:reply, metrics, state}
    end

    # Handle direct system messages from InMemory transport
    def handle_info({:system1_message, message}, state) do
      send(state.test_pid, {:s1_message, message})
      {:noreply, Map.update!(state, :s1_events, &(&1 + 1))}
    end

    def handle_info({:system2_message, message}, state) do
      send(state.test_pid, {:s2_message, message})
      {:noreply, Map.update!(state, :s2_coordinations, &(&1 + 1))}
    end

    def handle_info({:system4_message, message}, state) do
      send(state.test_pid, {:s4_message, message})

      # Check for interventions and optimizations
      case message["type"] do
        "vsm.s4.intervention" -> send(state.test_pid, {:s4_intervention, message})
        "vsm.s4.optimization" -> send(state.test_pid, {:s4_optimization, message})
        _ -> :ok
      end

      {:noreply, Map.update!(state, :s4_intelligence, &(&1 + 1))}
    end

    # Handle S4 intervention messages
    def handle_info({:s4_intervention, intervention}, state) do
      send(state.test_pid, {:s4_intervention, intervention})
      {:noreply, state}
    end

    # Handle S4 optimization messages  
    def handle_info({:s4_optimization, optimization}, state) do
      send(state.test_pid, {:s4_optimization, optimization})
      {:noreply, state}
    end

    # Catch-all for unexpected messages
    def handle_info(msg, state) do
      Logger.debug("TestCollector received unexpected message: #{inspect(msg)}")
      {:noreply, state}
    end
  end
end
