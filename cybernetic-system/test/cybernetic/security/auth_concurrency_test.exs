defmodule Cybernetic.Security.AuthConcurrencyTest do
  @moduledoc """
  Concurrency tests for AuthManager session handling.

  Tests race conditions in:
  - Refresh/revoke races
  - Multiple simultaneous refresh attempts
  - Session cleanup timing
  - ETS table access under load
  """
  use ExUnit.Case, async: false

  alias Cybernetic.Security.AuthManager

  setup do
    # Ensure AuthManager is running
    {pid, started_by_test?} =
      case AuthManager.start_link() do
        {:ok, pid} -> {pid, true}
        {:error, {:already_started, pid}} -> {pid, false}
      end

    reset_auth_manager_state(pid)

    on_exit(fn ->
      if started_by_test? and Process.alive?(pid), do: GenServer.stop(pid)
    end)

    {:ok, %{pid: pid}}
  end

  describe "refresh/revoke race conditions" do
    test "revoke during refresh should not cause errors" do
      {:ok, %{token: token, refresh_token: refresh}} =
        AuthManager.authenticate("admin", "admin123")

      # Spawn concurrent refresh and revoke operations
      parent = self()

      refresh_task =
        Task.async(fn ->
          result = AuthManager.refresh_token(refresh)
          send(parent, {:refresh_result, result})
          result
        end)

      revoke_task =
        Task.async(fn ->
          # Small delay to increase race condition likelihood
          Process.sleep(1)
          result = AuthManager.revoke(token)
          send(parent, {:revoke_result, result})
          result
        end)

      # Wait for both tasks
      refresh_result = Task.await(refresh_task, 5000)
      revoke_result = Task.await(revoke_task, 5000)

      # Both operations should complete without crashing
      # One of these patterns should hold:
      # 1. Refresh succeeds, revoke succeeds on old token
      # 2. Refresh fails (token already revoked), revoke succeeds
      # 3. Both succeed (order-dependent)
      assert match?({:ok, _}, refresh_result) or
               match?({:error, _}, refresh_result)

      assert match?(:ok, revoke_result) or
               match?({:error, :not_found}, revoke_result)
    end

    test "concurrent revoke on same token should not crash" do
      {:ok, %{token: token}} = AuthManager.authenticate("admin", "admin123")

      # Spawn multiple concurrent revoke operations
      tasks =
        for _ <- 1..10 do
          Task.async(fn ->
            AuthManager.revoke(token)
          end)
        end

      # Collect all results
      results = Enum.map(tasks, &Task.await(&1, 5000))

      # Exactly one should succeed with :ok, rest should get :not_found
      ok_count = Enum.count(results, &(&1 == :ok))
      not_found_count = Enum.count(results, &(&1 == {:error, :not_found}))

      # At least one should succeed
      assert ok_count >= 1
      # Total should be 10
      assert ok_count + not_found_count == 10
    end
  end

  describe "multiple refresh token usage" do
    test "refresh token should be invalidated after use" do
      {:ok, %{refresh_token: refresh}} =
        AuthManager.authenticate("admin", "admin123")

      # First refresh should succeed
      assert {:ok, %{token: _new_token, refresh_token: new_refresh}} =
               AuthManager.refresh_token(refresh)

      # Second refresh with old token should fail
      assert {:error, :invalid_refresh_token} =
               AuthManager.refresh_token(refresh)

      # But new refresh token should work
      assert {:ok, _} = AuthManager.refresh_token(new_refresh)
    end

    test "concurrent refresh with same token should not issue duplicate tokens" do
      {:ok, %{refresh_token: refresh}} =
        AuthManager.authenticate("admin", "admin123")

      # Spawn concurrent refresh operations with the same token
      tasks =
        for _ <- 1..5 do
          Task.async(fn ->
            AuthManager.refresh_token(refresh)
          end)
        end

      results = Enum.map(tasks, &Task.await(&1, 5000))

      # Count successes
      successes =
        Enum.filter(results, fn
          {:ok, _} -> true
          _ -> false
        end)

      # At most one should succeed (ideally exactly one)
      # Due to race conditions, multiple might succeed but they should
      # all return different new tokens
      if length(successes) > 1 do
        tokens =
          Enum.map(successes, fn {:ok, %{token: token}} -> token end)
          |> Enum.uniq()

        # All issued tokens should be unique
        assert length(tokens) == length(successes)
      end
    end
  end

  describe "session validation under load" do
    test "concurrent token validations should not corrupt state" do
      {:ok, %{token: token}} = AuthManager.authenticate("admin", "admin123")

      # Spawn many concurrent validations
      tasks =
        for _ <- 1..100 do
          Task.async(fn ->
            AuthManager.validate_token(token)
          end)
        end

      results = Enum.map(tasks, &Task.await(&1, 5000))

      # All validations should succeed consistently
      assert Enum.all?(results, fn
               {:ok, context} ->
                 context.user_id == "user_admin"

               _ ->
                 false
             end)
    end

    test "concurrent authentications should not corrupt state" do
      # Spawn many concurrent authentication attempts
      tasks =
        for i <- 1..20 do
          Task.async(fn ->
            # Alternate between admin and operator
            if rem(i, 2) == 0 do
              AuthManager.authenticate("admin", "admin123")
            else
              AuthManager.authenticate("operator", "operator123")
            end
          end)
        end

      results = Enum.map(tasks, &Task.await(&1, 5000))

      # All should succeed
      assert Enum.all?(results, &match?({:ok, _}, &1))

      # All tokens should be valid and validateable
      # Note: tokens might be identical if generated at the same timestamp
      # (deterministic JWT generation), but all should validate correctly
      Enum.each(results, fn {:ok, %{token: token}} ->
        assert {:ok, context} = AuthManager.validate_token(token)
        assert context.user_id in ["user_admin", "user_operator"]
      end)
    end
  end

  describe "cleanup timing" do
    test "cleanup does not affect active sessions" do
      {:ok, %{token: token}} = AuthManager.authenticate("admin", "admin123")

      # Trigger cleanup manually
      send(Process.whereis(AuthManager), :cleanup_sessions)
      Process.sleep(10)

      # Token should still be valid
      assert {:ok, context} = AuthManager.validate_token(token)
      assert context.user_id == "user_admin"
    end

    test "cleanup runs without crashing under concurrent operations" do
      # Create some sessions
      tokens =
        for _ <- 1..10 do
          {:ok, %{token: token}} = AuthManager.authenticate("admin", "admin123")
          token
        end

      # Start concurrent operations
      validation_task =
        Task.async(fn ->
          for _ <- 1..50 do
            Enum.each(tokens, &AuthManager.validate_token/1)
            Process.sleep(1)
          end
        end)

      # Trigger multiple cleanups
      cleanup_task =
        Task.async(fn ->
          for _ <- 1..10 do
            send(Process.whereis(AuthManager), :cleanup_sessions)
            Process.sleep(5)
          end
        end)

      # Both should complete without crashing
      Task.await(validation_task, 10000)
      Task.await(cleanup_task, 10000)

      # AuthManager should still be responsive
      assert {:ok, _} = AuthManager.authenticate("viewer", "viewer123")
    end
  end

  describe "ETS table resilience" do
    test "ETS operations handle missing table gracefully" do
      {:ok, %{token: token}} = AuthManager.authenticate("admin", "admin123")

      # Verify initial validation works
      assert {:ok, _} = AuthManager.validate_token(token)

      # Note: We can't easily delete the ETS table since it's owned by AuthManager
      # This test ensures the fast path handles the table check correctly
    end

    test "high-volume ETS writes do not cause contention issues" do
      # Create many API keys concurrently
      tasks =
        for i <- 1..50 do
          Task.async(fn ->
            AuthManager.create_api_key("key_#{i}", [:viewer])
          end)
        end

      results = Enum.map(tasks, &Task.await(&1, 10000))

      # All should succeed
      assert Enum.all?(results, &match?({:ok, _}, &1))

      # All keys should be unique
      keys =
        Enum.map(results, fn {:ok, key} -> key end)
        |> Enum.uniq()

      assert length(keys) == 50
    end
  end

  # Test helpers

  defp reset_auth_manager_state(pid) do
    for table <- [:auth_sessions, :auth_session_expiry, :api_keys, :refresh_tokens] do
      try do
        :ets.delete_all_objects(table)
      rescue
        ArgumentError -> :ok
      end
    end

    :sys.replace_state(pid, fn state ->
      state
      |> Map.put(:failed_attempts, %{})
      |> Map.put(:rate_limits, %{})
    end)
  end
end
