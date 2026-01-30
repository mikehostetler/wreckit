defmodule Cybernetic.Core.CRDTMergeTest do
  use ExUnit.Case

  alias DeltaCrdt.AWLWWMap

  test "converges regardless of order" do
    # Create two CRDT instances
    {:ok, a} = DeltaCrdt.start_link(AWLWWMap, sync_interval: 10)
    {:ok, b} = DeltaCrdt.start_link(AWLWWMap, sync_interval: 10)

    # Set them as neighbors
    DeltaCrdt.set_neighbours(a, [b])
    DeltaCrdt.set_neighbours(b, [a])

    # Add conflicting data to both
    DeltaCrdt.put(a, "session:42", %{token: 1, user: "alice"})
    DeltaCrdt.put(b, "session:42", %{token: 2, user: "bob"})

    # Add non-conflicting data
    DeltaCrdt.put(a, "config:db", %{host: "localhost"})
    DeltaCrdt.put(b, "config:cache", %{ttl: 300})

    # Wait for sync
    Process.sleep(50)

    # Read both states
    state_a = DeltaCrdt.to_map(a)
    state_b = DeltaCrdt.to_map(b)

    # They should have converged to the same state
    assert state_a == state_b

    # Both should have all keys
    assert Map.has_key?(state_a, "session:42")
    assert Map.has_key?(state_a, "config:db")
    assert Map.has_key?(state_a, "config:cache")

    # Clean up
    Process.unlink(a)
    Process.unlink(b)
    GenServer.stop(a)
    GenServer.stop(b)
  end

  test "idempotent operations" do
    {:ok, crdt} = DeltaCrdt.start_link(AWLWWMap, sync_interval: 1000)

    # Add the same value multiple times
    DeltaCrdt.put(crdt, "key1", %{value: "test"})
    state1 = DeltaCrdt.to_map(crdt)

    DeltaCrdt.put(crdt, "key1", %{value: "test"})
    state2 = DeltaCrdt.to_map(crdt)

    DeltaCrdt.put(crdt, "key1", %{value: "test"})
    state3 = DeltaCrdt.to_map(crdt)

    # State should be identical after repeated operations
    assert state1 == state2
    assert state2 == state3

    # Clean up
    Process.unlink(crdt)
    GenServer.stop(crdt)
  end

  test "commutative merge" do
    {:ok, a} = DeltaCrdt.start_link(AWLWWMap, sync_interval: 1000)
    {:ok, b} = DeltaCrdt.start_link(AWLWWMap, sync_interval: 1000)
    {:ok, c} = DeltaCrdt.start_link(AWLWWMap, sync_interval: 10)

    # Add data in different order
    DeltaCrdt.put(a, "x", 1)
    DeltaCrdt.put(a, "y", 2)

    DeltaCrdt.put(b, "y", 2)
    DeltaCrdt.put(b, "x", 1)

    # C merges from both A and B
    DeltaCrdt.set_neighbours(c, [a, b])
    DeltaCrdt.set_neighbours(a, [c])
    DeltaCrdt.set_neighbours(b, [c])

    # Wait for convergence
    Process.sleep(50)

    state_a = DeltaCrdt.to_map(a)
    state_b = DeltaCrdt.to_map(b)
    state_c = DeltaCrdt.to_map(c)

    # All should converge to same state
    assert state_a == state_b
    assert state_b == state_c

    # Clean up
    Process.unlink(a)
    Process.unlink(b)
    Process.unlink(c)
    GenServer.stop(a)
    GenServer.stop(b)
    GenServer.stop(c)
  end

  test "remove operations converge" do
    {:ok, a} = DeltaCrdt.start_link(AWLWWMap, sync_interval: 10)
    {:ok, b} = DeltaCrdt.start_link(AWLWWMap, sync_interval: 10)

    DeltaCrdt.set_neighbours(a, [b])
    DeltaCrdt.set_neighbours(b, [a])

    # Both add the same key
    DeltaCrdt.put(a, "temp", %{data: "value"})
    Process.sleep(20)

    # A removes it
    DeltaCrdt.delete(a, "temp")

    # B updates it (concurrent with remove)
    DeltaCrdt.put(b, "temp", %{data: "updated"})

    # Wait for convergence
    Process.sleep(50)

    state_a = DeltaCrdt.to_map(a)
    state_b = DeltaCrdt.to_map(b)

    # Should converge (last-write-wins or remove-wins depending on timestamps)
    assert state_a == state_b

    # Clean up
    Process.unlink(a)
    Process.unlink(b)
    GenServer.stop(a)
    GenServer.stop(b)
  end
end
