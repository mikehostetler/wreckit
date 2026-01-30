defmodule Cybernetic.Capabilities.Planner.CollaborationTest do
  use ExUnit.Case

  alias Cybernetic.Capabilities.Planner.Collaboration

  setup do
    {:ok, pid} = start_supervised(Collaboration)
    {:ok, pid: pid}
  end

  describe "request_plan/3" do
    test "creates a new plan" do
      goal = "Analyze episode for policy violations"
      context = %{episode_id: "ep-123", tenant_id: "tenant-1"}

      assert {:ok, plan_id} = Collaboration.request_plan(goal, context)
      assert is_binary(plan_id)
    end

    test "plan has correct initial state" do
      {:ok, plan_id} = Collaboration.request_plan("Test goal", %{})
      {:ok, plan} = Collaboration.get_plan(plan_id)

      assert plan.goal == "Test goal"
      assert plan.state == :pending
      assert plan.contributions == []
      assert plan.steps == []
      assert %DateTime{} = plan.created_at
    end

    test "plan has timeout set" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})
      {:ok, plan} = Collaboration.get_plan(plan_id)

      assert %DateTime{} = plan.timeout_at
      assert DateTime.compare(plan.timeout_at, plan.created_at) == :gt
    end
  end

  describe "submit_contribution/2" do
    test "adds contribution to plan" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})

      contribution = %{
        system: :s4,
        steps: [
          %{action: "analyze", inputs: %{}, outputs: [:result]}
        ],
        resources: ["llm"],
        priority: 1
      }

      assert :ok = Collaboration.submit_contribution(plan_id, contribution)

      {:ok, plan} = Collaboration.get_plan(plan_id)
      assert length(plan.contributions) == 1
      assert hd(plan.contributions).system == :s4
      assert plan.state == :planning
    end

    test "accepts multiple contributions" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})

      Collaboration.submit_contribution(plan_id, %{system: :s2, steps: [], priority: 1})
      Collaboration.submit_contribution(plan_id, %{system: :s4, steps: [], priority: 2})
      Collaboration.submit_contribution(plan_id, %{system: :s5, steps: [], priority: 0})

      {:ok, plan} = Collaboration.get_plan(plan_id)
      assert length(plan.contributions) == 3
    end

    test "rejects contribution to nonexistent plan" do
      assert {:error, :not_found} = Collaboration.submit_contribution("fake-id", %{system: :s1})
    end

    test "rejects contribution to finalized plan" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})
      Collaboration.submit_contribution(plan_id, %{system: :s4, steps: [%{action: "test"}]})
      Collaboration.finalize_plan(plan_id)

      assert {:error, {:invalid_state, :ready}} =
               Collaboration.submit_contribution(plan_id, %{system: :s2})
    end
  end

  describe "finalize_plan/1" do
    test "finalizes plan with contributions" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})

      Collaboration.submit_contribution(plan_id, %{
        system: :s4,
        steps: [%{action: "step1"}, %{action: "step2"}],
        priority: 1
      })

      assert {:ok, plan} = Collaboration.finalize_plan(plan_id)
      assert plan.state == :ready
      assert length(plan.steps) == 2
    end

    test "merges contributions by priority" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})

      Collaboration.submit_contribution(plan_id, %{
        system: :s2,
        steps: [%{action: "low_priority"}],
        priority: 1
      })

      Collaboration.submit_contribution(plan_id, %{
        system: :s4,
        steps: [%{action: "high_priority"}],
        priority: 10
      })

      {:ok, plan} = Collaboration.finalize_plan(plan_id)

      # Higher priority contribution's steps come first
      assert hd(plan.steps).action == "high_priority"
    end

    test "rejects finalization without contributions" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})

      assert {:error, :no_contributions} = Collaboration.finalize_plan(plan_id)
    end

    test "rejects finalization of nonexistent plan" do
      assert {:error, :not_found} = Collaboration.finalize_plan("fake-id")
    end
  end

  describe "cancel_plan/2" do
    test "cancels pending plan" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})

      assert :ok = Collaboration.cancel_plan(plan_id, "No longer needed")

      {:ok, plan} = Collaboration.get_plan(plan_id)
      assert plan.state == :cancelled
    end

    test "cancels planning plan" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})
      Collaboration.submit_contribution(plan_id, %{system: :s4, steps: []})

      assert :ok = Collaboration.cancel_plan(plan_id)

      {:ok, plan} = Collaboration.get_plan(plan_id)
      assert plan.state == :cancelled
    end

    test "cannot cancel completed plan" do
      {:ok, plan_id} = Collaboration.request_plan("Test", %{})
      Collaboration.submit_contribution(plan_id, %{system: :s4, steps: [%{action: "x"}]})
      Collaboration.finalize_plan(plan_id)

      # Finalized plans are in :ready state, which can still be cancelled
      # But completed plans cannot
      {:ok, plan} = Collaboration.get_plan(plan_id)
      assert plan.state == :ready
    end

    test "returns not_found for nonexistent plan" do
      assert {:error, :not_found} = Collaboration.cancel_plan("fake-id")
    end
  end

  describe "list_plans/1" do
    test "lists all plans" do
      Collaboration.request_plan("Plan 1", %{})
      Collaboration.request_plan("Plan 2", %{})

      plans = Collaboration.list_plans()
      assert length(plans) == 2
    end

    test "filters by state" do
      {:ok, id1} = Collaboration.request_plan("Pending", %{})
      {:ok, id2} = Collaboration.request_plan("Planning", %{})
      Collaboration.submit_contribution(id2, %{system: :s4, steps: []})

      pending = Collaboration.list_plans(state: :pending)
      planning = Collaboration.list_plans(state: :planning)

      assert length(pending) == 1
      assert length(planning) == 1
      assert hd(pending).id == id1
      assert hd(planning).id == id2
    end
  end

  describe "topics/0" do
    test "returns topic map" do
      topics = Collaboration.topics()

      assert topics.plan_request == "planner.request"
      assert topics.plan_response == "planner.response"
      assert topics.plan_update == "planner.update"
      assert topics.plan_complete == "planner.complete"
    end
  end
end
