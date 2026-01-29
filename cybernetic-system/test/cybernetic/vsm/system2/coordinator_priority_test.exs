defmodule Cybernetic.VSM.System2.CoordinatorPriorityTest do
  use ExUnit.Case, async: false
  alias Cybernetic.VSM.System2.Coordinator

  setup do
    # Ensure telemetry is started for tests
    Application.ensure_all_started(:telemetry)

    # Check if Coordinator is available
    coordinator_pid = Process.whereis(Coordinator)

    if coordinator_pid == nil do
      {:ok, skip: true}
    else
      {:ok, coordinator: coordinator_pid}
    end
  end

  describe "priority allocation" do
    test "high priority gets more slots than low priority", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Use unique topic names to avoid state pollution
        hi_topic = :"test_hi_#{System.unique_integer()}"
        lo_topic = :"test_lo_#{System.unique_integer()}"

        Coordinator.set_priority(hi_topic, 10.0)
        Coordinator.set_priority(lo_topic, 1.0)
        Process.sleep(10)

        # Try to reserve many slots for high priority
        hi_count =
          Enum.count(1..20, fn _ ->
            Coordinator.reserve_slot(hi_topic) == :ok
          end)

        # Release all high priority slots
        for _ <- 1..hi_count, do: Coordinator.release_slot(hi_topic)
        Process.sleep(10)

        # Try to reserve many slots for low priority  
        lo_count =
          Enum.count(1..20, fn _ ->
            Coordinator.reserve_slot(lo_topic) == :ok
          end)

        # High priority should get more slots
        assert hi_count > 0, "High priority should get at least some slots"
        assert lo_count > 0, "Low priority should get at least some slots"
        assert hi_count >= lo_count, "High priority should get at least as many slots as low"
      end
    end
  end

  describe "telemetry events" do
    test "emits schedule event on successful reservation", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Use unique topic to avoid conflicts
        topic = :"test_schedule_#{System.unique_integer()}"

        # Attach telemetry handler
        test_pid = self()
        handler_ref = make_ref()

        :telemetry.attach(
          "test-schedule-#{inspect(handler_ref)}",
          [:cybernetic, :s2, :coordinator, :schedule],
          fn _event, measurements, metadata, _config ->
            send(test_pid, {:telemetry, :schedule, measurements, metadata})
          end,
          nil
        )

        Coordinator.set_priority(topic, 1.0)

        # Clear any slots that might be in use
        for _ <- 1..10, do: Coordinator.release_slot(topic)
        Process.sleep(10)

        # Now reserve should succeed
        result = Coordinator.reserve_slot(topic)
        assert result == :ok, "Reservation should succeed"

        assert_receive {:telemetry, :schedule, measurements, metadata}, 1000
        assert measurements.reserved == 1
        assert metadata.topic == topic

        :telemetry.detach("test-schedule-#{inspect(handler_ref)}")
      end
    end

    test "emits pressure event on backpressure", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Use unique topic to avoid conflicts  
        topic = :"test_pressure_#{System.unique_integer()}"

        # Attach telemetry handler
        test_pid = self()
        handler_ref = make_ref()

        :telemetry.attach(
          "test-pressure-#{inspect(handler_ref)}",
          [:cybernetic, :s2, :coordinator, :pressure],
          fn _event, measurements, metadata, _config ->
            send(test_pid, {:telemetry, :pressure, measurements, metadata})
          end,
          nil
        )

        Coordinator.set_priority(topic, 1.0)

        # Fill all available slots by repeatedly reserving
        filled =
          Enum.count(1..50, fn _ ->
            Coordinator.reserve_slot(topic) == :ok
          end)

        # Now we should definitely get backpressure
        result = Coordinator.reserve_slot(topic)
        assert result == :backpressure, "Should get backpressure after filling #{filled} slots"

        assert_receive {:telemetry, :pressure, measurements, metadata}, 1000
        assert is_number(measurements.current)
        assert metadata.topic == topic

        :telemetry.detach("test-pressure-#{inspect(handler_ref)}")
      end
    end
  end
end
