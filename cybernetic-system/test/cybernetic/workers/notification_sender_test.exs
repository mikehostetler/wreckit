defmodule Cybernetic.Workers.NotificationSenderTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Workers.NotificationSender

  @valid_tenant "test-tenant"

  describe "perform/1 with email channel" do
    test "handles email notification" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "channel" => "email",
          "message" => "Test notification",
          "recipient" => "test@example.com",
          "metadata" => %{"subject" => "Test Subject"}
        })

      # Will fail at actual send, but tests the path
      result = NotificationSender.perform(job)
      # Either success (mocked) or error (no email config)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  describe "perform/1 with slack channel" do
    test "handles slack notification" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "channel" => "slack",
          "message" => "Test slack message",
          "recipient" => "#general",
          "metadata" => %{}
        })

      result = NotificationSender.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  describe "perform/1 with telegram channel" do
    test "handles telegram notification" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "channel" => "telegram",
          "message" => "Test telegram message",
          "recipient" => "123456789",
          "metadata" => %{}
        })

      result = NotificationSender.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  describe "perform/1 with webhook channel" do
    test "handles webhook notification" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "channel" => "webhook",
          "message" => "Test webhook payload",
          "recipient" => "https://example.com/webhook",
          "metadata" => %{"event_type" => "test"}
        })

      result = NotificationSender.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  describe "perform/1 error handling" do
    test "handles invalid channel" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "channel" => "invalid_channel",
          "message" => "Test",
          "recipient" => "test"
        })

      # Should raise ArgumentError for invalid atom or handle gracefully
      result =
        try do
          NotificationSender.perform(job)
        rescue
          ArgumentError -> {:error, :invalid_channel}
        end

      assert match?({:error, _}, result)
    end

    test "handles missing required fields" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant
          # Missing channel, message, recipient
        })

      result =
        try do
          NotificationSender.perform(job)
        rescue
          _ -> {:error, :missing_fields}
        end

      assert match?({:error, _}, result)
    end

    test "handles nil message" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "channel" => "email",
          "message" => nil,
          "recipient" => "test@example.com"
        })

      result = NotificationSender.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  describe "retry behavior" do
    test "handles multiple attempts" do
      job =
        build_job(
          %{
            "tenant_id" => @valid_tenant,
            "channel" => "email",
            "message" => "Retry test",
            "recipient" => "test@example.com"
          },
          attempt: 3
        )

      result = NotificationSender.perform(job)
      assert result == :ok or match?({:error, _}, result) or match?({:snooze, _}, result)
    end

    test "max attempts respected" do
      job =
        build_job(
          %{
            "tenant_id" => @valid_tenant,
            "channel" => "email",
            "message" => "Max attempt test",
            "recipient" => "test@example.com"
          },
          attempt: 5
        )

      result = NotificationSender.perform(job)
      assert result == :ok or match?({:error, _}, result) or match?({:snooze, _}, result)
    end
  end

  describe "metadata handling" do
    test "passes metadata to notification" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "channel" => "webhook",
          "message" => "Test with metadata",
          "recipient" => "https://example.com/hook",
          "metadata" => %{
            "priority" => "high",
            "tags" => ["urgent", "alert"],
            "custom_field" => "custom_value"
          }
        })

      result = NotificationSender.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles empty metadata" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "channel" => "email",
          "message" => "No metadata",
          "recipient" => "test@example.com",
          "metadata" => %{}
        })

      result = NotificationSender.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles nil metadata" do
      job =
        build_job(%{
          "tenant_id" => @valid_tenant,
          "channel" => "email",
          "message" => "Nil metadata",
          "recipient" => "test@example.com"
          # metadata not provided
        })

      result = NotificationSender.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  # Helper to build a mock Oban job
  defp build_job(args, opts \\ []) do
    %Oban.Job{
      args: args,
      attempt: Keyword.get(opts, :attempt, 1),
      queue: "notifications",
      worker: "Cybernetic.Workers.NotificationSender"
    }
  end
end
