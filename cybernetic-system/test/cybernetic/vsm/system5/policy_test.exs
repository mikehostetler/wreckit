defmodule Cybernetic.VSM.System5.PolicyTest do
  use ExUnit.Case
  alias Cybernetic.VSM.System5.Policy

  setup do
    # Policy is started by the application via VSM.Supervisor
    policy_pid = Process.whereis(Policy)

    if policy_pid == nil do
      {:ok, skip: true}
    else
      {:ok, policy: policy_pid}
    end
  end

  describe "policy versioning" do
    test "stores policy with version number", context do
      if Map.get(context, :skip) do
        :ok
      else
        policy_data = %{
          name: "rate_limit_policy",
          max_requests: 100,
          window: 60
        }

        {:ok, stored} = Policy.put_policy("test_policy", policy_data)

        assert stored.version == 1
        assert stored.id == "test_policy"
        assert stored.max_requests == 100
        assert is_integer(stored.timestamp)
      end
    end

    test "increments version on update", context do
      if Map.get(context, :skip) do
        :ok
      else
        initial = %{setting: "value1"}
        updated = %{setting: "value2"}

        {:ok, v1} = Policy.put_policy("versioned", initial)
        {:ok, v2} = Policy.put_policy("versioned", updated)

        assert v1.version == 1
        assert v2.version == 2
        assert v2.setting == "value2"
      end
    end

    test "retrieves current policy", context do
      if Map.get(context, :skip) do
        :ok
      else
        policy_data = %{rule: "test_rule"}
        Policy.put_policy("retrievable", policy_data)

        current = Policy.get_policy("retrievable")

        assert current.rule == "test_rule"
        assert current.version == 1
      end
    end

    test "returns nil for non-existent policy", context do
      if Map.get(context, :skip) do
        :ok
      else
        assert nil == Policy.get_policy("non_existent")
      end
    end

    test "maintains policy history", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Create multiple versions
        for i <- 1..5 do
          Policy.put_policy("historical", %{iteration: i})
          Process.sleep(5)
        end

        # History is maintained internally, verify through diff
        {:error, _} = Policy.diff_policy("historical", 0, 1)
        diff = Policy.diff_policy("historical", 1, 5)

        assert diff.changed.iteration == {1, 5}
      end
    end
  end

  describe "policy diff" do
    test "computes diff between versions", context do
      if Map.get(context, :skip) do
        :ok
      else
        Policy.put_policy("diff_test", %{a: 1, b: 2, c: 3})
        Policy.put_policy("diff_test", %{a: 1, b: 20, d: 4})

        diff = Policy.diff_policy("diff_test", 1, 2)

        assert diff.removed.c == 3
        assert diff.changed.b == {2, 20}
        assert diff.added.d == 4
      end
    end

    test "handles missing versions", context do
      if Map.get(context, :skip) do
        :ok
      else
        Policy.put_policy("sparse", %{data: "v1"})

        assert {:error, "Version 0 not found"} = Policy.diff_policy("sparse", 0, 1)
        assert {:error, "Version 2 not found"} = Policy.diff_policy("sparse", 1, 2)
      end
    end

    test "identifies unchanged fields", context do
      if Map.get(context, :skip) do
        :ok
      else
        Policy.put_policy("unchanged", %{static: "same", dynamic: "v1"})
        Policy.put_policy("unchanged", %{static: "same", dynamic: "v2"})

        diff = Policy.diff_policy("unchanged", 1, 2)

        # static field should not appear in diff
        assert diff.changed.dynamic == {"v1", "v2"}
        assert not Map.has_key?(diff.changed, :static)
        assert not Map.has_key?(diff.added, :static)
        assert not Map.has_key?(diff.removed, :static)
      end
    end

    test "handles complex nested structures", context do
      if Map.get(context, :skip) do
        :ok
      else
        v1 = %{
          config: %{
            timeout: 30,
            retries: 3,
            endpoints: ["api1", "api2"]
          }
        }

        v2 = %{
          config: %{
            timeout: 60,
            retries: 3,
            endpoints: ["api1", "api2", "api3"]
          }
        }

        Policy.put_policy("complex", v1)
        Policy.put_policy("complex", v2)

        diff = Policy.diff_policy("complex", 1, 2)

        # The entire config object changed
        {old_config, new_config} = diff.changed.config
        assert old_config.timeout == 30
        assert new_config.timeout == 60
        assert length(new_config.endpoints) == 3
      end
    end

    test "keeps only last 10 versions in history", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Create 15 versions
        for i <- 1..15 do
          Policy.put_policy("limited", %{version_num: i})
        end

        # Oldest versions should be gone (1-5)
        assert {:error, _} = Policy.diff_policy("limited", 1, 15)

        # Recent versions should exist (6-15)
        diff = Policy.diff_policy("limited", 14, 15)
        assert diff.changed.version_num == {14, 15}
      end
    end
  end

  describe "concurrent operations" do
    test "handles concurrent policy updates", context do
      if Map.get(context, :skip) do
        :ok
      else
        policy_id = "concurrent"

        tasks =
          for i <- 1..10 do
            Task.async(fn ->
              Policy.put_policy(policy_id, %{worker: i})
            end)
          end

        results = Task.await_many(tasks)

        # All should succeed
        assert Enum.all?(results, fn
                 {:ok, _} -> true
                 _ -> false
               end)

        # Final version should be 10
        final = Policy.get_policy(policy_id)
        assert final.version == 10
      end
    end
  end
end
