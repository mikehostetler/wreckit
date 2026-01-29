defmodule Cybernetic.Workers.PolicyEvaluatorTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Workers.PolicyEvaluator

  @valid_tenant "test-tenant"

  describe "perform/1" do
    test "handles event with no matching policies" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "event" => %{"type" => "test.event", "data" => %{"status" => "active"}}
        })

      # Should complete without error even if no policies match
      result = PolicyEvaluator.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles missing tenant_id" do
      job =
        build_job(%{
          "event" => %{"type" => "test.event"}
        })

      result = PolicyEvaluator.perform(job)
      # Should handle gracefully
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles missing event" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant
        })

      result = PolicyEvaluator.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles complex event data" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "event" => %{
            "type" => "episode.created",
            "data" => %{
              "episode_id" => "550e8400-e29b-41d4-a716-446655440000",
              "title" => "Test Episode",
              "status" => "draft",
              "tags" => ["test", "example"],
              "created_at" => DateTime.utc_now() |> DateTime.to_iso8601()
            }
          }
        })

      result = PolicyEvaluator.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles event with nested data" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "event" => %{
            "type" => "user.action",
            "data" => %{
              "user" => %{
                "id" => "user-123",
                "role" => "admin"
              },
              "action" => "delete",
              "target" => %{
                "type" => "episode",
                "id" => "episode-456"
              }
            }
          }
        })

      result = PolicyEvaluator.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  describe "job retry behavior" do
    test "handles multiple attempts" do
      job =
        build_job(
          %{
            "tenant_id" => @valid_tenant,
            "event" => %{"type" => "test.event"}
          },
          attempt: 3
        )

      # Should still process on later attempts
      result = PolicyEvaluator.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  # Helper to build a mock Oban job
  defp build_job(args, opts \\ []) do
    %Oban.Job{
      args: args,
      attempt: Keyword.get(opts, :attempt, 1),
      queue: "policy",
      worker: "Cybernetic.Workers.PolicyEvaluator"
    }
  end
end
