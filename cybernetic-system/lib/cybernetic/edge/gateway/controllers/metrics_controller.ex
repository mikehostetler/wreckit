defmodule Cybernetic.Edge.Gateway.MetricsController do
  @moduledoc """
  Prometheus metrics endpoint controller.

  Exposes PromEx metrics in Prometheus text format at GET /metrics.

  ## Metrics Exported

  - Application metrics (version, uptime)
  - BEAM VM metrics (memory, processes, atoms)
  - Phoenix endpoint metrics (request count, duration)
  - Ecto query metrics (query count, duration)
  - Oban job metrics (job count, duration, failures)

  ## Configuration

  PromEx is configured in `lib/cybernetic/prom_ex.ex`.
  """
  use Phoenix.Controller
  require Logger

  @type metric_format :: :prometheus | :json

  @doc """
  Serve Prometheus metrics in text format.

  ## Parameters

    * `format` - Optional format parameter (default: prometheus text)

  ## Response Headers

    * `Content-Type: text/plain; version=0.0.4; charset=utf-8`
  """
  @spec index(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def index(conn, params) do
    format = parse_format(params["format"])

    case format do
      :prometheus ->
        serve_prometheus_metrics(conn)

      :json ->
        serve_json_metrics(conn)
    end
  end

  # Serve metrics in Prometheus text format
  @spec serve_prometheus_metrics(Plug.Conn.t()) :: Plug.Conn.t()
  defp serve_prometheus_metrics(conn) do
    metrics = collect_prometheus_metrics()

    conn
    |> put_resp_content_type("text/plain; version=0.0.4; charset=utf-8")
    |> put_resp_header("cache-control", "no-cache, no-store, must-revalidate")
    |> send_resp(200, metrics)
  end

  # Serve metrics in JSON format
  @spec serve_json_metrics(Plug.Conn.t()) :: Plug.Conn.t()
  defp serve_json_metrics(conn) do
    metrics = collect_json_metrics()

    conn
    |> put_resp_content_type("application/json")
    |> put_resp_header("cache-control", "no-cache, no-store, must-revalidate")
    |> json(metrics)
  end

  # Collect metrics from PromEx/TelemetryMetricsPrometheus
  @spec collect_prometheus_metrics() :: String.t()
  defp collect_prometheus_metrics do
    # Try to get metrics from PromEx first
    case get_prom_ex_metrics() do
      {:ok, metrics} ->
        metrics

      {:error, _} ->
        # Fallback to manual metric collection
        collect_fallback_metrics()
    end
  end

  # Attempt to get metrics from PromEx
  @spec get_prom_ex_metrics() :: {:ok, String.t()} | {:error, term()}
  defp get_prom_ex_metrics do
    # PromEx stores metrics in ETS tables
    # The metrics are scraped by the PromEx.MetricsCacheETS module
    case :ets.whereis(:prom_ex_metrics_cache) do
      :undefined ->
        {:error, :prom_ex_not_running}

      _tid ->
        # Get all metrics from the cache
        metrics =
          :ets.tab2list(:prom_ex_metrics_cache)
          |> Enum.map(fn {_key, value} -> value end)
          |> Enum.join("\n")

        if metrics == "" do
          {:error, :no_metrics}
        else
          {:ok, metrics}
        end
    end
  rescue
    _ -> {:error, :ets_error}
  end

  # Fallback metrics when PromEx is not available
  @spec collect_fallback_metrics() :: String.t()
  defp collect_fallback_metrics do
    memory = :erlang.memory()
    process_count = :erlang.system_info(:process_count)
    {uptime_ms, _} = :erlang.statistics(:wall_clock)
    uptime_seconds = div(uptime_ms, 1000)

    # Collect basic BEAM metrics
    """
    # HELP cybernetic_up Service availability (1 = up, 0 = down)
    # TYPE cybernetic_up gauge
    cybernetic_up 1

    # HELP cybernetic_info Build and version information
    # TYPE cybernetic_info gauge
    cybernetic_info{version="#{app_version()}",otp_version="#{otp_version()}"} 1

    # HELP cybernetic_uptime_seconds Service uptime in seconds
    # TYPE cybernetic_uptime_seconds counter
    cybernetic_uptime_seconds #{uptime_seconds}

    # HELP beam_memory_bytes BEAM memory usage in bytes
    # TYPE beam_memory_bytes gauge
    beam_memory_bytes{type="total"} #{memory[:total]}
    beam_memory_bytes{type="processes"} #{memory[:processes]}
    beam_memory_bytes{type="system"} #{memory[:system]}
    beam_memory_bytes{type="atom"} #{memory[:atom]}
    beam_memory_bytes{type="binary"} #{memory[:binary]}
    beam_memory_bytes{type="ets"} #{memory[:ets]}

    # HELP beam_process_count Number of BEAM processes
    # TYPE beam_process_count gauge
    beam_process_count #{process_count}

    # HELP beam_schedulers_count Number of BEAM schedulers
    # TYPE beam_schedulers_count gauge
    beam_schedulers_count{type="online"} #{:erlang.system_info(:schedulers_online)}
    beam_schedulers_count{type="total"} #{:erlang.system_info(:schedulers)}

    # HELP beam_reductions_total Total reductions executed
    # TYPE beam_reductions_total counter
    beam_reductions_total #{elem(:erlang.statistics(:reductions), 0)}
    """
  end

  # Collect metrics as JSON
  @spec collect_json_metrics() :: map()
  defp collect_json_metrics do
    memory = :erlang.memory()
    {uptime_ms, _} = :erlang.statistics(:wall_clock)

    %{
      status: "healthy",
      version: app_version(),
      otp_version: otp_version(),
      uptime_seconds: div(uptime_ms, 1000),
      beam: %{
        memory: %{
          total: memory[:total],
          processes: memory[:processes],
          system: memory[:system],
          atom: memory[:atom],
          binary: memory[:binary],
          ets: memory[:ets]
        },
        processes: :erlang.system_info(:process_count),
        schedulers: %{
          online: :erlang.system_info(:schedulers_online),
          total: :erlang.system_info(:schedulers)
        },
        reductions: elem(:erlang.statistics(:reductions), 0)
      },
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    }
  end

  # Parse format parameter
  @spec parse_format(String.t() | nil) :: metric_format()
  defp parse_format("json"), do: :json
  defp parse_format(_), do: :prometheus

  # Get application version
  @spec app_version() :: String.t()
  defp app_version do
    case :application.get_key(:cybernetic, :vsn) do
      {:ok, vsn} -> to_string(vsn)
      _ -> "0.0.0"
    end
  end

  # Get OTP version
  @spec otp_version() :: String.t()
  defp otp_version do
    :erlang.system_info(:otp_release) |> to_string()
  end
end
