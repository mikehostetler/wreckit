defmodule Cybernetic.Edge.Gateway.TelegramController do
  @moduledoc """
  Telegram webhook controller for bot integration.

  Handles incoming Telegram updates including:
  - Messages (text, media, commands)
  - Callback queries (inline button presses)
  - Inline queries (inline bot mentions)

  ## Security

  All webhooks are verified using the X-Telegram-Bot-Api-Secret-Token header.
  Rate limiting is applied per chat ID.

  ## Configuration

      config :cybernetic, :telegram,
        bot_token: "BOT_TOKEN",
        webhook_secret: "SECRET_TOKEN",
        rate_limit_per_minute: 60
  """
  use Phoenix.Controller
  require Logger

  alias Cybernetic.VSM.System3.RateLimiter

  @pubsub Cybernetic.PubSub

  @type update :: map()
  @type chat_id :: integer()

  @doc """
  Handle incoming Telegram webhook.

  Verifies the webhook secret, applies rate limiting, and dispatches
  the update to the appropriate handler.
  """
  @spec webhook(Plug.Conn.t(), map()) :: Plug.Conn.t()
  def webhook(conn, params) do
    with :ok <- verify_webhook_secret(conn),
         {:ok, update} <- parse_update(params),
         :ok <- check_rate_limit(update) do
      process_update(conn, update)
    else
      {:error, :invalid_secret} ->
        Logger.warning("Invalid Telegram webhook secret")
        conn |> put_status(:unauthorized) |> json(%{error: "invalid_secret"})

      {:error, :rate_limited} ->
        Logger.info("Telegram webhook rate limited")
        conn |> put_status(:too_many_requests) |> json(%{error: "rate_limited"})

      {:error, :invalid_update} ->
        Logger.warning("Invalid Telegram update format")
        conn |> put_status(:bad_request) |> json(%{error: "invalid_update"})
    end
  end

  # Verify the X-Telegram-Bot-Api-Secret-Token header
  @spec verify_webhook_secret(Plug.Conn.t()) :: :ok | {:error, :invalid_secret}
  defp verify_webhook_secret(conn) do
    env = Application.get_env(:cybernetic, :environment, :prod)
    expected_secret = get_webhook_secret()

    cond do
      env in [:dev, :test] and (is_nil(expected_secret) or expected_secret == "") ->
        :ok

      is_binary(expected_secret) and expected_secret != "" ->
        case Plug.Conn.get_req_header(conn, "x-telegram-bot-api-secret-token") do
          [^expected_secret] -> :ok
          _ -> {:error, :invalid_secret}
        end

      true ->
        {:error, :invalid_secret}
    end
  end

  # Parse and validate the update payload
  @spec parse_update(map()) :: {:ok, update()} | {:error, :invalid_update}
  defp parse_update(%{"update_id" => _} = update), do: {:ok, update}
  defp parse_update(_), do: {:error, :invalid_update}

  # Check rate limit per chat using S3 RateLimiter
  @spec check_rate_limit(update()) :: :ok | {:error, :rate_limited}
  defp check_rate_limit(update) do
    case extract_chat_id(update) do
      nil ->
        :ok

      chat_id ->
        # Use api_gateway budget with chat_id as resource type
        case RateLimiter.request_tokens(:api_gateway, "telegram:#{chat_id}", :normal) do
          :ok -> :ok
          {:error, :rate_limited} -> {:error, :rate_limited}
        end
    end
  rescue
    # If RateLimiter is not running, allow request
    ArgumentError -> :ok
    ErlangError -> :ok
  end

  # Process the validated update
  @spec process_update(Plug.Conn.t(), update()) :: Plug.Conn.t()
  defp process_update(conn, update) do
    update_id = update["update_id"]

    Logger.info("Processing Telegram update",
      update_id: update_id,
      type: get_update_type(update)
    )

    # Dispatch to appropriate handler
    result = dispatch_update(update)

    # Publish event to PubSub
    publish_event(update, result)

    conn
    |> put_status(:ok)
    |> json(%{ok: true})
  end

  # Dispatch update to the appropriate handler
  @spec dispatch_update(update()) :: {:ok, term()} | {:error, term()}
  defp dispatch_update(%{"message" => message} = _update) do
    handle_message(message)
  end

  defp dispatch_update(%{"callback_query" => callback_query} = _update) do
    handle_callback_query(callback_query)
  end

  defp dispatch_update(%{"inline_query" => inline_query} = _update) do
    handle_inline_query(inline_query)
  end

  defp dispatch_update(%{"edited_message" => message} = _update) do
    handle_edited_message(message)
  end

  defp dispatch_update(update) do
    Logger.debug("Unhandled update type", update: update)
    {:ok, :ignored}
  end

  # Handle incoming messages
  @spec handle_message(map()) :: {:ok, term()} | {:error, term()}
  defp handle_message(%{"text" => "/" <> _ = text} = message) do
    # Parse command
    {command, args} = parse_command(text)
    chat_id = get_in(message, ["chat", "id"])
    user_id = get_in(message, ["from", "id"])

    Logger.info("Telegram command received",
      command: command,
      chat_id: chat_id,
      user_id: user_id
    )

    # Enqueue command processing job
    job =
      %{
        type: "telegram_command",
        command: command,
        args: args,
        chat_id: chat_id,
        user_id: user_id,
        message: message
      }
      |> Cybernetic.Workers.TelegramDispatcher.new()

    case Oban.insert(job) do
      {:ok, _job} -> {:ok, :command_enqueued}
      {:error, changeset} ->
        Logger.error("Failed to enqueue Telegram command job", error: inspect(changeset))
        {:error, :enqueue_failed}
    end
  end

  defp handle_message(message) do
    chat_id = get_in(message, ["chat", "id"])
    user_id = get_in(message, ["from", "id"])

    Logger.debug("Telegram message received",
      chat_id: chat_id,
      user_id: user_id
    )

    {:ok, :message_received}
  end

  # Handle callback queries (inline button presses)
  @spec handle_callback_query(map()) :: {:ok, term()} | {:error, term()}
  defp handle_callback_query(callback_query) do
    callback_id = callback_query["id"]
    data = callback_query["data"]
    user_id = get_in(callback_query, ["from", "id"])

    Logger.info("Telegram callback query",
      callback_id: callback_id,
      data: data,
      user_id: user_id
    )

    job =
      %{
        type: "telegram_callback",
        callback_id: callback_id,
        data: data,
        user_id: user_id,
        callback_query: callback_query
      }
      |> Cybernetic.Workers.TelegramDispatcher.new()

    case Oban.insert(job) do
      {:ok, _job} -> {:ok, :callback_enqueued}
      {:error, changeset} ->
        Logger.error("Failed to enqueue Telegram callback job", error: inspect(changeset))
        {:error, :enqueue_failed}
    end
  end

  # Handle inline queries
  @spec handle_inline_query(map()) :: {:ok, term()} | {:error, term()}
  defp handle_inline_query(inline_query) do
    query_id = inline_query["id"]
    query = inline_query["query"]
    user_id = get_in(inline_query, ["from", "id"])

    Logger.info("Telegram inline query",
      query_id: query_id,
      query: query,
      user_id: user_id
    )

    {:ok, :inline_query_received}
  end

  # Handle edited messages
  @spec handle_edited_message(map()) :: {:ok, term()} | {:error, term()}
  defp handle_edited_message(message) do
    chat_id = get_in(message, ["chat", "id"])
    message_id = message["message_id"]

    Logger.debug("Telegram message edited",
      chat_id: chat_id,
      message_id: message_id
    )

    {:ok, :edit_received}
  end

  # Parse command and arguments from text
  @spec parse_command(String.t()) :: {String.t(), [String.t()]}
  defp parse_command(text) do
    [command | args] = String.split(text, ~r/\s+/, trim: true)

    # Remove bot mention if present (/command@bot_name -> /command)
    command =
      command
      |> String.downcase()
      |> String.split("@")
      |> List.first()
      |> String.trim_leading("/")

    {command, args}
  end

  # Extract chat ID from update
  @spec extract_chat_id(update()) :: chat_id() | nil
  defp extract_chat_id(update) do
    cond do
      update["message"] -> get_in(update, ["message", "chat", "id"])
      update["callback_query"] -> get_in(update, ["callback_query", "message", "chat", "id"])
      update["edited_message"] -> get_in(update, ["edited_message", "chat", "id"])
      true -> nil
    end
  end

  # Get update type for logging
  @spec get_update_type(update()) :: String.t()
  defp get_update_type(update) do
    cond do
      update["message"] -> "message"
      update["callback_query"] -> "callback_query"
      update["inline_query"] -> "inline_query"
      update["edited_message"] -> "edited_message"
      update["channel_post"] -> "channel_post"
      true -> "unknown"
    end
  end

  # Publish event to PubSub
  # SECURITY: Always include tenant_id to prevent cross-tenant leakage via SSE
  @spec publish_event(update(), {:ok, term()} | {:error, term()}) :: :ok
  defp publish_event(update, result) do
    event_type = get_update_type(update)
    chat_id = extract_chat_id(update)

    Phoenix.PubSub.broadcast(@pubsub, "events:telegram", {
      :event,
      "telegram.#{event_type}",
      %{
        # Use chat_id as tenant to scope Telegram events
        # This prevents events from leaking to other tenants via SSE
        tenant_id: tenant_for_chat(chat_id),
        update_id: update["update_id"],
        type: event_type,
        result: elem(result, 0),
        timestamp: DateTime.utc_now()
      }
    })
  end

  # Map Telegram chat_id to a tenant_id for isolation
  @spec tenant_for_chat(chat_id() | nil) :: String.t()
  defp tenant_for_chat(nil), do: "__system_telegram__"
  defp tenant_for_chat(chat_id), do: "telegram-#{chat_id}"

  # Get webhook secret from config
  @spec get_webhook_secret() :: String.t() | nil
  defp get_webhook_secret do
    Cybernetic.Config.telegram_webhook_secret()
  end
end
