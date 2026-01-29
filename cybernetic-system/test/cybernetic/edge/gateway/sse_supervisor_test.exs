defmodule Cybernetic.Edge.Gateway.SSESupervisorTest do
  use ExUnit.Case

  alias Cybernetic.Edge.Gateway.SSESupervisor

  describe "start_link/1" do
    test "starts supervisor and initializes ETS table" do
      name = :"#{__MODULE__}.TestSupervisor_#{System.unique_integer()}"

      {:ok, pid} = SSESupervisor.start_link(name: name)
      assert Process.alive?(pid)

      # Verify ETS table exists
      assert :ets.whereis(:sse_connections) != :undefined

      Supervisor.stop(pid)
    end
  end

  describe "get_connection_count/1" do
    test "returns 0 for tenant with no connections" do
      name = :"#{__MODULE__}.CountSupervisor_#{System.unique_integer()}"
      {:ok, pid} = start_supervised({SSESupervisor, name: name})

      try do
        assert SSESupervisor.get_connection_count("nonexistent-tenant") == 0
      after
        SSESupervisor.reset_connections()
      end
    end

    test "returns count after manual ETS insert" do
      name = :"#{__MODULE__}.CountSupervisor2_#{System.unique_integer()}"
      {:ok, pid} = start_supervised({SSESupervisor, name: name})

      try do
        :ets.insert(:sse_connections, {"test-tenant-count", 5})
        assert SSESupervisor.get_connection_count("test-tenant-count") == 5
      after
        SSESupervisor.reset_connections()
      end
    end
  end

  describe "get_all_connections/0" do
    test "returns empty list when no connections" do
      name = :"#{__MODULE__}.AllSupervisor_#{System.unique_integer()}"
      {:ok, pid} = start_supervised({SSESupervisor, name: name})

      try do
        SSESupervisor.reset_connections()
        assert SSESupervisor.get_all_connections() == []
      after
        SSESupervisor.reset_connections()
      end
    end

    test "returns all tenant connections" do
      name = :"#{__MODULE__}.AllSupervisor2_#{System.unique_integer()}"
      {:ok, pid} = start_supervised({SSESupervisor, name: name})

      try do
        SSESupervisor.reset_connections()
        :ets.insert(:sse_connections, {"tenant-all-1", 3})
        :ets.insert(:sse_connections, {"tenant-all-2", 7})

        connections = SSESupervisor.get_all_connections()

        assert length(connections) == 2
        assert {"tenant-all-1", 3} in connections
        assert {"tenant-all-2", 7} in connections
      after
        SSESupervisor.reset_connections()
      end
    end
  end

  describe "reset_connections/0" do
    test "clears all connection counts" do
      name = :"#{__MODULE__}.ResetSupervisor_#{System.unique_integer()}"
      {:ok, pid} = start_supervised({SSESupervisor, name: name})

      :ets.insert(:sse_connections, {"tenant-reset-1", 3})
      :ets.insert(:sse_connections, {"tenant-reset-2", 7})

      assert :ok = SSESupervisor.reset_connections()
      assert SSESupervisor.get_all_connections() == []
    end
  end
end
