defmodule Cybernetic.Storage.SupervisorTest do
  use ExUnit.Case

  alias Cybernetic.Storage.Supervisor, as: StorageSupervisor

  describe "start_link/1" do
    test "starts supervisor with default name" do
      # Clean up any existing supervisor
      case Process.whereis(StorageSupervisor) do
        nil -> :ok
        pid -> GenServer.stop(pid)
      end

      assert {:ok, pid} = StorageSupervisor.start_link([])
      assert Process.alive?(pid)

      # Clean up
      Supervisor.stop(pid)
    end

    test "starts supervisor with custom name" do
      name = :"#{__MODULE__}.TestSupervisor"

      assert {:ok, pid} = StorageSupervisor.start_link(name: name)
      assert Process.alive?(pid)
      assert Process.whereis(name) == pid

      Supervisor.stop(pid)
    end

    test "starts Memory adapter when configured" do
      name = :"#{__MODULE__}.MemorySupervisor"

      assert {:ok, pid} =
               StorageSupervisor.start_link(
                 name: name,
                 adapter: Cybernetic.Storage.Adapters.Memory
               )

      # Check that Memory adapter is a child
      children = Supervisor.which_children(pid)
      assert length(children) > 0

      Supervisor.stop(pid)
    end

    test "starts with no children for Local adapter" do
      name = :"#{__MODULE__}.LocalSupervisor"

      assert {:ok, pid} =
               StorageSupervisor.start_link(
                 name: name,
                 adapter: Cybernetic.Storage.Adapters.Local
               )

      children = Supervisor.which_children(pid)
      assert children == []

      Supervisor.stop(pid)
    end
  end
end
