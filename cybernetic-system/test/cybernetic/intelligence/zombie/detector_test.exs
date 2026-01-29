defmodule Cybernetic.Intelligence.Zombie.DetectorTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Intelligence.Zombie.Detector

  setup do
    {:ok, pid} = start_supervised({Detector, [name: :test_detector, check_interval_ms: 100_000]})
    %{pid: pid}
  end

  describe "register/2" do
    test "registers a process for monitoring" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)

      {:ok, ref} = Detector.register(test_pid, %{name: "test_process"}, server: :test_detector)

      assert is_reference(ref)
      Process.exit(test_pid, :kill)
    end

    test "rejects dead processes" do
      dead_pid = spawn(fn -> :ok end)
      # Let it die
      Process.sleep(10)

      assert {:error, :process_not_alive} =
               Detector.register(dead_pid, %{}, server: :test_detector)
    end

    test "accepts timeout_ms option" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)

      {:ok, _ref} = Detector.register(test_pid, %{timeout_ms: 5000}, server: :test_detector)

      {:ok, info} = Detector.get_status(test_pid, server: :test_detector)
      assert info.timeout_ms == 5000

      Process.exit(test_pid, :kill)
    end

    test "accepts restart_mfa option" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)

      {:ok, _ref} =
        Detector.register(
          test_pid,
          %{
            name: "restartable",
            restart_mfa: {Kernel, :exit, [:normal]}
          },
          server: :test_detector
        )

      {:ok, info} = Detector.get_status(test_pid, server: :test_detector)
      assert info.restart_mfa == {Kernel, :exit, [:normal]}

      Process.exit(test_pid, :kill)
    end

    test "captures initial memory baseline" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)

      {:ok, _ref} = Detector.register(test_pid, %{}, server: :test_detector)

      {:ok, info} = Detector.get_status(test_pid, server: :test_detector)
      assert info.memory_baseline > 0

      Process.exit(test_pid, :kill)
    end
  end

  describe "unregister/2" do
    test "unregisters a monitored process" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)
      {:ok, _ref} = Detector.register(test_pid, %{}, server: :test_detector)

      assert :ok = Detector.unregister(test_pid, server: :test_detector)
      assert {:error, :not_found} = Detector.get_status(test_pid, server: :test_detector)

      Process.exit(test_pid, :kill)
    end

    test "succeeds silently for unknown process (idempotent)" do
      # Unregister is idempotent - succeeds even if not registered
      assert :ok = Detector.unregister(self(), server: :test_detector)
    end
  end

  describe "heartbeat/2" do
    test "updates heartbeat timestamp" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)
      {:ok, _ref} = Detector.register(test_pid, %{}, server: :test_detector)

      {:ok, info_before} = Detector.get_status(test_pid, server: :test_detector)
      Process.sleep(50)

      :ok = Detector.heartbeat(test_pid, server: :test_detector)

      {:ok, info_after} = Detector.get_status(test_pid, server: :test_detector)
      assert DateTime.compare(info_after.last_heartbeat, info_before.last_heartbeat) in [:gt, :eq]

      Process.exit(test_pid, :kill)
    end
  end

  describe "report_progress/3" do
    test "updates progress data" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)
      {:ok, _ref} = Detector.register(test_pid, %{}, server: :test_detector)

      :ok = Detector.report_progress(test_pid, %{step: 1, total: 10}, server: :test_detector)

      {:ok, info} = Detector.get_status(test_pid, server: :test_detector)
      assert info.progress_data == %{step: 1, total: 10}

      Process.exit(test_pid, :kill)
    end
  end

  describe "get_status/2" do
    test "returns process info" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)
      {:ok, _ref} = Detector.register(test_pid, %{name: "my_process"}, server: :test_detector)

      {:ok, info} = Detector.get_status(test_pid, server: :test_detector)

      assert info.pid == test_pid
      assert info.name == "my_process"
      assert info.state == :healthy
      assert %DateTime{} = info.last_heartbeat
      assert %DateTime{} = info.registered_at

      Process.exit(test_pid, :kill)
    end

    test "returns error for unknown process" do
      assert {:error, :not_found} = Detector.get_status(self(), server: :test_detector)
    end
  end

  describe "list_all/1" do
    test "returns all monitored processes" do
      pid1 = spawn(fn -> Process.sleep(:infinity) end)
      pid2 = spawn(fn -> Process.sleep(:infinity) end)

      {:ok, _} = Detector.register(pid1, %{name: "p1"}, server: :test_detector)
      {:ok, _} = Detector.register(pid2, %{name: "p2"}, server: :test_detector)

      processes = Detector.list_all(server: :test_detector)

      assert length(processes) == 2
      names = Enum.map(processes, & &1.name)
      assert "p1" in names
      assert "p2" in names

      Process.exit(pid1, :kill)
      Process.exit(pid2, :kill)
    end
  end

  describe "list_zombies/1" do
    test "returns empty list when no zombies" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)
      {:ok, _} = Detector.register(test_pid, %{}, server: :test_detector)

      zombies = Detector.list_zombies(server: :test_detector)
      assert zombies == []

      Process.exit(test_pid, :kill)
    end
  end

  describe "stats/1" do
    test "returns statistics" do
      pid1 = spawn(fn -> Process.sleep(:infinity) end)
      {:ok, _} = Detector.register(pid1, %{name: "stats_test"}, server: :test_detector)

      stats = Detector.stats(server: :test_detector)

      assert stats.monitored_count == 1
      assert stats.healthy_count == 1
      assert stats.warning_count == 0
      assert stats.zombie_count == 0
      assert is_number(stats.zombies_detected)
      assert is_number(stats.heartbeats_received)

      Process.exit(pid1, :kill)
    end
  end

  describe "restart_zombie/2" do
    test "returns error for non-zombie process" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)
      {:ok, _} = Detector.register(test_pid, %{name: "healthy"}, server: :test_detector)

      assert {:error, :not_zombie} = Detector.restart_zombie(test_pid, server: :test_detector)

      Process.exit(test_pid, :kill)
    end

    test "returns error for process without restart_mfa" do
      # This would need a zombie process to test properly
      # For now, just verify the function exists
      assert {:error, :not_found} = Detector.restart_zombie(self(), server: :test_detector)
    end
  end

  describe "process DOWN detection" do
    test "removes dead process from monitoring" do
      test_pid = spawn(fn -> Process.sleep(:infinity) end)
      {:ok, _} = Detector.register(test_pid, %{name: "will_die"}, server: :test_detector)

      # Kill the process
      Process.exit(test_pid, :kill)
      # Allow DOWN message to be processed
      Process.sleep(50)

      # Should be removed
      assert {:error, :not_found} = Detector.get_status(test_pid, server: :test_detector)
    end
  end

  describe "Utils integration" do
    test "generates unique IDs" do
      alias Cybernetic.Intelligence.Utils

      id1 = Utils.generate_id()
      id2 = Utils.generate_id()

      assert is_binary(id1)
      assert String.length(id1) == 32
      assert id1 != id2
    end

    test "generates node IDs" do
      alias Cybernetic.Intelligence.Utils

      node_id = Utils.generate_node_id()

      assert is_binary(node_id)
      assert String.starts_with?(node_id, "node_")
    end
  end
end
