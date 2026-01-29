defmodule Cybernetic.Workers.MetricsCollector do
  @moduledoc """
  Oban worker that periodically emits a coarse metrics snapshot.

  This is intentionally lightweight and avoids scraping/exporting Prometheus
  metrics (PromEx already handles that). Instead, it captures useful counters
  from internal processes (e.g., JWKS cache stats) for logging/telemetry.
  """

  use Oban.Worker,
    queue: :default,
    max_attempts: 1,
    priority: 1

  require Logger

  alias Cybernetic.Security.JWKSCache
  alias Cybernetic.VSM.System3.RateLimiter

  @telemetry [:cybernetic, :worker, :metrics_collector]

  @impl Oban.Worker
  @spec perform(Oban.Job.t()) :: :ok | {:error, term()}
  def perform(%Oban.Job{} = job) do
    start_time = System.monotonic_time(:millisecond)

    snapshot = %{
      jwks_cache: safe_jwks_cache_stats(),
      auth: %{
        sessions: safe_ets_size(:auth_sessions),
        api_keys: safe_ets_size(:api_keys)
      },
      rate_limiter: safe_rate_limiter_stats()
    }

    Logger.info("Metrics snapshot collected", job_id: job.id)

    :telemetry.execute(
      @telemetry ++ [:snapshot],
      %{duration_ms: System.monotonic_time(:millisecond) - start_time},
      %{job_id: job.id, snapshot: snapshot}
    )

    :ok
  rescue
    e ->
      Logger.error("MetricsCollector failed", error: Exception.message(e))
      {:error, :metrics_snapshot_failed}
  end

  defp safe_jwks_cache_stats do
    case Process.whereis(JWKSCache) do
      nil -> %{running?: false}
      _pid -> JWKSCache.stats() |> Map.put(:running?, true)
    end
  rescue
    _ -> %{running?: false}
  end

  defp safe_rate_limiter_stats do
    case Process.whereis(RateLimiter) do
      nil -> %{running?: false}
      _pid -> RateLimiter.all_budgets() |> Map.put(:running?, true)
    end
  rescue
    _ -> %{running?: false}
  end

  defp safe_ets_size(table) do
    case :ets.info(table, :size) do
      :undefined -> 0
      size when is_integer(size) -> size
    end
  rescue
    ArgumentError -> 0
  end
end
