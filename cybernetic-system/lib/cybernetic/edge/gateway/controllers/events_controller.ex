defmodule Cybernetic.Edge.Gateway.EventsController do
  @moduledoc """
  Server-Sent Events controller for streaming VSM updates.

  Supports topic-based subscriptions:
  - vsm.* - All VSM system events
  - episode.* - Episode lifecycle events
  - policy.* - Policy change events
  - artifact.* - Storage artifact events

  ## Usage

      GET /v1/events?topics=vsm.*,episode.*

  ## Security

  - Connections have a maximum duration (configurable, default 1 hour)
  - Rate limiting per tenant via connection count limits
  - Client IP validation for X-Forwarded-For headers

  ## Configuration

      config :cybernetic, :sse,
        heartbeat_interval: 30_000,
        max_connection_duration: 3_600_000,
        max_connections_per_tenant: 100
  """
  use Phoenix.Controller
  require Logger

  alias Cybernetic.Config
  alias Cybernetic.Validation

  # Module attributes
  @telemetry_prefix [:cybernetic, :sse]
  @connection_table :sse_connections

  # Type definitions
  @typedoc "Topic pattern for SSE subscriptions (e.g., 'vsm.*', 'episode.created')"
  @type topic :: String.t()

  @typep connection_state :: %{
           topics: [topic()],
           tenant_id: String.t() | nil,
           started_at: integer(),
           event_count: non_neg_integer()
         }

  @doc """
  Stream SSE events to the client.

  ## Parameters

    * `topics` - Comma-separated list of topic patterns (default: all topics)
    * `last_event_id` - Resume from this event ID (for reconnection)
  """
  @spec stream(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def stream(conn, params) do
    tenant_id = conn.assigns[:tenant_id]
    topics = parse_topics(params["topics"])
    last_event_id = params["last_event_id"]
    client_ip = Validation.get_client_ip(conn, trust_proxy?())

    # Check connection limits
    case check_connection_limit(tenant_id) do
      :ok ->
        start_streaming(conn, topics, tenant_id, client_ip, last_event_id)

      {:error, :limit_exceeded} ->
        Logger.warning("SSE connection limit exceeded",
          tenant_id: tenant_id,
          client_ip: client_ip
        )

        conn
        |> put_status(:too_many_requests)
        |> put_resp_header("retry-after", "60")
        |> json(%{error: "connection_limit_exceeded", retry_after: 60})
    end
  end

  # Start the SSE stream
  @spec start_streaming(Plug.Conn.t(), [topic()], String.t() | nil, String.t(), String.t() | nil) ::
          Plug.Conn.t()
  defp start_streaming(conn, topics, tenant_id, client_ip, last_event_id) do
    started_at = System.monotonic_time(:millisecond)

    Logger.info("SSE connection opened",
      topics: topics,
      last_event_id: last_event_id,
      client_ip: client_ip,
      tenant_id: tenant_id
    )

    emit_telemetry(:connection_opened, %{count: 1}, %{tenant_id: tenant_id})
    register_connection(tenant_id)

    conn =
      conn
      |> put_resp_content_type("text/event-stream")
      |> put_resp_header("cache-control", "no-cache, no-store, must-revalidate")
      |> put_resp_header("connection", "keep-alive")
      |> put_resp_header("x-accel-buffering", "no")
      |> send_chunked(200)

    # Subscribe to requested topics
    subscribe_to_topics(topics)

    # Initialize connection state
    state = %{
      topics: topics,
      tenant_id: tenant_id,
      started_at: started_at,
      event_count: 0
    }

    # Send initial connection event
    case send_event(conn, "connected", %{
           status: "connected",
           topics: topics,
           max_duration_seconds: div(Config.sse_max_connection_duration(), 1000),
           timestamp: DateTime.utc_now()
         }) do
      {:ok, conn} ->
        # Start the streaming loop
        try do
          stream_loop(conn, state)
        after
          unregister_connection(tenant_id)

          emit_telemetry(:connection_closed, %{count: 1, events_sent: state.event_count}, %{
            tenant_id: tenant_id,
            duration_ms: System.monotonic_time(:millisecond) - started_at
          })
        end

      {:error, _reason} ->
        unregister_connection(tenant_id)
        conn
    end
  end

  # Parse comma-separated topics or use defaults
  @spec parse_topics(String.t() | nil) :: [topic()]
  defp parse_topics(nil), do: Config.sse_default_topics()
  defp parse_topics(""), do: Config.sse_default_topics()

  defp parse_topics(topics_string) do
    topics_string
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.filter(&valid_topic?/1)
    |> Enum.take(10)
    |> case do
      [] -> Config.sse_default_topics()
      topics -> topics
    end
  end

  # Validate topic pattern (prevent injection)
  @spec valid_topic?(String.t()) :: boolean()
  defp valid_topic?(topic) when byte_size(topic) > 100, do: false

  defp valid_topic?(topic) do
    String.match?(topic, ~r/^[a-z0-9_]+\.(\*|[a-z0-9_]+)$/)
  end

  # Subscribe to Phoenix PubSub topics
  @spec subscribe_to_topics([topic()]) :: :ok
  defp subscribe_to_topics(topics) do
    pubsub = Config.pubsub_module()

    Enum.each(topics, fn topic ->
      pubsub_topic = topic_to_pubsub(topic)
      Phoenix.PubSub.subscribe(pubsub, pubsub_topic)
    end)
  end

  # Convert topic pattern to PubSub topic
  @spec topic_to_pubsub(String.t()) :: String.t()
  defp topic_to_pubsub(topic) do
    topic
    |> String.replace(".*", "")
    |> then(&"events:#{&1}")
  end

  # Main streaming loop with heartbeat and timeout
  @spec stream_loop(Plug.Conn.t(), connection_state()) :: Plug.Conn.t()
  defp stream_loop(conn, state) do
    max_duration = Config.sse_max_connection_duration()
    heartbeat_interval = Config.sse_heartbeat_interval()
    elapsed = System.monotonic_time(:millisecond) - state.started_at

    # Check max connection duration
    if elapsed >= max_duration do
      Logger.info("SSE connection max duration reached",
        tenant_id: state.tenant_id,
        duration_ms: elapsed
      )

      send_event(conn, "disconnected", %{
        reason: "max_duration_exceeded",
        duration_seconds: div(elapsed, 1000)
      })

      conn
    else
      # Calculate time until max duration
      remaining = max_duration - elapsed
      timeout = min(heartbeat_interval, remaining)

      receive do
        {:event, event_type, data} ->
          # Filter by tenant to prevent cross-tenant leakage
          if event_matches_tenant?(data, state.tenant_id) do
            handle_event(conn, state, event_type, data)
          else
            stream_loop(conn, state)
          end

        {:broadcast, event_type, data, _from} ->
          # Filter by tenant to prevent cross-tenant leakage
          if event_matches_tenant?(data, state.tenant_id) do
            handle_event(conn, state, event_type, data)
          else
            stream_loop(conn, state)
          end

        :close ->
          Logger.info("SSE connection closed by server", tenant_id: state.tenant_id)
          conn
      after
        timeout ->
          if timeout >= heartbeat_interval do
            # Send heartbeat
            case send_heartbeat(conn) do
              {:ok, conn} ->
                stream_loop(conn, state)

              {:error, reason} ->
                Logger.info("SSE connection closed on heartbeat",
                  reason: reason,
                  tenant_id: state.tenant_id
                )

                conn
            end
          else
            # Max duration reached via timeout
            Logger.info("SSE connection max duration reached via timeout",
              tenant_id: state.tenant_id
            )

            send_event(conn, "disconnected", %{reason: "max_duration_exceeded"})
            conn
          end
      end
    end
  end

  # Handle incoming event
  @spec handle_event(Plug.Conn.t(), connection_state(), String.t(), map()) :: Plug.Conn.t()
  defp handle_event(conn, state, event_type, data) do
    case send_event(conn, event_type, data) do
      {:ok, conn} ->
        new_state = %{state | event_count: state.event_count + 1}
        stream_loop(conn, new_state)

      {:error, reason} ->
        Logger.info("SSE connection closed",
          reason: reason,
          tenant_id: state.tenant_id,
          events_sent: state.event_count
        )

        conn
    end
  end

  # Send an SSE event
  @spec send_event(Plug.Conn.t(), String.t(), map()) :: {:ok, Plug.Conn.t()} | {:error, term()}
  defp send_event(conn, event_type, data) do
    event_id = generate_event_id()
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()

    payload = Map.merge(data, %{event_id: event_id, timestamp: timestamp})

    case Jason.encode(payload) do
      {:ok, encoded} ->
        sse_message = "id: #{event_id}\nevent: #{event_type}\ndata: #{encoded}\n\n"
        chunk(conn, sse_message)

      {:error, _} ->
        # Skip malformed events
        {:ok, conn}
    end
  end

  # Send a heartbeat comment
  @spec send_heartbeat(Plug.Conn.t()) :: {:ok, Plug.Conn.t()} | {:error, term()}
  defp send_heartbeat(conn) do
    timestamp = DateTime.utc_now() |> DateTime.to_iso8601()
    chunk(conn, ": heartbeat #{timestamp}\n\n")
  end

  # Generate unique event ID for reconnection support
  @spec generate_event_id() :: String.t()
  defp generate_event_id do
    :crypto.strong_rand_bytes(8) |> Base.hex_encode32(case: :lower)
  end

  # Connection limit management using ETS
  # The ETS table is owned by SSESupervisor for stability across request processes.
  # In production, consider using Redis for distributed deployments.


  @spec check_connection_limit(String.t() | nil) :: :ok | {:error, :limit_exceeded}
  defp check_connection_limit(nil), do: :ok

  defp check_connection_limit(tenant_id) do
    ensure_table_exists()
    max = Config.sse_max_connections_per_tenant()
    current = get_connection_count(tenant_id)

    if current < max do
      :ok
    else
      {:error, :limit_exceeded}
    end
  end

  @spec register_connection(String.t() | nil) :: :ok
  defp register_connection(nil), do: :ok

  defp register_connection(tenant_id) do
    ensure_table_exists()
    :ets.update_counter(@connection_table, tenant_id, {2, 1}, {tenant_id, 0})
    :ok
  end

  @spec unregister_connection(String.t() | nil) :: :ok
  defp unregister_connection(nil), do: :ok

  defp unregister_connection(tenant_id) do
    ensure_table_exists()

    case :ets.update_counter(@connection_table, tenant_id, {2, -1, 0, 0}, {tenant_id, 0}) do
      0 -> :ets.delete(@connection_table, tenant_id)
      _ -> :ok
    end

    :ok
  rescue
    ArgumentError ->
      Logger.debug("ETS update_counter failed during unregister")
      :ok
  end

  @spec get_connection_count(String.t()) :: non_neg_integer()
  defp get_connection_count(tenant_id) do
    case :ets.lookup(@connection_table, tenant_id) do
      [{^tenant_id, count}] -> count
      [] -> 0
    end
  rescue
    ArgumentError ->
      Logger.debug("ETS lookup failed during get_connection_count")
      0
  end

  @spec ensure_table_exists() :: :ok
  defp ensure_table_exists do
    case :ets.whereis(@connection_table) do
      :undefined ->
        :ets.new(@connection_table, [:named_table, :public, :set, {:write_concurrency, true}])

      _ ->
        :ok
    end
  rescue
    ArgumentError ->
      Logger.debug("ETS table creation race condition handled")
      :ok
  end

  # Tenant filtering - prevent cross-tenant event leakage (fail-closed)
  # Events are matched if:
  # 1. Event tenant_id is "__global__" - explicitly broadcast to all
  # 2. Event tenant_id matches connection tenant_id exactly
  # 
  # SECURITY: In production, events without tenant_id are dropped (fail-closed)
  # to prevent accidental cross-tenant leakage. Use "__global__" for broadcasts.
  @spec event_matches_tenant?(map(), String.t() | nil) :: boolean()
  defp event_matches_tenant?(data, conn_tenant_id) do
    event_tenant = Map.get(data, :tenant_id) || Map.get(data, "tenant_id")
    env = Application.get_env(:cybernetic, :environment, :prod)

    case {event_tenant, conn_tenant_id, env} do
      # Explicit global broadcast - always allowed
      {"__global__", _, _} -> true
      
      # Event tenant matches connection tenant - allowed
      {tenant, tenant, _} when is_binary(tenant) -> true
      
      # In dev/test: missing tenant_id on event OR connection = broadcast
      {nil, _, env} when env in [:dev, :test] -> true
      {_, nil, env} when env in [:dev, :test] -> true
      
      # In production: fail-closed - drop events without explicit tenant match
      _ -> false
    end
  end
  # Configuration helpers

  @spec trust_proxy?() :: boolean()
  defp trust_proxy? do
    Application.get_env(:cybernetic, :trust_proxy, false)
  end

  # Telemetry

  @spec emit_telemetry(atom(), map(), map()) :: :ok
  defp emit_telemetry(event, measurements, metadata) do
    :telemetry.execute(@telemetry_prefix ++ [event], measurements, metadata)
  end
end
