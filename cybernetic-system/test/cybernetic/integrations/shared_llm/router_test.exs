defmodule Cybernetic.Integrations.SharedLLM.RouterTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Integrations.SharedLLM.Router

  @tenant_id "llm_router_test_#{:erlang.unique_integer([:positive])}"

  setup do
    name = :"shared_llm_router_test_#{:erlang.unique_integer([:positive])}"
    {:ok, pid} = Router.start_link(tenant_id: @tenant_id, name: name)

    on_exit(fn ->
      if Process.alive?(pid), do: GenServer.stop(pid, :normal, 100)
    end)

    %{pid: pid, name: name}
  end

  describe "start_link/1" do
    test "starts with required tenant_id" do
      tenant = "start_link_router_#{:erlang.unique_integer([:positive])}"
      name = :"shared_llm_start_#{:erlang.unique_integer([:positive])}"

      assert {:ok, pid} = Router.start_link(tenant_id: tenant, name: name)
      assert Process.alive?(pid)

      GenServer.stop(pid, :normal, 100)
    end

    test "fails without tenant_id" do
      assert_raise KeyError, fn ->
        Router.start_link([])
      end
    end
  end

  describe "stats/0" do
    test "returns router statistics", %{name: name} do
      stats = GenServer.call(name, :stats)

      assert is_map(stats)
      assert Map.has_key?(stats, :total_requests)
      assert Map.has_key?(stats, :cache_hits)
      assert Map.has_key?(stats, :cache_misses)
    end

    test "tracks by operation type", %{name: name} do
      stats = GenServer.call(name, :stats)

      assert is_map(stats)
      assert Map.has_key?(stats, :by_operation)
      assert Map.has_key?(stats.by_operation, :chat)
      assert Map.has_key?(stats.by_operation, :embed)
    end

    test "includes uptime and cache hit rate", %{name: name} do
      stats = GenServer.call(name, :stats)

      assert is_map(stats)
      assert Map.has_key?(stats, :uptime_seconds)
      assert Map.has_key?(stats, :cache_hit_rate)
    end
  end

  describe "in_flight_count/0" do
    test "returns current in-flight count", %{name: name} do
      count = GenServer.call(name, :in_flight_count)

      assert is_integer(count)
      assert count >= 0
    end

    test "starts at zero", %{name: name} do
      count = GenServer.call(name, :in_flight_count)

      assert count == 0
    end
  end

  describe "clear_cache/0" do
    test "clears the request cache", %{name: name} do
      result = GenServer.call(name, :clear_cache)

      # Returns :ok if LLMCDN is running, or {:error, :cache_unavailable} in minimal test mode
      assert result in [:ok, {:error, :cache_unavailable}]
    end
  end

  describe "tenant isolation" do
    test "different tenants have isolated stats" do
      tenant1 = "iso_router_1_#{:erlang.unique_integer([:positive])}"
      tenant2 = "iso_router_2_#{:erlang.unique_integer([:positive])}"

      name1 = :"router_iso1_#{:erlang.unique_integer([:positive])}"
      name2 = :"router_iso2_#{:erlang.unique_integer([:positive])}"

      {:ok, pid1} = Router.start_link(tenant_id: tenant1, name: name1)
      {:ok, pid2} = Router.start_link(tenant_id: tenant2, name: name2)

      stats1 = GenServer.call(name1, :stats)
      stats2 = GenServer.call(name2, :stats)

      # Stats should be independent and both start fresh
      assert stats1.total_requests == 0
      assert stats2.total_requests == 0

      GenServer.stop(pid1, :normal, 100)
      GenServer.stop(pid2, :normal, 100)
    end
  end

  describe "config" do
    test "uses default config values", %{name: name} do
      stats = GenServer.call(name, :stats)

      # Should have started at time <= now
      assert DateTime.compare(stats.started_at, DateTime.utc_now()) in [:lt, :eq]
    end

    test "starts with empty in-flight map", %{name: name} do
      count = GenServer.call(name, :in_flight_count)

      assert count == 0
    end
  end
end
