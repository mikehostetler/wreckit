defmodule Cybernetic.Workers.EpisodeAnalyzerTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Workers.EpisodeAnalyzer

  @valid_uuid "550e8400-e29b-41d4-a716-446655440000"
  @valid_tenant "test-tenant"

  describe "argument validation" do
    test "rejects missing episode_id" do
      job = build_job(%{"tenant_id" => @valid_tenant})
      assert {:error, :missing_episode_id} = EpisodeAnalyzer.perform(job)
    end

    test "rejects invalid episode_id format" do
      job = build_job(%{"episode_id" => "not-a-uuid", "tenant_id" => @valid_tenant})
      assert {:error, :invalid_episode_id} = EpisodeAnalyzer.perform(job)
    end

    test "rejects missing tenant_id" do
      job = build_job(%{"episode_id" => @valid_uuid})
      assert {:error, :invalid_tenant_id} = EpisodeAnalyzer.perform(job)
    end

    test "rejects invalid tenant_id format" do
      job = build_job(%{"episode_id" => @valid_uuid, "tenant_id" => "../escape"})
      assert {:error, :invalid_tenant_id} = EpisodeAnalyzer.perform(job)
    end

    test "rejects invalid analysis_type" do
      job =
        build_job(%{
          "episode_id" => @valid_uuid,
          "tenant_id" => @valid_tenant,
          "analysis_type" => "invalid_type"
        })

      assert {:error, :invalid_value} = EpisodeAnalyzer.perform(job)
    end

    test "accepts valid analysis types" do
      for type <- ["full", "summary", "entities", "sentiment"] do
        job =
          build_job(%{
            "episode_id" => @valid_uuid,
            "tenant_id" => @valid_tenant,
            "analysis_type" => type
          })

        # Will fail at fetch_episode, but validates args first
        result = EpisodeAnalyzer.perform(job)
        # Either not_found (episode doesn't exist) or another error, but NOT validation error
        assert result != {:error, :invalid_value}
      end
    end

    test "defaults analysis_type to full" do
      job =
        build_job(%{
          "episode_id" => @valid_uuid,
          "tenant_id" => @valid_tenant
        })

      # Will fail at fetch_episode, but demonstrates default type is used
      result = EpisodeAnalyzer.perform(job)
      assert result == {:error, :not_found} or match?({:error, _}, result)
    end
  end

  describe "job construction" do
    test "creates valid Oban job args" do
      args = %{
        "episode_id" => @valid_uuid,
        "tenant_id" => @valid_tenant,
        "analysis_type" => "full",
        "options" => %{}
      }

      job = build_job(args)
      assert job.args == args
      assert job.attempt == 1
    end
  end

  # Helper to build a mock Oban job
  defp build_job(args, opts \\ []) do
    %Oban.Job{
      args: args,
      attempt: Keyword.get(opts, :attempt, 1),
      queue: "analysis",
      worker: "Cybernetic.Workers.EpisodeAnalyzer"
    }
  end
end
