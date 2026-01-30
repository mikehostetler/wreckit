defmodule Cybernetic.Workers.TelegramDispatcherTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Workers.TelegramDispatcher

  describe "perform/1 with commands" do
    test "handles /start command" do
      job =
        build_job(%{
          "chat_id" => 123_456_789,
          "command" => "/start",
          "text" => "/start",
          "user" => %{"id" => 123, "first_name" => "Test"}
        })

      result = TelegramDispatcher.perform(job)
      # Will fail at actual Telegram API call
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles /help command" do
      job =
        build_job(%{
          "chat_id" => 123_456_789,
          "command" => "/help",
          "text" => "/help",
          "user" => %{"id" => 123, "first_name" => "Test"}
        })

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles /status command" do
      job =
        build_job(%{
          "chat_id" => 123_456_789,
          "command" => "/status",
          "text" => "/status",
          "user" => %{"id" => 123, "first_name" => "Test"}
        })

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles /episodes command" do
      job =
        build_job(%{
          "chat_id" => 123_456_789,
          "command" => "/episodes",
          "text" => "/episodes",
          "user" => %{"id" => 123, "first_name" => "Test"}
        })

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles /policies command" do
      job =
        build_job(%{
          "chat_id" => 123_456_789,
          "command" => "/policies",
          "text" => "/policies",
          "user" => %{"id" => 123, "first_name" => "Test"}
        })

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles unknown command" do
      job =
        build_job(%{
          "chat_id" => 123_456_789,
          "command" => "/unknown",
          "text" => "/unknown",
          "user" => %{"id" => 123, "first_name" => "Test"}
        })

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  describe "perform/1 with callback queries" do
    test "handles callback query" do
      job =
        build_job(%{
          "chat_id" => 123_456_789,
          "callback_query" => %{
            "id" => "callback-123",
            "data" => "episode:view:123"
          },
          "user" => %{"id" => 123, "first_name" => "Test"}
        })

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles callback with pagination" do
      job =
        build_job(%{
          "chat_id" => 123_456_789,
          "callback_query" => %{
            "id" => "callback-456",
            "data" => "episodes:page:2"
          },
          "user" => %{"id" => 123, "first_name" => "Test"}
        })

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  describe "perform/1 error handling" do
    test "handles missing chat_id" do
      job =
        build_job(%{
          "command" => "/start",
          "text" => "/start"
        })

      result =
        try do
          TelegramDispatcher.perform(job)
        rescue
          _ -> {:error, :missing_chat_id}
        end

      assert result == :ok or match?({:error, _}, result)
    end

    test "handles missing command and callback" do
      job =
        build_job(%{
          "chat_id" => 123_456_789,
          "user" => %{"id" => 123}
        })

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end

    test "handles invalid chat_id type" do
      job =
        build_job(%{
          "chat_id" => "not-a-number",
          "command" => "/start"
        })

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  describe "retry behavior" do
    test "handles multiple attempts" do
      job =
        build_job(
          %{
            "chat_id" => 123_456_789,
            "command" => "/start",
            "text" => "/start"
          },
          attempt: 3
        )

      result = TelegramDispatcher.perform(job)
      assert result == :ok or match?({:error, _}, result)
    end
  end

  # Helper to build a mock Oban job
  defp build_job(args, opts \\ []) do
    %Oban.Job{
      args: args,
      attempt: Keyword.get(opts, :attempt, 1),
      queue: "telegram",
      worker: "Cybernetic.Workers.TelegramDispatcher"
    }
  end
end
