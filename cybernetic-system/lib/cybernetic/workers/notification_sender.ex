defmodule Cybernetic.Workers.NotificationSender do
  @moduledoc """
  Oban worker for sending notifications across multiple channels.

  Supports:
  - Email notifications
  - Slack webhooks
  - Telegram messages
  - Custom webhooks

  ## Configuration

      config :cybernetic, Oban,
        queues: [notifications: 5]

      config :cybernetic, :notifications,
        email: [
          from: "noreply@example.com",
          adapter: Swoosh.Adapters.Sendgrid,
          api_key: {:system, "SENDGRID_API_KEY"}
        ],
        slack: [
          webhook_url: {:system, "SLACK_WEBHOOK_URL"}
        ],
        telegram: [
          bot_token: {:system, "TELEGRAM_BOT_TOKEN"}
        ]

  ## Job Arguments

      %{
        tenant_id: "tenant-1",
        channel: "email" | "slack" | "telegram" | "webhook",
        message: "Notification message",
        recipient: "user@example.com" | "channel-id",
        metadata: %{}
      }
  """
  use Oban.Worker,
    queue: :notifications,
    max_attempts: 5,
    priority: 2

  require Logger

  @telemetry [:cybernetic, :worker, :notification_sender]

  @type channel :: :email | :slack | :telegram | :webhook
  @type notification_result :: :ok | {:error, term()}

  @impl Oban.Worker
  @spec perform(Oban.Job.t()) :: :ok | {:error, term()} | {:snooze, pos_integer()}
  def perform(%Oban.Job{args: args, attempt: attempt}) do
    tenant_id = args["tenant_id"]
    channel = String.to_existing_atom(args["channel"])
    message = args["message"]
    recipient = args["recipient"]
    metadata = args["metadata"] || %{}

    Logger.info("Sending notification",
      tenant_id: tenant_id,
      channel: channel,
      recipient: sanitize_recipient(recipient),
      attempt: attempt
    )

    start_time = System.monotonic_time(:millisecond)

    result =
      case send_notification(channel, message, recipient, metadata) do
        :ok ->
          emit_telemetry(:success, start_time, channel)
          log_notification(tenant_id, channel, recipient, :success)
          :ok

        {:error, :rate_limited} ->
          Logger.info("Notification rate limited, snoozing")
          emit_telemetry(:rate_limited, start_time, channel)
          {:snooze, calculate_backoff(attempt)}

        {:error, :invalid_recipient} ->
          Logger.warning("Invalid recipient", recipient: sanitize_recipient(recipient))
          emit_telemetry(:invalid_recipient, start_time, channel)
          {:error, :invalid_recipient}

        {:error, reason} ->
          Logger.error("Notification failed",
            channel: channel,
            reason: reason
          )

          emit_telemetry(:error, start_time, channel)
          {:error, reason}
      end

    result
  rescue
    e ->
      Logger.error("Notification exception", error: inspect(e))
      emit_telemetry(:exception, System.monotonic_time(:millisecond), :unknown)
      {:error, :exception}
  end

  # Channel-specific send functions

  @spec send_notification(channel(), String.t(), String.t() | nil, map()) ::
          notification_result()
  defp send_notification(:email, message, recipient, metadata) do
    send_email(recipient, metadata["subject"] || "Notification", message, metadata)
  end

  defp send_notification(:slack, message, recipient, metadata) do
    send_slack(recipient, message, metadata)
  end

  defp send_notification(:telegram, message, recipient, metadata) do
    send_telegram(recipient, message, metadata)
  end

  defp send_notification(:webhook, message, recipient, metadata) do
    send_webhook(recipient, message, metadata)
  end

  defp send_notification(channel, _message, _recipient, _metadata) do
    Logger.warning("Unknown notification channel", channel: channel)
    {:error, :unknown_channel}
  end

  # Email sending

  @spec send_email(String.t(), String.t(), String.t(), map()) :: notification_result()
  defp send_email(recipient, subject, body, _metadata) do
    if valid_email?(recipient) do
      config = get_email_config()

      # Build email using Swoosh-like interface
      email_data = %{
        to: recipient,
        from: config[:from] || "noreply@cybernetic.local",
        subject: subject,
        text_body: body
      }

      case send_email_request(email_data, config) do
        {:ok, _} -> :ok
        {:error, reason} -> {:error, reason}
      end
    else
      {:error, :invalid_recipient}
    end
  end

  defp send_email_request(email_data, config) do
    # Placeholder for actual email sending
    # In production, use Swoosh or similar
    if config[:adapter] do
      Logger.debug("Would send email", to: email_data.to, subject: email_data.subject)
      {:ok, :sent}
    else
      Logger.warning("Email adapter not configured")
      {:error, :not_configured}
    end
  end

  defp get_email_config do
    Application.get_env(:cybernetic, :notifications, [])
    |> Keyword.get(:email, [])
  end

  defp valid_email?(email) when is_binary(email) do
    String.match?(email, ~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  end

  defp valid_email?(_), do: false

  # Slack sending

  @spec send_slack(String.t() | nil, String.t(), map()) :: notification_result()
  defp send_slack(channel, message, metadata) do
    config = get_slack_config()
    webhook_url = resolve_config_value(config[:webhook_url])

    if webhook_url do
      payload = %{
        text: message,
        channel: channel,
        username: metadata["username"] || "Cybernetic Bot",
        icon_emoji: metadata["icon"] || ":robot_face:"
      }

      case Req.post(webhook_url, json: payload) do
        {:ok, %{status: 200}} ->
          :ok

        {:ok, %{status: 429}} ->
          {:error, :rate_limited}

        {:ok, %{status: status, body: body}} ->
          {:error, {:http_error, status, body}}

        {:error, reason} ->
          {:error, reason}
      end
    else
      {:error, :not_configured}
    end
  end

  defp get_slack_config do
    Application.get_env(:cybernetic, :notifications, [])
    |> Keyword.get(:slack, [])
  end

  # Telegram sending

  @spec send_telegram(String.t() | integer(), String.t(), map()) :: notification_result()
  defp send_telegram(chat_id, message, metadata) do
    config = get_telegram_config()
    bot_token = resolve_config_value(config[:bot_token])

    if bot_token do
      url = "https://api.telegram.org/bot#{bot_token}/sendMessage"

      payload = %{
        chat_id: chat_id,
        text: message,
        parse_mode: metadata["parse_mode"] || "Markdown",
        disable_notification: metadata["silent"] || false
      }

      case Req.post(url, json: payload) do
        {:ok, %{status: 200, body: %{"ok" => true}}} ->
          :ok

        {:ok, %{status: 429}} ->
          {:error, :rate_limited}

        {:ok, %{body: %{"ok" => false, "description" => desc}}} ->
          {:error, {:telegram_error, desc}}

        {:error, reason} ->
          {:error, reason}
      end
    else
      {:error, :not_configured}
    end
  end

  defp get_telegram_config do
    Application.get_env(:cybernetic, :notifications, [])
    |> Keyword.get(:telegram, [])
  end

  # Generic webhook sending

  @spec send_webhook(String.t(), String.t(), map()) :: notification_result()
  defp send_webhook(url, message, metadata) do
    if valid_url?(url) do
      payload =
        %{
          message: message,
          timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        }
        |> Map.merge(metadata)

      headers = build_webhook_headers(metadata)

      case Req.post(url, json: payload, headers: headers) do
        {:ok, %{status: status}} when status in 200..299 ->
          :ok

        {:ok, %{status: 429}} ->
          {:error, :rate_limited}

        {:ok, %{status: status, body: body}} ->
          {:error, {:http_error, status, body}}

        {:error, reason} ->
          {:error, reason}
      end
    else
      {:error, :invalid_recipient}
    end
  end

  defp build_webhook_headers(metadata) do
    base_headers = [{"content-type", "application/json"}]

    # Add signature if secret is provided
    case metadata["webhook_secret"] do
      nil ->
        base_headers

      secret ->
        # HMAC signature for webhook verification
        timestamp = System.system_time(:second) |> to_string()
        signature = compute_webhook_signature(secret, timestamp)

        [
          {"x-webhook-timestamp", timestamp},
          {"x-webhook-signature", signature}
          | base_headers
        ]
    end
  end

  defp compute_webhook_signature(secret, timestamp) do
    :crypto.mac(:hmac, :sha256, secret, timestamp)
    |> Base.encode16(case: :lower)
  end

  defp valid_url?(url) when is_binary(url) do
    case URI.parse(url) do
      %URI{scheme: scheme, host: host} when scheme in ["http", "https"] and not is_nil(host) ->
        true

      _ ->
        false
    end
  end

  defp valid_url?(_), do: false

  # Config helpers

  defp resolve_config_value({:system, env_var}), do: System.get_env(env_var)
  defp resolve_config_value(value), do: value

  # Backoff calculation

  defp calculate_backoff(attempt) do
    # Exponential backoff: 30s, 60s, 120s, 240s, 480s
    min((30 * :math.pow(2, attempt - 1)) |> round(), 480)
  end

  # Logging

  defp log_notification(tenant_id, channel, recipient, status) do
    # Store notification log for audit
    Logger.info("Notification logged",
      tenant_id: tenant_id,
      channel: channel,
      recipient: sanitize_recipient(recipient),
      status: status
    )
  end

  defp sanitize_recipient(nil), do: "nil"

  defp sanitize_recipient(recipient) when is_binary(recipient) do
    if valid_email?(recipient) do
      # Mask email for privacy
      [local, domain] = String.split(recipient, "@", parts: 2)
      masked_local = String.slice(local, 0, 2) <> "***"
      "#{masked_local}@#{domain}"
    else
      # Truncate for logging
      String.slice(recipient, 0, 20) <> "..."
    end
  end

  defp sanitize_recipient(recipient), do: inspect(recipient)

  # Telemetry

  defp emit_telemetry(status, start_time, channel) do
    duration = System.monotonic_time(:millisecond) - start_time

    :telemetry.execute(
      @telemetry,
      %{duration: duration, count: 1},
      %{status: status, channel: channel}
    )
  end
end
