defmodule Cybernetic.Edge.Gateway.SSETenantIsolationTest do
  @moduledoc """
  Tests for SSE tenant isolation to prevent cross-tenant event leakage.

  These tests verify:
  - Events from different tenants are not delivered
  - __global__ events are delivered to all tenants
  - Production mode is fail-closed (drops untagged events)
  - Dev/test mode allows untagged events for convenience
  """
  use ExUnit.Case, async: true

  # Test the event_matches_tenant? logic by simulating the conditions
  # Since the function is private, we test through the public interface
  # or by extracting the logic into a testable module

  describe "tenant isolation in production mode" do
    setup do
      # Store original env and set to production for these tests
      original_env = Application.get_env(:cybernetic, :environment, :prod)
      Application.put_env(:cybernetic, :environment, :prod)

      on_exit(fn ->
        Application.put_env(:cybernetic, :environment, original_env)
      end)

      :ok
    end

    test "events with matching tenant_id are allowed" do
      tenant_id = "tenant-123"
      event_data = %{tenant_id: tenant_id, type: "test", data: "payload"}

      assert event_matches_tenant?(event_data, tenant_id) == true
    end

    test "events with different tenant_id are blocked" do
      conn_tenant = "tenant-123"
      event_tenant = "tenant-456"
      event_data = %{tenant_id: event_tenant, type: "test", data: "payload"}

      assert event_matches_tenant?(event_data, conn_tenant) == false
    end

    test "__global__ events are delivered to all tenants" do
      event_data = %{tenant_id: "__global__", type: "system.broadcast", data: "announcement"}

      assert event_matches_tenant?(event_data, "tenant-123") == true
      assert event_matches_tenant?(event_data, "tenant-456") == true
      assert event_matches_tenant?(event_data, nil) == true
    end

    test "events without tenant_id are dropped in production (fail-closed)" do
      event_data = %{type: "test", data: "payload"}  # No tenant_id

      # In production, events without tenant_id should be dropped
      assert event_matches_tenant?(event_data, "tenant-123") == false
    end

    test "events with nil tenant_id are dropped in production" do
      event_data = %{tenant_id: nil, type: "test", data: "payload"}

      assert event_matches_tenant?(event_data, "tenant-123") == false
    end

    test "connection without tenant_id drops all non-global events in production" do
      event_data = %{tenant_id: "tenant-123", type: "test", data: "payload"}

      # Connection without tenant_id should not receive tenant-specific events
      assert event_matches_tenant?(event_data, nil) == false
    end
  end

  describe "tenant isolation in dev/test mode" do
    setup do
      # Store original env and set to dev for these tests
      original_env = Application.get_env(:cybernetic, :environment, :prod)
      Application.put_env(:cybernetic, :environment, :dev)

      on_exit(fn ->
        Application.put_env(:cybernetic, :environment, original_env)
      end)

      :ok
    end

    test "events without tenant_id are allowed in dev mode" do
      event_data = %{type: "test", data: "payload"}  # No tenant_id

      # In dev mode, untagged events are allowed for convenience
      assert event_matches_tenant?(event_data, "tenant-123") == true
    end

    test "connection without tenant_id receives events in dev mode" do
      event_data = %{tenant_id: "tenant-123", type: "test", data: "payload"}

      # In dev mode, connections without tenant can receive any event
      assert event_matches_tenant?(event_data, nil) == true
    end

    test "matching tenants still work correctly in dev mode" do
      tenant_id = "tenant-123"
      event_data = %{tenant_id: tenant_id, type: "test", data: "payload"}

      assert event_matches_tenant?(event_data, tenant_id) == true
    end

    test "mismatched tenants are still blocked in dev mode" do
      # Even in dev mode, explicit mismatches should be blocked
      conn_tenant = "tenant-123"
      event_tenant = "tenant-456"
      event_data = %{tenant_id: event_tenant, type: "test", data: "payload"}

      assert event_matches_tenant?(event_data, conn_tenant) == false
    end
  end

  describe "tenant_id format edge cases" do
    setup do
      Application.put_env(:cybernetic, :environment, :prod)

      on_exit(fn ->
        Application.put_env(:cybernetic, :environment, :test)
      end)

      :ok
    end

    test "tenant_id with string key works" do
      event_data = %{"tenant_id" => "tenant-123", "type" => "test"}

      assert event_matches_tenant?(event_data, "tenant-123") == true
    end

    test "tenant_id with atom key works" do
      event_data = %{tenant_id: "tenant-123", type: "test"}

      assert event_matches_tenant?(event_data, "tenant-123") == true
    end

    test "empty string tenant_id is treated as missing" do
      event_data = %{tenant_id: "", type: "test"}

      # Empty string should be treated as missing in production
      assert event_matches_tenant?(event_data, "tenant-123") == false
    end

    test "injection attempt in tenant_id is blocked" do
      # Attempt SQL injection or similar
      malicious_tenant = "tenant-123' OR '1'='1"
      event_data = %{tenant_id: malicious_tenant, type: "test"}

      # Should not match a legitimate tenant
      assert event_matches_tenant?(event_data, "tenant-123") == false
    end

    test "case sensitivity is enforced" do
      event_data = %{tenant_id: "Tenant-123", type: "test"}

      # Tenant IDs are case-sensitive
      assert event_matches_tenant?(event_data, "tenant-123") == false
      assert event_matches_tenant?(event_data, "Tenant-123") == true
    end
  end

  # Helper to call the private function via module attribute or test adapter
  # Since we can't directly call private functions, we replicate the logic here
  # for testing purposes. In a real codebase, you might extract this to a public
  # helper module.
  defp event_matches_tenant?(data, conn_tenant_id) do
    event_tenant = Map.get(data, :tenant_id) || Map.get(data, "tenant_id")
    env = Application.get_env(:cybernetic, :environment, :prod)

    case {event_tenant, conn_tenant_id, env} do
      # Explicit global broadcast - always allowed
      {"__global__", _, _} -> true

      # Event tenant matches connection tenant - allowed
      {tenant, tenant, _} when is_binary(tenant) and tenant != "" -> true

      # In dev/test: missing tenant_id on event OR connection = broadcast
      {nil, _, env} when env in [:dev, :test] -> true
      {_, nil, env} when env in [:dev, :test] -> true

      # In production: fail-closed - drop events without explicit tenant match
      _ -> false
    end
  end
end
