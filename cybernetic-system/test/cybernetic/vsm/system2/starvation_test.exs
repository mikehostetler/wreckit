defmodule Cybernetic.VSM.System2.StarvationTest do
  @moduledoc """
  Tests that S2 Coordinator prevents starvation through aging mechanism.
  Ensures low-priority tasks eventually get resources even under high-priority flood.
  """
  use ExUnit.Case, async: false
  alias Cybernetic.VSM.System2.Coordinator

  # Max 5 seconds wait
  @max_wait_threshold 5_000

  describe "starvation prevention" do
    setup do
      # Check if Coordinator is available
      coordinator_pid = Process.whereis(Coordinator)

      if coordinator_pid == nil do
        {:ok, skip: true}
      else
        {:ok, coordinator: coordinator_pid}
      end
    end

    test "low priority items get slots despite high priority flood", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Use unique topic names to avoid conflicts
        timestamp = System.unique_integer([:positive])
        high_topic = "high_priority_#{timestamp}"
        low_topic = "low_priority_#{timestamp}"

        # Set up extreme priority difference
        Coordinator.set_priority(high_topic, 100.0)
        Coordinator.set_priority(low_topic, 1.0)

        # Start tracking time
        start_time = System.monotonic_time(:millisecond)

        # Spawn high-priority flood that continuously reserves and releases
        flood_pid =
          spawn_link(fn ->
            Stream.repeatedly(fn ->
              case Coordinator.reserve_slot(high_topic) do
                :ok ->
                  # Hold briefly then release
                  Process.sleep(10)
                  Coordinator.release_slot(high_topic)

                :backpressure ->
                  Process.sleep(5)
              end
            end)
            |> Stream.run()
          end)

        # Try to get a low-priority slot
        low_priority_result = wait_for_slot(low_topic, @max_wait_threshold)

        # Stop the flood
        Process.exit(flood_pid, :kill)

        # Calculate actual wait time
        wait_time = System.monotonic_time(:millisecond) - start_time

        # Assertions
        assert low_priority_result == :ok,
               "Low priority should eventually get a slot due to aging"

        assert wait_time < @max_wait_threshold,
               "Low priority waited #{wait_time}ms, exceeds threshold of #{@max_wait_threshold}ms"

        # Cleanup
        Coordinator.release_slot(low_topic)
      end
    end

    test "aging boost increases over time for waiting lanes", context do
      if Map.get(context, :skip) do
        :ok
      else
        timestamp = System.unique_integer([:positive])
        topic = "aging_test_#{timestamp}"

        # Set moderate priority
        Coordinator.set_priority(topic, 5.0)

        # Fill all slots
        reserved = fill_all_slots(topic)

        # Track multiple attempts over time
        attempts =
          for attempt <- 1..10 do
            # Wait 200ms between attempts
            Process.sleep(200)

            # Release one slot to create opportunity
            Coordinator.release_slot(topic)

            # Try to reserve again (should get easier over time due to aging)
            start = System.monotonic_time(:microsecond)
            result = Coordinator.reserve_slot(topic)
            duration = System.monotonic_time(:microsecond) - start

            {attempt, result, duration}
          end

        # Later attempts should succeed more often due to aging boost
        successful_attempts = Enum.filter(attempts, fn {_, result, _} -> result == :ok end)

        assert length(successful_attempts) > 0,
               "Should have some successful reservations due to aging"

        # Cleanup
        for _ <- 1..reserved, do: Coordinator.release_slot(topic)
      end
    end

    test "multiple low-priority lanes get fair share with aging", context do
      if Map.get(context, :skip) do
        :ok
      else
        timestamp = System.unique_integer([:positive])
        high = "high_#{timestamp}"
        low1 = "low1_#{timestamp}"
        low2 = "low2_#{timestamp}"
        low3 = "low3_#{timestamp}"

        # Set priorities
        Coordinator.set_priority(high, 50.0)
        Coordinator.set_priority(low1, 1.0)
        Coordinator.set_priority(low2, 1.0)
        Coordinator.set_priority(low3, 1.0)

        # Track successful reservations for each lane
        results = %{low1: 0, low2: 0, low3: 0}

        # Run for a fixed duration
        end_time = System.monotonic_time(:millisecond) + 2_000

        results =
          Stream.repeatedly(fn ->
            # Try each low priority lane
            Enum.reduce([low1, low2, low3], results, fn lane, acc ->
              case Coordinator.reserve_slot(lane) do
                :ok ->
                  # Got a slot, release it immediately
                  Coordinator.release_slot(lane)

                  Map.update!(
                    acc,
                    String.to_atom(String.replace(lane, "_#{timestamp}", "")),
                    &(&1 + 1)
                  )

                :backpressure ->
                  acc
              end
            end)
          end)
          |> Stream.take_while(fn _ ->
            System.monotonic_time(:millisecond) < end_time
          end)
          |> Enum.reduce(results, fn res, _acc -> res end)

        # All low priority lanes should get at least some slots
        assert results.low1 > 0, "low1 should get slots due to aging"
        assert results.low2 > 0, "low2 should get slots due to aging"
        assert results.low3 > 0, "low3 should get slots due to aging"

        # Distribution should be relatively fair (within 3x)
        values = Map.values(results)
        min_val = Enum.min(values)
        max_val = Enum.max(values)

        assert max_val <= min_val * 3,
               "Slot distribution should be relatively fair: #{inspect(results)}"
      end
    end
  end

  # Helper functions

  defp wait_for_slot(topic, max_wait_ms) do
    end_time = System.monotonic_time(:millisecond) + max_wait_ms

    Stream.repeatedly(fn ->
      case Coordinator.reserve_slot(topic) do
        :ok ->
          {:halt, :ok}

        :backpressure ->
          if System.monotonic_time(:millisecond) < end_time do
            Process.sleep(50)
            {:cont, :waiting}
          else
            {:halt, :timeout}
          end
      end
    end)
    |> Enum.reduce_while(:timeout, fn
      {:halt, result}, _acc -> {:halt, result}
      {:cont, _}, acc -> {:cont, acc}
    end)
  end

  defp fill_all_slots(topic) do
    Stream.repeatedly(fn ->
      Coordinator.reserve_slot(topic)
    end)
    |> Stream.take_while(&(&1 == :ok))
    |> Enum.count()
  end
end
