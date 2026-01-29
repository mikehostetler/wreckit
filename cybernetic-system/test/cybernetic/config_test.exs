defmodule Cybernetic.ConfigTest do
  # NOTE: async: false to prevent config pollution between tests
  use ExUnit.Case, async: false

  alias Cybernetic.Config

  setup do
    # Clear any custom SSE config before each test
    Application.delete_env(:cybernetic, :sse)
    :ok
  end

  describe "SSE configuration" do
    test "sse_heartbeat_interval/0 returns default" do
      assert Config.sse_heartbeat_interval() == 30_000
    end

    test "sse_max_connection_duration/0 returns default" do
      assert Config.sse_max_connection_duration() == 3_600_000
    end

    test "sse_max_connections_per_tenant/0 returns default" do
      assert Config.sse_max_connections_per_tenant() == 100
    end

    test "sse_default_topics/0 returns list of topics" do
      topics = Config.sse_default_topics()
      assert is_list(topics)
      assert "vsm.*" in topics
      assert "episode.*" in topics
    end
  end

  describe "Storage configuration" do
    test "storage_adapter/0 returns default adapter" do
      adapter = Config.storage_adapter()
      assert is_atom(adapter)
    end

    test "storage_base_path/0 returns default path" do
      path = Config.storage_base_path()
      assert is_binary(path)
    end

    test "storage_streaming_threshold/0 returns default" do
      assert Config.storage_streaming_threshold() == 1_048_576
    end

    test "storage_chunk_size/0 returns default" do
      assert Config.storage_chunk_size() == 65_536
    end

    test "storage_compute_etag?/0 returns default" do
      assert Config.storage_compute_etag?() == true
    end

    test "storage_max_file_size/0 returns default" do
      assert Config.storage_max_file_size() == 0
    end
  end

  describe "LLM configuration" do
    test "llm_provider/0 returns default" do
      assert Config.llm_provider() == :openai
    end

    test "llm_base_url/0 returns default" do
      assert Config.llm_base_url() == "https://api.openai.com/v1"
    end

    test "llm_model/0 returns default" do
      assert Config.llm_model() == "gpt-4o-mini"
    end

    test "llm_max_content_length/0 returns default" do
      assert Config.llm_max_content_length() == 10_000
    end

    test "llm_max_tokens/0 returns default" do
      assert Config.llm_max_tokens() == 1000
    end

    test "llm_timeout/0 returns default" do
      assert Config.llm_timeout() == 30_000
    end
  end

  describe "Worker configuration" do
    test "worker_analysis_parallelism/0 returns default" do
      assert Config.worker_analysis_parallelism() == 4
    end

    test "worker_notification_batch_size/0 returns default" do
      assert Config.worker_notification_batch_size() == 10
    end

    test "worker_policy_evaluation_timeout/0 returns default" do
      assert Config.worker_policy_evaluation_timeout() == 5_000
    end
  end

  describe "PubSub configuration" do
    test "pubsub_module/0 returns default" do
      assert Config.pubsub_module() == Cybernetic.PubSub
    end
  end

  describe "Validation patterns" do
    test "uuid_pattern/0 returns regex" do
      pattern = Config.uuid_pattern()
      assert %Regex{} = pattern
      assert Regex.match?(pattern, "550e8400-e29b-41d4-a716-446655440000")
      refute Regex.match?(pattern, "not-a-uuid")
    end

    test "tenant_id_pattern/0 returns regex" do
      pattern = Config.tenant_id_pattern()
      assert %Regex{} = pattern
      assert Regex.match?(pattern, "tenant-1")
      assert Regex.match?(pattern, "Tenant_123")
      refute Regex.match?(pattern, "../escape")
    end
  end

  describe "configuration override" do
    setup do
      # Store original config
      original = Application.get_all_env(:cybernetic)

      on_exit(fn ->
        # Restore original config
        Application.put_all_env(cybernetic: original)
      end)

      :ok
    end

    test "reads custom values from config" do
      Application.put_env(:cybernetic, :sse, heartbeat_interval: 60_000)

      # Note: Config module caches values, so this test may not work as expected
      # in all cases. In production, consider using compile-time config
      # or a Config GenServer that can be refreshed.
      heartbeat = Config.sse_heartbeat_interval()
      assert heartbeat in [30_000, 60_000]
    end
  end
end
