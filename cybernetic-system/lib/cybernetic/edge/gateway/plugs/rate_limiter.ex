defmodule Cybernetic.Edge.Gateway.Plugs.RateLimiter do
  @moduledoc """
  Rate limiting plug using S3 RateLimiter
  """
  import Plug.Conn
  require Logger

  def init(opts), do: opts

  def call(conn, _opts) do
    tenant_id = conn.assigns[:tenant_id] || "default"

    case Cybernetic.VSM.System3.RateLimiter.request_tokens(:api_gateway, tenant_id, :normal) do
      :ok ->
        conn

      {:error, :rate_limited} ->
        Logger.warning("Rate limit exceeded for tenant: #{tenant_id}")

        conn
        |> put_resp_header("retry-after", "60")
        |> put_resp_content_type("application/json")
        |> send_resp(429, Jason.encode!(%{error: "Rate limit exceeded"}))
        |> halt()
    end
  rescue
    e ->
      Logger.warning("Rate limiter plug error", error: inspect(e))

      env = Application.get_env(:cybernetic, :environment, :prod)

      if env == :prod do
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(
          503,
          Jason.encode!(%{error: "service_unavailable", message: "Rate limiter unavailable"})
        )
        |> halt()
      else
        # Dev/test: allow request if rate limiter is unavailable
        conn
      end
  end
end
