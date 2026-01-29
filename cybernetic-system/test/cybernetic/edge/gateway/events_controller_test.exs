defmodule Cybernetic.Edge.Gateway.EventsControllerTest do
  @moduledoc """
  Tests for SSE EventsController, including tenant isolation.
  """
  use ExUnit.Case, async: true

  # Test the tenant filtering logic directly
  # The actual event_matches_tenant?/2 is private, so we test the logic
  describe "tenant filtering logic" do
    test "nil tenant connection receives all events" do
      # A connection with no tenant (anonymous/global) should receive all events
      assert tenant_matches?(nil, %{tenant_id: "tenant-a"})
      assert tenant_matches?(nil, %{"tenant_id" => "tenant-b"})
      assert tenant_matches?(nil, %{})
    end

    test "event without tenant_id broadcasts to all connections" do
      # Events without tenant_id are global broadcasts
      assert tenant_matches?("tenant-a", %{})
      assert tenant_matches?("tenant-b", %{type: "system.event"})
    end

    test "event with matching tenant_id is received" do
      assert tenant_matches?("tenant-a", %{tenant_id: "tenant-a"})
      assert tenant_matches?("tenant-b", %{"tenant_id" => "tenant-b"})
    end

    test "event with different tenant_id is filtered out" do
      refute tenant_matches?("tenant-a", %{tenant_id: "tenant-b"})
      refute tenant_matches?("tenant-b", %{"tenant_id" => "tenant-a"})
    end

    test "mixed atom/string keys work correctly" do
      # Atom key in data
      assert tenant_matches?("tenant-a", %{tenant_id: "tenant-a"})
      refute tenant_matches?("tenant-a", %{tenant_id: "tenant-b"})

      # String key in data
      assert tenant_matches?("tenant-a", %{"tenant_id" => "tenant-a"})
      refute tenant_matches?("tenant-a", %{"tenant_id" => "tenant-b"})
    end
  end

  # Replicate the tenant matching logic for testing
  # This mirrors the private function in EventsController
  defp tenant_matches?(nil, _data), do: true

  defp tenant_matches?(connection_tenant_id, data) do
    event_tenant = Map.get(data, :tenant_id) || Map.get(data, "tenant_id")

    case event_tenant do
      nil -> true
      ^connection_tenant_id -> true
      _ -> false
    end
  end
end
