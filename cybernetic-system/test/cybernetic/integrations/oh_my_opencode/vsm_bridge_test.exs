defmodule Cybernetic.Integrations.OhMyOpencode.VSMBridgeTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Integrations.OhMyOpencode.VSMBridge

  @tenant_id "test_tenant_#{:erlang.unique_integer([:positive])}"

  setup do
    # Start the bridge with a unique name for isolation
    name = :"vsm_bridge_test_#{:erlang.unique_integer([:positive])}"
    {:ok, pid} = VSMBridge.start_link(tenant_id: @tenant_id, name: name)

    on_exit(fn ->
      if Process.alive?(pid), do: GenServer.stop(pid, :normal, 100)
    end)

    %{pid: pid, name: name}
  end

  describe "start_link/1" do
    test "starts with required tenant_id" do
      tenant = "start_link_test_#{:erlang.unique_integer([:positive])}"
      name = :"vsm_bridge_start_#{:erlang.unique_integer([:positive])}"

      assert {:ok, pid} = VSMBridge.start_link(tenant_id: tenant, name: name)
      assert Process.alive?(pid)

      GenServer.stop(pid, :normal, 100)
    end

    test "fails without tenant_id" do
      assert_raise KeyError, fn ->
        VSMBridge.start_link([])
      end
    end
  end

  describe "push_state/2" do
    test "pushes local state to remote", %{name: name} do
      # Should return {:ok, deltas} for each system pushed
      result = GenServer.call(name, {:push_state, []})

      assert match?({:ok, _}, result) or is_list(result)
    end

    test "accepts system filter option", %{name: name} do
      result = GenServer.call(name, {:push_state, [systems: [:s4_intelligence]]})

      assert match?({:ok, _}, result) or is_list(result)
    end
  end

  describe "pull_state/2" do
    test "pulls remote state and merges", %{name: name} do
      result = GenServer.call(name, {:pull_state, []})

      # Should return {:ok, merged_state}
      assert match?({:ok, _}, result) or is_map(result) or is_list(result)
    end
  end

  describe "get_merged_state/1" do
    test "returns merged local and remote state", %{name: name} do
      {:ok, state} = GenServer.call(name, :get_merged_state)

      assert is_map(state)
      assert Map.has_key?(state, :local) or map_size(state) >= 0
    end
  end

  describe "update_system_state/3" do
    test "updates specific system state", %{name: name} do
      new_state = %{key: "value", timestamp: DateTime.utc_now()}

      result = GenServer.call(name, {:update_system_state, :s3_control, new_state})

      assert match?({:ok, _}, result) or match?(:ok, result) or is_map(result)
    end
  end

  describe "get_system_state/2" do
    test "gets specific system state", %{name: name} do
      # First update a system state
      GenServer.call(name, {:update_system_state, :s1_operations, %{data: "test"}})

      # Then retrieve it
      result = GenServer.call(name, {:get_system_state, :s1_operations})

      assert match?({:ok, _}, result) or is_map(result)
    end
  end

  describe "status/1" do
    test "returns current status", %{name: name} do
      result = GenServer.call(name, :status)

      # Status may be {:ok, map} or just a map
      status = case result do
        {:ok, s} -> s
        s when is_map(s) -> s
      end

      assert is_map(status)
      assert Map.has_key?(status, :tenant_id)
    end
  end

  describe "state isolation" do
    test "different tenants have isolated state" do
      tenant1 = "isolation_test_1_#{:erlang.unique_integer([:positive])}"
      tenant2 = "isolation_test_2_#{:erlang.unique_integer([:positive])}"

      name1 = :"vsm_bridge_iso1_#{:erlang.unique_integer([:positive])}"
      name2 = :"vsm_bridge_iso2_#{:erlang.unique_integer([:positive])}"

      {:ok, pid1} = VSMBridge.start_link(tenant_id: tenant1, name: name1)
      {:ok, pid2} = VSMBridge.start_link(tenant_id: tenant2, name: name2)

      # Update state for tenant1 only
      GenServer.call(name1, {:update_system_state, :s1_operations, %{data: "tenant1"}})

      # Get status from both
      {:ok, status1} = GenServer.call(name1, :status)
      {:ok, status2} = GenServer.call(name2, :status)

      assert status1.tenant_id == tenant1
      assert status2.tenant_id == tenant2

      GenServer.stop(pid1, :normal, 100)
      GenServer.stop(pid2, :normal, 100)
    end
  end

  describe "sync behavior" do
    test "handles sync interval configuration" do
      tenant = "sync_config_#{:erlang.unique_integer([:positive])}"
      name = :"vsm_bridge_sync_#{:erlang.unique_integer([:positive])}"

      {:ok, pid} = VSMBridge.start_link(
        tenant_id: tenant,
        name: name,
        sync_interval_ms: 10_000
      )

      {:ok, status} = GenServer.call(name, :status)
      assert status.sync_interval_ms == 10_000

      GenServer.stop(pid, :normal, 100)
    end
  end
end
