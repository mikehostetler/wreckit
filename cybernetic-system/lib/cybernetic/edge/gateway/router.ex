defmodule Cybernetic.Edge.Gateway.Router do
  @moduledoc """
  Phoenix Edge Gateway for handling API traffic with security, 
  performance, and multi-tenancy support.
  """
  use Phoenix.Router
  import Plug.Conn
  import Phoenix.LiveView.Router
  import Phoenix.LiveDashboard.Router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, {Cybernetic.Edge.Gateway.LayoutView, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug(:accepts, ["json"])
    plug(Cybernetic.Edge.Gateway.Plugs.RequestId)
    plug(Cybernetic.Edge.Gateway.Plugs.OIDC)
    plug(Cybernetic.Edge.Gateway.Plugs.TenantIsolation)
    plug(Cybernetic.Edge.Gateway.Plugs.RateLimiter)
    plug(Cybernetic.Edge.Gateway.Plugs.CircuitBreaker)
  end

  pipeline :sse do
    plug(:accepts, ["text/event-stream"])
    plug(Cybernetic.Edge.Gateway.Plugs.RequestId)
    plug(Cybernetic.Edge.Gateway.Plugs.OIDC)
    plug(Cybernetic.Edge.Gateway.Plugs.TenantIsolation)
  end

  pipeline :mcp do
    plug(Cybernetic.Edge.Gateway.Plugs.RequestId)
    plug(Cybernetic.Edge.Gateway.Plugs.OIDC)
    plug(Cybernetic.Edge.Gateway.Plugs.TenantIsolation)
  end

  # API v1 endpoints
  scope "/v1", Cybernetic.Edge.Gateway do
    pipe_through(:api)

    post("/generate", GenerateController, :create)
  end

  # SSE endpoint
  scope "/v1", Cybernetic.Edge.Gateway do
    pipe_through(:sse)

    get("/events", EventsController, :stream)
  end

  # Telegram webhook (no auth required)
  scope "/telegram", Cybernetic.Edge.Gateway do
    post("/webhook", TelegramController, :webhook)
  end

  # MCP endpoint (Hermes StreamableHTTP)
  scope "/mcp" do
    pipe_through(:mcp)

    forward(
      "/",
      Hermes.Server.Transport.StreamableHTTP.Plug,
      server: Cybernetic.Integrations.OhMyOpencode.MCPProvider
    )
  end

  # Prometheus metrics endpoint (no auth)
  scope "/metrics", Cybernetic.Edge.Gateway do
    get("/", MetricsController, :index)
  end

  # Visual Command Center
  scope "/", Cybernetic.Edge.Gateway do
    pipe_through :browser
    live "/", HomeLive, :index
  end

  # Health check at root (no auth)
  scope "/", Cybernetic.Edge.Gateway do
    get("/health", HealthController, :index)
    get("/health/detailed", HealthController, :detailed)
    get("/health/vsm", HealthController, :vsm)
    get("/health/resilience", HealthController, :resilience)
  end

  scope "/" do
    pipe_through :browser
    live_dashboard "/dashboard", 
      metrics: Cybernetic.Telemetry.PromEx,
      additional_pages: [
        lifecycle: Cybernetic.Edge.Gateway.LifecyclePage
      ]
  end
end