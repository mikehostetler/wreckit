defmodule Cybernetic.Intelligence.CEP.WorkflowHooksTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Intelligence.CEP.WorkflowHooks

  setup do
    {:ok, pid} = start_supervised({WorkflowHooks, [name: :test_hooks]})
    %{pid: pid}
  end

  describe "register/2" do
    test "registers a valid hook and returns hook_id" do
      config = %{
        name: "test_hook",
        pattern: %{type: "test"},
        action: {:log, :info}
      }

      {:ok, hook_id} = WorkflowHooks.register(config, server: :test_hooks)
      assert is_binary(hook_id)
      # 16 bytes hex = 32 chars
      assert String.length(hook_id) == 32
    end

    test "validates pattern is a map" do
      config = %{
        pattern: "not a map",
        action: {:log, :info}
      }

      assert {:error, :invalid_pattern} = WorkflowHooks.register(config, server: :test_hooks)
    end

    test "validates action is required" do
      config = %{
        pattern: %{type: "test"}
      }

      assert {:error, :missing_action} = WorkflowHooks.register(config, server: :test_hooks)
    end

    test "validates action format - workflow" do
      config = %{pattern: %{}, action: {:workflow, "my_workflow"}}
      {:ok, _} = WorkflowHooks.register(config, server: :test_hooks)
    end

    test "validates action format - notify" do
      config = %{pattern: %{}, action: {:notify, "slack"}}
      {:ok, _} = WorkflowHooks.register(config, server: :test_hooks)
    end

    test "validates action format - log" do
      config = %{pattern: %{}, action: {:log, :warning}}
      {:ok, _} = WorkflowHooks.register(config, server: :test_hooks)
    end

    test "validates action format - mfa" do
      config = %{pattern: %{}, action: {:mfa, {IO, :inspect, [:test]}}}
      {:ok, _} = WorkflowHooks.register(config, server: :test_hooks)
    end

    test "rejects invalid action format" do
      config = %{pattern: %{}, action: "invalid"}
      assert {:error, :invalid_action} = WorkflowHooks.register(config, server: :test_hooks)
    end

    test "respects max_hooks limit" do
      {:ok, _pid} =
        start_supervised(
          {WorkflowHooks, [name: :limited_hooks, max_hooks: 2]},
          id: :limited_hooks
        )

      {:ok, _} =
        WorkflowHooks.register(%{pattern: %{}, action: {:log, :info}}, server: :limited_hooks)

      {:ok, _} =
        WorkflowHooks.register(%{pattern: %{}, action: {:log, :info}}, server: :limited_hooks)

      assert {:error, :max_hooks_reached} =
               WorkflowHooks.register(%{pattern: %{}, action: {:log, :info}},
                 server: :limited_hooks
               )
    end
  end

  describe "unregister/2" do
    test "removes a registered hook" do
      {:ok, hook_id} =
        WorkflowHooks.register(%{pattern: %{}, action: {:log, :info}}, server: :test_hooks)

      assert :ok = WorkflowHooks.unregister(hook_id, server: :test_hooks)
      assert {:error, :not_found} = WorkflowHooks.get_hook(hook_id, server: :test_hooks)
    end

    test "returns error for non-existent hook" do
      assert {:error, :not_found} = WorkflowHooks.unregister("nonexistent", server: :test_hooks)
    end
  end

  describe "set_enabled/3" do
    test "enables and disables hooks" do
      {:ok, hook_id} =
        WorkflowHooks.register(%{pattern: %{}, action: {:log, :info}}, server: :test_hooks)

      :ok = WorkflowHooks.set_enabled(hook_id, false, server: :test_hooks)
      {:ok, hook} = WorkflowHooks.get_hook(hook_id, server: :test_hooks)
      assert hook.enabled == false

      :ok = WorkflowHooks.set_enabled(hook_id, true, server: :test_hooks)
      {:ok, hook} = WorkflowHooks.get_hook(hook_id, server: :test_hooks)
      assert hook.enabled == true
    end
  end

  describe "process_event_sync/2" do
    test "matches simple field patterns" do
      {:ok, _} =
        WorkflowHooks.register(
          %{name: "type_matcher", pattern: %{type: "error"}, action: {:log, :info}},
          server: :test_hooks
        )

      {:ok, triggered} = WorkflowHooks.process_event_sync(%{type: "error"}, server: :test_hooks)
      assert triggered == 1

      {:ok, triggered} = WorkflowHooks.process_event_sync(%{type: "info"}, server: :test_hooks)
      assert triggered == 0
    end

    test "matches with operator tuples" do
      {:ok, _} =
        WorkflowHooks.register(
          %{name: "gte_matcher", pattern: %{count: {:gte, 10}}, action: {:log, :info}},
          server: :test_hooks
        )

      {:ok, triggered} = WorkflowHooks.process_event_sync(%{count: 15}, server: :test_hooks)
      assert triggered == 1

      {:ok, triggered} = WorkflowHooks.process_event_sync(%{count: 5}, server: :test_hooks)
      assert triggered == 0
    end

    test "matches with :in operator" do
      {:ok, _} =
        WorkflowHooks.register(
          %{
            name: "in_matcher",
            pattern: %{status: {:in, [:active, :pending]}},
            action: {:log, :info}
          },
          server: :test_hooks
        )

      {:ok, triggered} = WorkflowHooks.process_event_sync(%{status: :active}, server: :test_hooks)
      assert triggered == 1

      {:ok, triggered} =
        WorkflowHooks.process_event_sync(%{status: :inactive}, server: :test_hooks)

      assert triggered == 0
    end

    test "matches with :contains operator" do
      {:ok, _} =
        WorkflowHooks.register(
          %{
            name: "contains_matcher",
            pattern: %{message: {:contains, "error"}},
            action: {:log, :info}
          },
          server: :test_hooks
        )

      {:ok, triggered} =
        WorkflowHooks.process_event_sync(%{message: "An error occurred"}, server: :test_hooks)

      assert triggered == 1
    end

    test "matches nested fields with dot notation" do
      {:ok, _} =
        WorkflowHooks.register(
          %{name: "nested_matcher", pattern: %{"user.role" => "admin"}, action: {:log, :info}},
          server: :test_hooks
        )

      {:ok, triggered} =
        WorkflowHooks.process_event_sync(
          %{user: %{role: "admin", name: "test"}},
          server: :test_hooks
        )

      assert triggered == 1
    end

    test "matches severity comparison" do
      {:ok, _} =
        WorkflowHooks.register(
          %{
            name: "severity_matcher",
            pattern: %{severity: {:gte, "high"}},
            action: {:log, :info}
          },
          server: :test_hooks
        )

      {:ok, triggered} =
        WorkflowHooks.process_event_sync(%{severity: "critical"}, server: :test_hooks)

      assert triggered == 1

      {:ok, triggered} = WorkflowHooks.process_event_sync(%{severity: "low"}, server: :test_hooks)
      assert triggered == 0
    end

    test "respects threshold count" do
      {:ok, _} =
        WorkflowHooks.register(
          %{
            name: "threshold_matcher",
            pattern: %{type: "click"},
            threshold: %{count: 3, window_ms: 60_000},
            action: {:log, :info}
          },
          server: :test_hooks
        )

      {:ok, t1} = WorkflowHooks.process_event_sync(%{type: "click"}, server: :test_hooks)
      {:ok, t2} = WorkflowHooks.process_event_sync(%{type: "click"}, server: :test_hooks)
      {:ok, t3} = WorkflowHooks.process_event_sync(%{type: "click"}, server: :test_hooks)

      # Only triggers on 3rd event when threshold is met
      assert t1 == 0
      assert t2 == 0
      assert t3 == 1
    end

    test "disabled hooks are not triggered" do
      {:ok, hook_id} =
        WorkflowHooks.register(
          %{name: "disabled_hook", pattern: %{type: "test"}, action: {:log, :info}},
          server: :test_hooks
        )

      WorkflowHooks.set_enabled(hook_id, false, server: :test_hooks)

      {:ok, triggered} = WorkflowHooks.process_event_sync(%{type: "test"}, server: :test_hooks)
      assert triggered == 0
    end
  end

  describe "list_hooks/1" do
    test "returns all registered hooks" do
      {:ok, _} =
        WorkflowHooks.register(%{name: "hook1", pattern: %{}, action: {:log, :info}},
          server: :test_hooks
        )

      {:ok, _} =
        WorkflowHooks.register(%{name: "hook2", pattern: %{}, action: {:log, :info}},
          server: :test_hooks
        )

      hooks = WorkflowHooks.list_hooks(server: :test_hooks)
      assert length(hooks) == 2
      assert Enum.any?(hooks, fn h -> h.name == "hook1" end)
      assert Enum.any?(hooks, fn h -> h.name == "hook2" end)
    end
  end

  describe "stats/1" do
    test "returns statistics" do
      {:ok, _} =
        WorkflowHooks.register(%{pattern: %{}, action: {:log, :info}}, server: :test_hooks)

      WorkflowHooks.process_event_sync(%{type: "test"}, server: :test_hooks)

      stats = WorkflowHooks.stats(server: :test_hooks)

      assert stats.active_hooks == 1
      assert stats.events_processed >= 1
      assert is_number(stats.hooks_triggered)
    end
  end
end
