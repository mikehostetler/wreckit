defmodule Cybernetic.Config do
  @moduledoc """
  Centralized configuration management for the Cybernetic platform.

  Provides typed access to configuration values with sensible defaults.
  All configurable constants should be defined here.

  ## Configuration Structure

      config :cybernetic,
        # SSE/Events configuration
        sse: [
          heartbeat_interval: 30_000,
          max_connection_duration: 3_600_000,
          max_connections_per_tenant: 100
        ],

        # Storage configuration
        storage: [
          adapter: Cybernetic.Storage.Adapters.Local,
          base_path: "/var/data/cybernetic",
          streaming_threshold: 1_048_576,
          chunk_size: 65_536,
          compute_etag: true
        ],

        # LLM configuration
        llm: [
          provider: :openai,
          base_url: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
          max_content_length: 10_000,
          max_tokens: 1000,
          timeout: 30_000
        ],

        # Worker configuration
        workers: [
          analysis_parallelism: 4,
          notification_batch_size: 10,
          policy_evaluation_timeout: 5_000
        ]
  """

  # ============================================================================
  # SSE/Events Configuration
  # ============================================================================

  @doc "Heartbeat interval for SSE connections in milliseconds"
  @spec sse_heartbeat_interval() :: pos_integer()
  def sse_heartbeat_interval do
    get_in_config([:sse, :heartbeat_interval], 30_000)
  end

  @doc "Maximum duration for a single SSE connection in milliseconds"
  @spec sse_max_connection_duration() :: pos_integer()
  def sse_max_connection_duration do
    get_in_config([:sse, :max_connection_duration], 3_600_000)
  end

  @doc "Maximum concurrent SSE connections per tenant"
  @spec sse_max_connections_per_tenant() :: pos_integer()
  def sse_max_connections_per_tenant do
    get_in_config([:sse, :max_connections_per_tenant], 100)
  end

  @doc "Default topics for SSE subscriptions"
  @spec sse_default_topics() :: [String.t()]
  def sse_default_topics do
    get_in_config([:sse, :default_topics], ["vsm.*", "episode.*", "policy.*", "artifact.*"])
  end

  # ============================================================================
  # Storage Configuration
  # ============================================================================

  @doc "Storage adapter module"
  @spec storage_adapter() :: module()
  def storage_adapter do
    get_in_config([:storage, :adapter], Cybernetic.Storage.Adapters.Local)
  end

  @doc "Base path for local storage"
  @spec storage_base_path() :: String.t()
  def storage_base_path do
    get_in_config([:storage, :base_path], "/tmp/cybernetic/storage")
  end

  @doc "Threshold in bytes above which to use streaming"
  @spec storage_streaming_threshold() :: pos_integer()
  def storage_streaming_threshold do
    get_in_config([:storage, :streaming_threshold], 1_048_576)
  end

  @doc "Default chunk size for streaming operations"
  @spec storage_chunk_size() :: pos_integer()
  def storage_chunk_size do
    get_in_config([:storage, :chunk_size], 65_536)
  end

  @doc "Whether to compute ETags on write (can be expensive for large files)"
  @spec storage_compute_etag?() :: boolean()
  def storage_compute_etag? do
    get_in_config([:storage, :compute_etag], true)
  end

  @doc "Maximum file size in bytes (0 = unlimited)"
  @spec storage_max_file_size() :: non_neg_integer()
  def storage_max_file_size do
    get_in_config([:storage, :max_file_size], 0)
  end

  # ============================================================================
  # LLM Configuration
  # ============================================================================

  @doc "LLM provider (:openai, :anthropic, :local)"
  @spec llm_provider() :: atom()
  def llm_provider do
    get_in_config([:llm, :provider], :openai)
  end

  @doc "LLM API base URL"
  @spec llm_base_url() :: String.t()
  def llm_base_url do
    get_in_config([:llm, :base_url], "https://api.openai.com/v1")
  end

  @doc "Default LLM model"
  @spec llm_model() :: String.t()
  def llm_model do
    get_in_config([:llm, :model], "gpt-4o-mini")
  end

  @doc "Maximum content length to send to LLM (chars)"
  @spec llm_max_content_length() :: pos_integer()
  def llm_max_content_length do
    get_in_config([:llm, :max_content_length], 10_000)
  end

  @doc "Maximum tokens for LLM response"
  @spec llm_max_tokens() :: pos_integer()
  def llm_max_tokens do
    get_in_config([:llm, :max_tokens], 1000)
  end

  @doc "LLM request timeout in milliseconds"
  @spec llm_timeout() :: pos_integer()
  def llm_timeout do
    get_in_config([:llm, :timeout], 30_000)
  end

  @doc "LLM API key (from env or config)"
  @spec llm_api_key() :: String.t() | nil
  def llm_api_key do
    case get_in_config([:llm, :api_key], nil) do
      {:system, env_var} -> System.get_env(env_var)
      value -> value
    end
  end

  # ============================================================================
  # Worker Configuration
  # ============================================================================

  @doc "Parallelism for LLM analysis tasks"
  @spec worker_analysis_parallelism() :: pos_integer()
  def worker_analysis_parallelism do
    get_in_config([:workers, :analysis_parallelism], 4)
  end

  @doc "Batch size for notification sending"
  @spec worker_notification_batch_size() :: pos_integer()
  def worker_notification_batch_size do
    get_in_config([:workers, :notification_batch_size], 10)
  end

  @doc "Timeout for policy evaluation in milliseconds"
  @spec worker_policy_evaluation_timeout() :: pos_integer()
  def worker_policy_evaluation_timeout do
    get_in_config([:workers, :policy_evaluation_timeout], 5_000)
  end

  # ============================================================================
  # Telegram Configuration
  # ============================================================================

  @doc "Telegram bot token"
  @spec telegram_bot_token() :: String.t() | nil
  def telegram_bot_token do
    case get_in_config([:telegram, :bot_token], nil) do
      {:system, env_var} -> System.get_env(env_var)
      value -> value
    end
  end

  @doc "Telegram webhook secret"
  @spec telegram_webhook_secret() :: String.t() | nil
  def telegram_webhook_secret do
    case get_in_config([:telegram, :webhook_secret], nil) do
      {:system, env_var} -> System.get_env(env_var)
      value -> value
    end
  end

  # ============================================================================
  # PubSub Configuration
  # ============================================================================

  @doc "PubSub module name"
  @spec pubsub_module() :: module()
  def pubsub_module do
    get_in_config([:pubsub, :module], Cybernetic.PubSub)
  end

  # ============================================================================
  # Validation Configuration
  # ============================================================================

  @doc "Valid UUID regex pattern"
  @spec uuid_pattern() :: Regex.t()
  def uuid_pattern do
    ~r/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  end

  @doc "Valid tenant ID pattern"
  @spec tenant_id_pattern() :: Regex.t()
  def tenant_id_pattern do
    ~r/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/
  end

  # ============================================================================
  # Private Helpers
  # ============================================================================

  @spec get_in_config([atom()], term()) :: term()
  defp get_in_config(path, default) do
    config = Application.get_all_env(:cybernetic)

    case get_in(config, path) do
      nil -> default
      value -> value
    end
  end
end
