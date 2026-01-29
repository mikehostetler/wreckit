defmodule Cybernetic.Workers.HealthCheck do
  @moduledoc """
  Oban worker that periodically snapshots overall system health.

  This is used by `Oban.Plugins.Cron` in production to provide a lightweight,
  scheduled "heartbeat" for observability and alerting.
  """

  use Oban.Worker,
    queue: :default,
    max_attempts: 1,
    priority: 1

  require Logger

  @telemetry [:cybernetic, :worker, :health_check]

  @impl Oban.Worker
  @spec perform(Oban.Job.t()) :: :ok | {:error, term()}
  def perform(%Oban.Job{} = job) do
    start_time = System.monotonic_time(:millisecond)

    detailed = Cybernetic.Health.Monitor.detailed_status()

    Logger.info("Health check snapshot",
      job_id: job.id,
      overall_status: detailed[:overall_status] || detailed[:status] || :unknown
    )

    :telemetry.execute(
      @telemetry ++ [:snapshot],
      %{duration_ms: System.monotonic_time(:millisecond) - start_time},
      %{
        job_id: job.id,
        overall_status: detailed[:overall_status] || detailed[:status] || :unknown
      }
    )

    :ok
  rescue
    e ->
      Logger.error("Health check worker failed", error: Exception.message(e))
      {:error, :health_check_failed}
  end
end
