defmodule Cybernetic.Intelligence.CRDT.BeliefSetTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Intelligence.CRDT.BeliefSet

  setup do
    {:ok, pid} = start_supervised({BeliefSet, [name: :test_beliefs, node_id: "test_node"]})
    %{pid: pid}
  end

  describe "add/3" do
    test "adds a belief" do
      assert :ok = BeliefSet.add("preference", %{theme: "dark"}, server: :test_beliefs)
    end

    test "increments version on add" do
      assert BeliefSet.version(server: :test_beliefs) == 0
      :ok = BeliefSet.add("key1", "value1", server: :test_beliefs)
      assert BeliefSet.version(server: :test_beliefs) == 1
    end

    test "rejects values exceeding max size" do
      {:ok, _pid} =
        start_supervised(
          {BeliefSet, [name: :small_beliefs, max_value_size: 10]},
          id: :small_beliefs
        )

      large_value = String.duplicate("x", 100)

      assert {:error, :value_too_large} =
               BeliefSet.add("key", large_value, server: :small_beliefs)
    end

    test "respects max_beliefs limit" do
      {:ok, _pid} =
        start_supervised(
          {BeliefSet, [name: :limited_beliefs, max_beliefs: 2]},
          id: :limited_beliefs
        )

      :ok = BeliefSet.add("k1", "v1", server: :limited_beliefs)
      :ok = BeliefSet.add("k2", "v2", server: :limited_beliefs)
      assert {:error, :max_beliefs_reached} = BeliefSet.add("k3", "v3", server: :limited_beliefs)
    end
  end

  describe "get/2" do
    test "retrieves added belief" do
      :ok = BeliefSet.add("mykey", %{data: 123}, server: :test_beliefs)
      {:ok, value} = BeliefSet.get("mykey", server: :test_beliefs)
      assert value == %{data: 123}
    end

    test "returns error for non-existent belief" do
      assert {:error, :not_found} = BeliefSet.get("nonexistent", server: :test_beliefs)
    end
  end

  describe "remove/2" do
    test "removes a belief" do
      :ok = BeliefSet.add("to_remove", "value", server: :test_beliefs)
      assert :ok = BeliefSet.remove("to_remove", server: :test_beliefs)
      assert {:error, :not_found} = BeliefSet.get("to_remove", server: :test_beliefs)
    end

    test "returns error for non-existent belief" do
      assert {:error, :not_found} = BeliefSet.remove("not_there", server: :test_beliefs)
    end

    test "returns error for already removed (tombstone)" do
      :ok = BeliefSet.add("key", "val", server: :test_beliefs)
      :ok = BeliefSet.remove("key", server: :test_beliefs)
      assert {:error, :not_found} = BeliefSet.remove("key", server: :test_beliefs)
    end
  end

  describe "get_all/1" do
    test "returns all active beliefs" do
      :ok = BeliefSet.add("a", 1, server: :test_beliefs)
      :ok = BeliefSet.add("b", 2, server: :test_beliefs)
      :ok = BeliefSet.add("c", 3, server: :test_beliefs)

      beliefs = BeliefSet.get_all(server: :test_beliefs)
      assert beliefs == %{"a" => 1, "b" => 2, "c" => 3}
    end

    test "excludes tombstoned beliefs" do
      :ok = BeliefSet.add("active", 1, server: :test_beliefs)
      :ok = BeliefSet.add("removed", 2, server: :test_beliefs)
      :ok = BeliefSet.remove("removed", server: :test_beliefs)

      beliefs = BeliefSet.get_all(server: :test_beliefs)
      assert beliefs == %{"active" => 1}
    end
  end

  describe "exists?/2" do
    test "returns true for active belief" do
      :ok = BeliefSet.add("exists", "value", server: :test_beliefs)
      assert BeliefSet.exists?("exists", server: :test_beliefs) == true
    end

    test "returns false for non-existent belief" do
      assert BeliefSet.exists?("nope", server: :test_beliefs) == false
    end

    test "returns false for tombstoned belief" do
      :ok = BeliefSet.add("tombstone", "value", server: :test_beliefs)
      :ok = BeliefSet.remove("tombstone", server: :test_beliefs)
      assert BeliefSet.exists?("tombstone", server: :test_beliefs) == false
    end
  end

  describe "get_delta/2" do
    test "returns changes since version" do
      # version 1
      :ok = BeliefSet.add("d1", "v1", server: :test_beliefs)
      # version 2
      :ok = BeliefSet.add("d2", "v2", server: :test_beliefs)
      # version 3
      :ok = BeliefSet.add("d3", "v3", server: :test_beliefs)

      {:ok, delta} = BeliefSet.get_delta(1, server: :test_beliefs)

      assert delta.node_id == "test_node"
      assert delta.from_version == 1
      assert delta.to_version == 3
      # d2 and d3
      assert length(delta.entries) == 2
    end

    test "includes removed entries in delta" do
      # v1
      :ok = BeliefSet.add("will_remove", "val", server: :test_beliefs)
      # v2
      :ok = BeliefSet.remove("will_remove", server: :test_beliefs)

      {:ok, delta} = BeliefSet.get_delta(0, server: :test_beliefs)

      # Should include the entry (now tombstoned)
      assert length(delta.entries) == 1
      entry = hd(delta.entries)
      assert entry.tombstone == true
    end
  end

  describe "merge_delta/2" do
    test "merges remote delta" do
      remote_delta = %{
        node_id: "remote_node",
        from_version: 0,
        to_version: 2,
        entries: [
          %{
            id: "remote_key",
            value: "remote_value",
            added_by: "remote_node",
            added_at: 1,
            added_timestamp: System.system_time(:millisecond),
            tombstone: false,
            removed_at: nil,
            removed_timestamp: nil
          }
        ],
        timestamp: DateTime.utc_now()
      }

      assert :ok = BeliefSet.merge_delta(remote_delta, server: :test_beliefs)
      {:ok, value} = BeliefSet.get("remote_key", server: :test_beliefs)
      assert value == "remote_value"
    end

    test "resolves conflicts with LWW" do
      # Add local belief
      # added_at: 1
      :ok = BeliefSet.add("conflict", "local", server: :test_beliefs)

      # Merge remote with higher version
      remote_delta = %{
        node_id: "remote",
        from_version: 0,
        to_version: 5,
        entries: [
          %{
            id: "conflict",
            value: "remote",
            added_by: "remote",
            # Higher version wins
            added_at: 5,
            added_timestamp: System.system_time(:millisecond),
            tombstone: false,
            removed_at: nil,
            removed_timestamp: nil
          }
        ],
        timestamp: DateTime.utc_now()
      }

      :ok = BeliefSet.merge_delta(remote_delta, server: :test_beliefs)

      {:ok, value} = BeliefSet.get("conflict", server: :test_beliefs)
      # Remote wins due to higher version
      assert value == "remote"
    end
  end

  describe "stats/1" do
    test "returns statistics" do
      :ok = BeliefSet.add("s1", "v1", server: :test_beliefs)
      :ok = BeliefSet.add("s2", "v2", server: :test_beliefs)
      :ok = BeliefSet.remove("s2", server: :test_beliefs)

      stats = BeliefSet.stats(server: :test_beliefs)

      assert stats.node_id == "test_node"
      assert stats.active_beliefs == 1
      assert stats.tombstones == 1
      assert stats.adds == 2
      assert stats.removes == 1
    end
  end
end
