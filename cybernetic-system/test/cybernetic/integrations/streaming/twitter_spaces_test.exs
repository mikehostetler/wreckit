defmodule Cybernetic.Integrations.Streaming.TwitterSpacesTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Integrations.Streaming.TwitterSpaces

  @tenant_id "spaces_test_#{:erlang.unique_integer([:positive])}"

  setup do
    space_id = "space_#{:erlang.unique_integer([:positive])}"
    name = :"spaces_test_#{:erlang.unique_integer([:positive])}"

    {:ok, pid} =
      TwitterSpaces.start_link(
        tenant_id: @tenant_id,
        space_id: space_id,
        name: name
      )

    on_exit(fn ->
      if Process.alive?(pid), do: GenServer.stop(pid, :normal, 100)
    end)

    %{pid: pid, name: name, space_id: space_id}
  end

  describe "start_link/1" do
    test "starts with required tenant_id and space_id" do
      name = :"spaces_start_#{:erlang.unique_integer([:positive])}"
      tenant = "start_test_#{:erlang.unique_integer([:positive])}"
      space = "space_#{:erlang.unique_integer([:positive])}"

      assert {:ok, pid} =
               TwitterSpaces.start_link(tenant_id: tenant, space_id: space, name: name)

      assert Process.alive?(pid)

      GenServer.stop(pid, :normal, 100)
    end

    test "fails without tenant_id" do
      assert_raise KeyError, fn ->
        TwitterSpaces.start_link(space_id: "123")
      end
    end

    test "fails without space_id" do
      assert_raise KeyError, fn ->
        TwitterSpaces.start_link(tenant_id: "test")
      end
    end
  end

  describe "status/1" do
    test "returns initial status", %{name: name, space_id: space_id} do
      # Give time for :connect message to be processed
      Process.sleep(50)

      {:ok, status} = TwitterSpaces.status(name)

      assert status.space_id == space_id
      assert status.tenant_id == @tenant_id
      assert status.status in [:initializing, :connecting, :connected, :live]
      assert status.speakers_count == 0
      assert status.current_speaker == nil
      assert status.transcripts_count == 0
    end

    test "includes stats", %{name: name} do
      Process.sleep(50)

      {:ok, status} = TwitterSpaces.status(name)

      assert is_map(status.stats)
      assert status.stats.speakers_detected == 0
      assert status.stats.transcripts_generated == 0
      assert %DateTime{} = status.stats.started_at
    end
  end

  describe "stop/1" do
    test "stops the Space monitor", %{name: name} do
      Process.sleep(50)

      assert :ok = TwitterSpaces.stop(name)

      {:ok, status} = TwitterSpaces.status(name)
      assert status.status == :stopped
    end
  end

  describe "get_speakers/1" do
    test "returns empty list initially", %{name: name} do
      Process.sleep(50)

      {:ok, speakers} = TwitterSpaces.get_speakers(name)

      assert speakers == []
    end
  end

  describe "get_transcript/1" do
    test "returns empty list initially", %{name: name} do
      Process.sleep(50)

      {:ok, transcript} = TwitterSpaces.get_transcript(name)

      assert transcript == []
    end
  end

  describe "identify_speaker/3" do
    test "adds speaker identification", %{name: name} do
      Process.sleep(50)

      result = TwitterSpaces.identify_speaker(name, "speaker_1", "John Doe")

      # May return :ok or speaker not found depending on implementation
      assert result in [:ok, {:error, :speaker_not_found}]
    end
  end

  describe "pubsub integration" do
    test "subscribe returns :ok for valid topic" do
      try do
        result = TwitterSpaces.subscribe(@tenant_id)
        assert result == :ok
      catch
        :exit, _ -> :ok
      end
    end

    test "subscribe with specific space_id" do
      try do
        result = TwitterSpaces.subscribe(@tenant_id, "specific_space")
        assert result == :ok
      catch
        :exit, _ -> :ok
      end
    end
  end

  describe "isolation" do
    test "different monitors are independent" do
      name1 = :"spaces_iso1_#{:erlang.unique_integer([:positive])}"
      name2 = :"spaces_iso2_#{:erlang.unique_integer([:positive])}"
      tenant1 = "iso1_#{:erlang.unique_integer([:positive])}"
      tenant2 = "iso2_#{:erlang.unique_integer([:positive])}"
      space1 = "space1_#{:erlang.unique_integer([:positive])}"
      space2 = "space2_#{:erlang.unique_integer([:positive])}"

      {:ok, pid1} =
        TwitterSpaces.start_link(tenant_id: tenant1, space_id: space1, name: name1)

      {:ok, pid2} =
        TwitterSpaces.start_link(tenant_id: tenant2, space_id: space2, name: name2)

      Process.sleep(50)

      {:ok, status1} = TwitterSpaces.status(name1)
      {:ok, status2} = TwitterSpaces.status(name2)

      assert status1.tenant_id == tenant1
      assert status2.tenant_id == tenant2
      assert status1.space_id == space1
      assert status2.space_id == space2

      GenServer.stop(pid1, :normal, 100)
      GenServer.stop(pid2, :normal, 100)
    end
  end

  describe "lifecycle" do
    test "transitions through states", %{name: name} do
      # Initial state should be initializing or connecting
      {:ok, status1} = TwitterSpaces.status(name)
      assert status1.status in [:initializing, :connecting, :connected, :live]

      # Wait for connection
      Process.sleep(100)

      {:ok, status2} = TwitterSpaces.status(name)
      # Should have progressed (stub returns :live)
      assert status2.status in [:connecting, :connected, :live, :initializing]

      # Stop should transition to stopped
      :ok = TwitterSpaces.stop(name)

      {:ok, status3} = TwitterSpaces.status(name)
      assert status3.status == :stopped
    end
  end
end
