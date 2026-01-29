defmodule Cybernetic.Edge.Gateway.HealthController do
  @moduledoc """
  Health check controller for system health endpoints.

  Provides:
  - Basic health check (/)
  - Detailed health (/health/detailed)
  - VSM systems status (/health/vsm)
  - Resilience status (/health/resilience)
  """
  use Phoenix.Controller

  @vsm_systems [
    {:system1, Cybernetic.VSM.System1.Operational, "Operations"},
    {:system2, Cybernetic.VSM.System2.Coordinator, "Coordination"},
    {:system3, Cybernetic.VSM.System3.Control, "Control"},
    {:system4, Cybernetic.VSM.System4.Service, "Intelligence"},
    {:system5, Cybernetic.VSM.System5.Policy, "Policy"}
  ]

  def index(conn, _params) do
    conn
    |> put_status(:ok)
    |> json(%{
      status: "ok",
      service: "cybernetic-amcp",
      version: Application.spec(:cybernetic, :vsn) |> to_string(),
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    })
  end

  @doc """
  Returns detailed health information including all subsystems.
  """
  def detailed(conn, _params) do
    vsm_status = get_vsm_status()
    resilience_status = get_resilience_status()
    infrastructure_status = get_infrastructure_status()

    vsm_healthy = Enum.count(vsm_status, fn {_, s} -> s.status == :healthy end)
    infra_healthy = Enum.count(infrastructure_status, fn {_, s} -> s == :healthy end)

    confidence = calculate_confidence(vsm_healthy, resilience_status, infra_healthy)

    overall_status = cond do
      confidence >= 90 -> "healthy"
      confidence >= 70 -> "degraded"
      true -> "critical"
    end

    conn
    |> put_status(:ok)
    |> json(%{
      status: overall_status,
      confidence: confidence,
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
      version: Application.spec(:cybernetic, :vsn) |> to_string(),
      vsm_systems: format_vsm_status(vsm_status),
      resilience: resilience_status,
      infrastructure: format_infrastructure_status(infrastructure_status)
    })
  end

  @doc """
  Returns VSM systems status.
  """
  def vsm(conn, _params) do
    vsm_status = get_vsm_status()
    healthy_count = Enum.count(vsm_status, fn {_, s} -> s.status == :healthy end)
    total_count = length(@vsm_systems)

    conn
    |> put_status(:ok)
    |> json(%{
      status: if(healthy_count == total_count, do: "healthy", else: "degraded"),
      healthy: healthy_count,
      total: total_count,
      systems: format_vsm_status(vsm_status),
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    })
  end

  @doc """
  Returns resilience status (Ralph Wiggum loops).
  """
  def resilience(conn, _params) do
    resilience_status = get_resilience_status()

    conn
    |> put_status(:ok)
    |> json(%{
      status: if(resilience_status.telegram_agent.status == :healthy, do: "healthy", else: "degraded"),
      telegram_agent: resilience_status.telegram_agent,
      circuit_breakers: resilience_status.circuit_breakers,
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    })
  end

  # Private functions

  defp get_vsm_status do
    Enum.map(@vsm_systems, fn {key, module, name} ->
      status = case Process.whereis(module) do
        nil -> %{status: :down, pid: nil, name: name}
        pid when is_pid(pid) ->
          if Process.alive?(pid) do
            %{status: :healthy, pid: inspect(pid), name: name}
          else
            %{status: :unhealthy, pid: inspect(pid), name: name}
          end
      end
      {key, status}
    end)
  end

  defp get_resilience_status do
    telegram_status = case Process.whereis(Cybernetic.VSM.System1.Agents.TelegramAgent) do
      nil -> %{status: :down, polling: false, last_success: nil}
      pid when is_pid(pid) ->
        if Process.alive?(pid) do
          # Try to get state info
          state = try do
            :sys.get_state(pid, 1000)
          catch
            _, _ -> %{}
          end

          last_success = Map.get(state, :last_poll_success)
          polling_failures = Map.get(state, :polling_failures, 0)

          formatted_last_success = case last_success do
            nil -> nil
            %DateTime{} = dt -> DateTime.to_iso8601(dt)
            unix when is_integer(unix) -> DateTime.from_unix!(unix) |> DateTime.to_iso8601()
            _ -> nil
          end

          %{
            status: :healthy,
            polling: true,
            last_success: formatted_last_success,
            polling_failures: polling_failures
          }
        else
          %{status: :unhealthy, polling: false, last_success: nil}
        end
    end

    circuit_breaker_status = try do
      case Cybernetic.Core.Resilience.CircuitBreakerAlerts.get_alert_status() do
        %{active_alerts: alerts} -> %{active_alerts: alerts, status: if(alerts == 0, do: :healthy, else: :degraded)}
        _ -> %{active_alerts: 0, status: :unknown}
      end
    catch
      _, _ -> %{active_alerts: 0, status: :not_available}
    end

    %{
      telegram_agent: telegram_status,
      circuit_breakers: circuit_breaker_status
    }
  end

  defp get_infrastructure_status do
    %{
      rabbitmq: check_rabbitmq(),
      redis: check_redis(),
      postgres: check_postgres()
    }
  end

  defp check_rabbitmq do
    case Process.whereis(Cybernetic.Transport.AMQP.Connection) do
      nil -> :down
      pid -> if Process.alive?(pid), do: :healthy, else: :unhealthy
    end
  end

  defp check_redis do
    redis_url = System.get_env("REDIS_URL") || "redis://localhost:6379"

    try do
      case Redix.start_link(redis_url) do
        {:ok, conn} ->
          result = case Redix.command(conn, ["PING"]) do
            {:ok, "PONG"} -> :healthy
            _ -> :unhealthy
          end
          Redix.stop(conn)
          result
        {:error, _} -> :down
      end
    catch
      _, _ -> :down
    end
  end

  defp check_postgres do
    try do
      case Ecto.Adapters.SQL.query(Cybernetic.Repo, "SELECT 1", []) do
        {:ok, _} -> :healthy
        _ -> :unhealthy
      end
    catch
      _, _ -> :down
    end
  end

  defp calculate_confidence(vsm_healthy, resilience_status, infra_healthy) do
    vsm_score = vsm_healthy / 5 * 100

    resilience_score = case resilience_status.telegram_agent.status do
      :healthy -> 100
      :unhealthy -> 50
      _ -> 0
    end

    infra_score = infra_healthy / 3 * 100

    # Weighted average: VSM 40%, Resilience 30%, Infrastructure 30%
    round(vsm_score * 0.4 + resilience_score * 0.3 + infra_score * 0.3)
  end

  defp format_vsm_status(vsm_status) do
    Enum.into(vsm_status, %{}, fn {key, status} ->
      {key, %{
        name: status.name,
        status: to_string(status.status),
        pid: status.pid
      }}
    end)
  end

  defp format_infrastructure_status(infra_status) do
    Enum.into(infra_status, %{}, fn {key, status} ->
      {key, to_string(status)}
    end)
  end
end
