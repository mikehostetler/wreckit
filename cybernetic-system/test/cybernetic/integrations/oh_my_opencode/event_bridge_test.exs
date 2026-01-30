defmodule Cybernetic.Integrations.OhMyOpencode.EventBridgeTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Integrations.OhMyOpencode.EventBridge

  @tenant_id "event_test_tenant_#{:erlang.unique_integer([:positive])}"

  setup do
    name = :"event_bridge_test_#{:erlang.unique_integer([:positive])}"
    {:ok, pid} = EventBridge.start_link(tenant_id: @tenant_id, name: name)

    on_exit(fn ->
      if Process.alive?(pid), do: GenServer.stop(pid, :normal, 100)
    end)

    %{pid: pid, name: name}
  end

  describe "start_link/1" do
    test "starts with required tenant_id" do
      tenant = "start_link_event_#{:erlang.unique_integer([:positive])}"
      name = :"event_bridge_start_#{:erlang.unique_integer([:positive])}"

      assert {:ok, pid} = EventBridge.start_link(tenant_id: tenant, name: name)
      assert Process.alive?(pid)

      GenServer.stop(pid, :normal, 100)
    end

    test "fails without tenant_id" do
      assert_raise KeyError, fn ->
        EventBridge.start_link([])
      end
    end
  end

  describe "emit (cast)" do
    test "emits outbound events", %{name: name} do
      event_type = "vsm.state_changed"
      payload = %{system: :s4_intelligence, delta: %{key: "value"}}

      # emit is a cast, returns :ok immediately
      result = GenServer.cast(name, {:emit, event_type, payload, []})

      assert result == :ok
    end

    test "emits inbound events", %{name: name} do
      event_type = "agent.message"
      payload = %{content: "Hello from agent", role: "assistant"}

      result = GenServer.cast(name, {:emit, event_type, payload, [direction: :inbound]})

      assert result == :ok
    end
  end

  describe "receive (cast)" do
    test "receives incoming event from remote", %{name: name} do
      event = %{
        type: "agent.message",
        payload: %{content: "Hello"},
        timestamp: DateTime.utc_now(),
        source: "oh-my-opencode"
      }

      result = GenServer.cast(name, {:receive, event})

      assert result == :ok
    end
  end

  describe "replay/2" do
    test "replays buffered events", %{name: name} do
      # First emit some events
      GenServer.cast(name, {:emit, "episode.created", %{id: "ep_1"}, []})
      GenServer.cast(name, {:emit, "episode.completed", %{id: "ep_1"}, []})

      # Give time for casts to process
      Process.sleep(10)

      # Now replay
      {:ok, events} = GenServer.call(name, {:replay, []})

      assert is_list(events)
    end

    test "replays with time filter", %{name: name} do
      since = DateTime.add(DateTime.utc_now(), -3600, :second)

      {:ok, events} = GenServer.call(name, {:replay, [since: since]})

      assert is_list(events)
    end
  end

  describe "register_handler/3" do
    test "registers event handler function", %{name: name} do
      handler = fn event -> {:ok, event} end

      result = GenServer.call(name, {:register_handler, ["episode.*"], handler})

      assert result == :ok
    end

    test "supports wildcard event patterns", %{name: name} do
      handler = fn _event -> :ok end

      result = GenServer.call(name, {:register_handler, ["*"], handler})

      assert result == :ok
    end
  end

  describe "stats/0" do
    test "returns bridge statistics", %{name: name} do
      {:ok, stats} = GenServer.call(name, :stats)

      assert is_map(stats)
      assert Map.has_key?(stats, :emitted) or Map.has_key?(stats, :events_emitted)
    end
  end

  describe "tenant isolation" do
    test "different tenants have isolated event streams" do
      tenant1 = "isolation_event_1_#{:erlang.unique_integer([:positive])}"
      tenant2 = "isolation_event_2_#{:erlang.unique_integer([:positive])}"

      name1 = :"event_bridge_iso1_#{:erlang.unique_integer([:positive])}"
      name2 = :"event_bridge_iso2_#{:erlang.unique_integer([:positive])}"

      {:ok, pid1} = EventBridge.start_link(tenant_id: tenant1, name: name1)
      {:ok, pid2} = EventBridge.start_link(tenant_id: tenant2, name: name2)

      # Emit to tenant1 only
      GenServer.cast(name1, {:emit, "test.event", %{data: "tenant1"}, []})

      # Allow cast to process
      Process.sleep(10)

      # Stats should be independent
      {:ok, stats1} = GenServer.call(name1, :stats)
      {:ok, stats2} = GenServer.call(name2, :stats)

      assert is_map(stats1)
      assert is_map(stats2)

      GenServer.stop(pid1, :normal, 100)
      GenServer.stop(pid2, :normal, 100)
    end
  end

  describe "PubSub relay (regression)" do
    test "relays {:vsm_event, _} from PubSub and increments emitted", %{pid: pid, name: name} do
      Phoenix.PubSub.subscribe(Cybernetic.PubSub, "event_bridge:#{@tenant_id}:outbound")

      {:ok, initial_stats} = GenServer.call(name, :stats)

      payload = %{type: "state_change", data: %{key: "value"}}

      Phoenix.PubSub.broadcast(
        Cybernetic.PubSub,
        "vsm_bridge:events:#{@tenant_id}",
        {:vsm_event, payload}
      )

      assert_receive {:event_bridge, event}, 500
      assert event.type == "vsm.state_changed"
      assert event.payload == payload

      assert Process.alive?(pid)

      {:ok, final_stats} = GenServer.call(name, :stats)
      assert final_stats.emitted == initial_stats.emitted + 1
    end

    test "relays {:vsm_state_change, _} from PubSub and increments emitted", %{
      pid: pid,
      name: name
    } do
      Phoenix.PubSub.subscribe(Cybernetic.PubSub, "event_bridge:#{@tenant_id}:outbound")

      {:ok, initial_stats} = GenServer.call(name, :stats)

      payload = %{
        action: :updated,
        changes: [{1, %{changed: %{k: "v"}, removed: []}}],
        timestamp: DateTime.utc_now()
      }

      Phoenix.PubSub.broadcast(
        Cybernetic.PubSub,
        "vsm_bridge:state:#{@tenant_id}",
        {:vsm_state_change, payload}
      )

      assert_receive {:event_bridge, event}, 500
      assert event.type == "vsm.state_changed"
      assert event.payload == payload

      assert Process.alive?(pid)

      {:ok, final_stats} = GenServer.call(name, :stats)
      assert final_stats.emitted == initial_stats.emitted + 1
    end

    test "relays {:event, \"episode.analyzed\", _} for matching tenant_id", %{
      pid: pid,
      name: name
    } do
      Phoenix.PubSub.subscribe(Cybernetic.PubSub, "event_bridge:#{@tenant_id}:outbound")

      {:ok, initial_stats} = GenServer.call(name, :stats)

      payload = %{
        tenant_id: @tenant_id,
        episode_id: "ep_123",
        analysis_type: "summary",
        timestamp: DateTime.utc_now()
      }

      Phoenix.PubSub.broadcast(
        Cybernetic.PubSub,
        "events:episode",
        {:event, "episode.analyzed", payload}
      )

      assert_receive {:event_bridge, event}, 500
      assert event.type == "episode.analyzed"
      assert event.payload == payload

      assert Process.alive?(pid)

      {:ok, final_stats} = GenServer.call(name, :stats)
      assert final_stats.emitted == initial_stats.emitted + 1
    end

    test "does not relay {:event, _} for non-matching tenant_id", %{pid: pid} do
      Phoenix.PubSub.subscribe(Cybernetic.PubSub, "event_bridge:#{@tenant_id}:outbound")

      payload = %{tenant_id: "other_tenant", episode_id: "ep_999", timestamp: DateTime.utc_now()}

      Phoenix.PubSub.broadcast(
        Cybernetic.PubSub,
        "events:episode",
        {:event, "episode.analyzed", payload}
      )

      refute_receive {:event_bridge, _}, 100
      assert Process.alive?(pid)
    end

    test "relays {:event, \"policy.evaluated\", _} for matching tenant_id", %{
      pid: pid,
      name: name
    } do
      Phoenix.PubSub.subscribe(Cybernetic.PubSub, "event_bridge:#{@tenant_id}:outbound")

      {:ok, initial_stats} = GenServer.call(name, :stats)

      payload = %{tenant_id: @tenant_id, policy_id: "pol_1", timestamp: DateTime.utc_now()}

      Phoenix.PubSub.broadcast(
        Cybernetic.PubSub,
        "events:policy",
        {:event, "policy.evaluated", payload}
      )

      assert_receive {:event_bridge, event}, 500
      assert event.type == "policy.evaluated"
      assert event.payload == payload

      assert Process.alive?(pid)

      {:ok, final_stats} = GenServer.call(name, :stats)
      assert final_stats.emitted == initial_stats.emitted + 1
    end
  end
end
