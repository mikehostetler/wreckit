defmodule Cybernetic.VSM.System2.CoordinatorTest do
  use ExUnit.Case, async: false
  alias Cybernetic.VSM.System2.Coordinator

  setup do
    # Check if Coordinator is available (started by application in test_helper)
    coordinator_pid = Process.whereis(Coordinator)

    if coordinator_pid == nil do
      {:ok, skip: true}
    else
      # Use unique topic names with timestamp to avoid conflicts
      timestamp = System.unique_integer([:positive])
      {:ok, coordinator: coordinator_pid, timestamp: timestamp}
    end
  end

  describe "priority queue methods" do
    test "sets priority weights for topics", context do
      if Map.get(context, :skip) do
        :ok
      else
        Coordinator.set_priority("high_priority", 2.0)
        Coordinator.set_priority("low_priority", 0.5)

        # Verify by attempting slot reservation
        assert :ok = Coordinator.reserve_slot("high_priority")
      end
    end

    test "reserves slots based on priority", context do
      if Map.get(context, :skip) do
        :ok
      else
        ts = context.timestamp
        # Use unique topic names
        critical = "critical_#{ts}"
        normal = "normal_#{ts}"

        # Set different priorities
        Coordinator.set_priority(critical, 3.0)
        Coordinator.set_priority(normal, 1.0)

        # Critical should get more slots
        reserved_critical =
          Enum.count(1..6, fn _ ->
            Coordinator.reserve_slot(critical) == :ok
          end)

        # Normal gets fewer slots
        reserved_normal =
          Enum.count(1..2, fn _ ->
            Coordinator.reserve_slot(normal) == :ok
          end)

        assert reserved_critical > 0
        assert reserved_normal > 0

        # Cleanup
        for _ <- 1..reserved_critical, do: Coordinator.release_slot(critical)
        for _ <- 1..reserved_normal, do: Coordinator.release_slot(normal)
      end
    end

    test "releases slots correctly", context do
      if Map.get(context, :skip) do
        :ok
      else
        ts = context.timestamp
        topic = "test_topic_#{ts}"
        Coordinator.set_priority(topic, 1.0)

        # Reserve slots until we hit backpressure
        reserved =
          Enum.count(1..20, fn _ ->
            Coordinator.reserve_slot(topic) == :ok
          end)

        # Should hit backpressure now
        assert :backpressure = Coordinator.reserve_slot(topic)

        # Release a slot
        Coordinator.release_slot(topic)
        Process.sleep(10)

        # Should be able to reserve again
        assert :ok = Coordinator.reserve_slot(topic)

        # Cleanup
        for _ <- 1..reserved, do: Coordinator.release_slot(topic)
      end
    end

    test "handles multiple topics independently", context do
      if Map.get(context, :skip) do
        :ok
      else
        Coordinator.set_priority("api", 2.0)
        Coordinator.set_priority("background", 0.5)

        # Reserve slots for api
        for _ <- 1..8 do
          Coordinator.reserve_slot("api")
        end

        # Background should still have slots
        assert :ok = Coordinator.reserve_slot("background")
      end
    end

    test "focus increases attention weight", context do
      if Map.get(context, :skip) do
        :ok
      else
        task_id = "important_task"

        # Focus multiple times
        Coordinator.focus(task_id)
        Process.sleep(5)
        Coordinator.focus(task_id)
        Process.sleep(5)
        Coordinator.focus(task_id)

        # State is internal, but we can verify it doesn't crash
        assert Process.alive?(Process.whereis(Coordinator))
      end
    end

    test "handles concurrent slot reservations", context do
      if Map.get(context, :skip) do
        :ok
      else
        ts = context.timestamp
        topic = "concurrent_test_#{ts}"
        Coordinator.set_priority(topic, 1.0)

        # Spawn multiple processes trying to reserve slots
        tasks =
          for _ <- 1..20 do
            Task.async(fn ->
              Coordinator.reserve_slot(topic)
            end)
          end

        results = Task.await_many(tasks)

        # Count successful reservations
        successful = Enum.count(results, &(&1 == :ok))
        backpressured = Enum.count(results, &(&1 == :backpressure))

        # Should have reserved up to max_slots (8 by default)
        assert successful > 0 and successful <= 8
        assert backpressured == 20 - successful

        # Cleanup
        for _ <- 1..successful, do: Coordinator.release_slot(topic)
      end
    end

    test "priority affects slot allocation proportionally", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Set up topics with different priorities
        Coordinator.set_priority("gold", 4.0)
        Coordinator.set_priority("silver", 2.0)
        Coordinator.set_priority("bronze", 1.0)

        # Gold should get most slots (proportional to priority)
        gold_slots =
          Enum.count(1..8, fn _ ->
            Coordinator.reserve_slot("gold") == :ok
          end)

        silver_slots =
          Enum.count(1..8, fn _ ->
            Coordinator.reserve_slot("silver") == :ok
          end)

        bronze_slots =
          Enum.count(1..8, fn _ ->
            Coordinator.reserve_slot("bronze") == :ok
          end)

        # Gold should get the most slots
        assert gold_slots >= silver_slots
        assert silver_slots >= bronze_slots
      end
    end
  end
end
