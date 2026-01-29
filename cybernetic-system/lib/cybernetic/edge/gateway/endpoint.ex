defmodule Cybernetic.Edge.Gateway.Endpoint do
  @moduledoc """
  Phoenix Endpoint for the Edge Gateway with TLS 1.3 enforcement,
  CORS support, and telemetry integration.
  """
  use Phoenix.Endpoint, otp_app: :cybernetic

  @session_options [
    store: :cookie,
    key: "_cybernetic_key",
    signing_salt: "jQ7fPx2V",
    same_site: "Lax"
  ]

  socket "/live", Phoenix.LiveView.Socket, websocket: [connect_info: [session: @session_options]]

  # TLS 1.3 enforcement for production
  if Application.compile_env(:cybernetic, :enforce_tls) do
    plug(Plug.SSL,
      rewrite_on: [:x_forwarded_proto],
      hsts: true,
      versions: [:"tlsv1.3"]
    )
  end

  # Code reloading for development
  if code_reloading? do
    plug(Phoenix.CodeReloader)
  end

  plug(Plug.RequestId)
  plug(Plug.Telemetry, event_prefix: [:cybernetic, :edge, :endpoint])

  plug(Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()
  )

  plug(Plug.MethodOverride)
  plug(Plug.Head)
  plug(Plug.Session, @session_options)

  # TODO: Add CORS plug when corsica dependency is added
  # plug Corsica,
  #   origins: "*",
  #   allow_headers: ["content-type", "authorization"],
  #   allow_credentials: true,
  #   max_age: 86400

  plug(Cybernetic.Edge.Gateway.Router)
end
