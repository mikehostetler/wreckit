defmodule Cybernetic.Capabilities.Execution.HandoffTest do
  use ExUnit.Case

  alias Cybernetic.Capabilities.Execution.Handoff

  setup do
    {:ok, pid} = start_supervised(Handoff)
    {:ok, pid: pid}
  end

  describe "initiate/3" do
    test "creates a handoff between systems" do
      context = %{episode_id: "ep-123", analysis: %{}}

      assert {:ok, handoff} = Handoff.initiate(:s4, :s2, context)
      assert handoff.from_system == :s4
      assert handoff.to_system == :s2
      assert handoff.context == context
      assert handoff.state == :initiated
      assert is_binary(handoff.id)
      assert is_binary(handoff.trace_id)
      assert is_binary(handoff.span_id)
    end

    test "rejects invalid from_system" do
      assert {:error, :invalid_system} = Handoff.initiate(:invalid, :s2, %{})
    end

    test "rejects invalid to_system" do
      assert {:error, :invalid_system} = Handoff.initiate(:s4, :invalid, %{})
    end

    test "valid systems are s1-s5" do
      for from <- [:s1, :s2, :s3, :s4, :s5] do
        for to <- [:s1, :s2, :s3, :s4, :s5] do
          assert {:ok, _} = Handoff.initiate(from, to, %{})
        end
      end
    end
  end

  describe "accept/1" do
    test "accepts initiated handoff" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})

      assert :ok = Handoff.accept(handoff.id)

      {:ok, updated} = Handoff.get(handoff.id)
      assert updated.state == :accepted
      assert %DateTime{} = updated.accepted_at
    end

    test "rejects accept on non-initiated handoff" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})
      Handoff.accept(handoff.id)

      # Already accepted
      assert {:error, {:invalid_state, :accepted}} = Handoff.accept(handoff.id)
    end

    test "returns not_found for nonexistent handoff" do
      assert {:error, :not_found} = Handoff.accept("fake-id")
    end
  end

  describe "start_execution/1" do
    test "marks handoff as executing" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})
      Handoff.accept(handoff.id)

      assert :ok = Handoff.start_execution(handoff.id)

      {:ok, updated} = Handoff.get(handoff.id)
      assert updated.state == :executing
    end

    test "requires accepted state" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})

      assert {:error, {:invalid_state, :initiated}} = Handoff.start_execution(handoff.id)
    end
  end

  describe "complete/2" do
    test "completes handoff with result" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})
      Handoff.accept(handoff.id)

      result = %{output: "processed", metrics: %{duration: 100}}
      assert {:ok, completed} = Handoff.complete(handoff.id, result)

      assert completed.state == :completed
      assert completed.result == result
      assert %DateTime{} = completed.completed_at
    end

    test "completes from executing state" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})
      Handoff.accept(handoff.id)
      Handoff.start_execution(handoff.id)

      assert {:ok, completed} = Handoff.complete(handoff.id, %{done: true})
      assert completed.state == :completed
    end

    test "rejects complete on wrong state" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})

      assert {:error, {:invalid_state, :initiated}} = Handoff.complete(handoff.id, %{})
    end

    test "returns not_found for nonexistent handoff" do
      assert {:error, :not_found} = Handoff.complete("fake-id", %{})
    end
  end

  describe "rollback/2" do
    test "rolls back initiated handoff" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})

      assert {:ok, rolled_back} = Handoff.rollback(handoff.id, "cancelled")
      assert rolled_back.state == :rolled_back
      assert rolled_back.error == "cancelled"
    end

    test "rolls back accepted handoff" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})
      Handoff.accept(handoff.id)

      assert {:ok, rolled_back} = Handoff.rollback(handoff.id, "failed to process")
      assert rolled_back.state == :rolled_back
    end

    test "rolls back executing handoff" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})
      Handoff.accept(handoff.id)
      Handoff.start_execution(handoff.id)

      assert {:ok, rolled_back} = Handoff.rollback(handoff.id, "execution failed")
      assert rolled_back.state == :rolled_back
    end

    test "cannot rollback completed handoff" do
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{})
      Handoff.accept(handoff.id)
      Handoff.complete(handoff.id, %{})

      assert {:error, {:invalid_state, :completed}} = Handoff.rollback(handoff.id, "too late")
    end
  end

  describe "list/1" do
    test "lists all handoffs" do
      Handoff.initiate(:s1, :s2, %{})
      Handoff.initiate(:s2, :s3, %{})
      Handoff.initiate(:s4, :s5, %{})

      handoffs = Handoff.list()
      assert length(handoffs) == 3
    end

    test "filters by from system" do
      Handoff.initiate(:s4, :s2, %{})
      Handoff.initiate(:s4, :s3, %{})
      Handoff.initiate(:s1, :s2, %{})

      from_s4 = Handoff.list(from: :s4)
      assert length(from_s4) == 2
    end

    test "filters by to system" do
      Handoff.initiate(:s1, :s2, %{})
      Handoff.initiate(:s3, :s2, %{})
      Handoff.initiate(:s4, :s5, %{})

      to_s2 = Handoff.list(to: :s2)
      assert length(to_s2) == 2
    end

    test "filters by state" do
      {:ok, h1} = Handoff.initiate(:s1, :s2, %{})
      {:ok, h2} = Handoff.initiate(:s2, :s3, %{})
      Handoff.accept(h2.id)

      initiated = Handoff.list(state: :initiated)
      accepted = Handoff.list(state: :accepted)

      assert length(initiated) == 1
      assert length(accepted) == 1
    end
  end

  describe "stats/0" do
    test "returns handoff statistics" do
      {:ok, h1} = Handoff.initiate(:s1, :s2, %{})
      {:ok, h2} = Handoff.initiate(:s2, :s3, %{})
      Handoff.accept(h1.id)
      Handoff.complete(h1.id, %{})
      Handoff.rollback(h2.id, "test")

      stats = Handoff.stats()

      assert stats.initiated >= 2
      assert stats.completed >= 1
      assert stats.rolled_back >= 1
      assert stats.total >= 2
    end
  end
end
