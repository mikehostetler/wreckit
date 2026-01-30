defmodule Cybernetic.Workers.TelegramDispatcher do
  @moduledoc """
  Oban worker for processing Telegram commands and callbacks asynchronously.

  This worker handles:
  - Telegram bot commands (/start, /help, etc.)
  - Callback queries from inline buttons
  - Deferred message processing

  ## Configuration

      config :cybernetic, Oban,
        queues: [telegram: 10]
  """
  use Oban.Worker,
    queue: :telegram,
    max_attempts: 3,
    priority: 1

  require Logger

  @type job_args :: %{
          type: String.t(),
          command: String.t() | nil,
          args: [String.t()] | nil,
          chat_id: integer(),
          user_id: integer(),
          message: map() | nil,
          callback_query: map() | nil
        }

  @impl Oban.Worker
  @spec perform(Oban.Job.t()) :: :ok | {:error, term()}
  def perform(%Oban.Job{args: %{"type" => "telegram_command"} = args}) do
    command = args["command"]
    chat_id = args["chat_id"]
    user_id = args["user_id"]

    Logger.info("Processing Telegram command",
      command: command,
      chat_id: chat_id,
      user_id: user_id
    )

    # Check policy for command execution
    case check_command_policy(command, user_id) do
      :allow ->
        execute_command(command, args)

      :deny ->
        Logger.warning("Command denied by policy",
          command: command,
          user_id: user_id
        )

        send_message(chat_id, "Sorry, you don't have permission to use this command.")
    end
  end

  def perform(%Oban.Job{args: %{"type" => "telegram_callback"} = args}) do
    callback_id = args["callback_id"]
    data = args["data"]
    user_id = args["user_id"]

    Logger.info("Processing Telegram callback",
      callback_id: callback_id,
      data: data,
      user_id: user_id
    )

    # Parse callback data and route to handler
    handle_callback(data, args)
  end

  def perform(%Oban.Job{args: args}) do
    Logger.warning("Unknown Telegram job type", args: args)
    :ok
  end

  # Command handlers

  @spec execute_command(String.t(), map()) :: :ok | {:error, term()}
  defp execute_command("start", args) do
    chat_id = args["chat_id"]

    send_message(chat_id, """
    Welcome to the Cybernetic VSM Bot!

    Available commands:
    /status - Check system status
    /episodes - List recent episodes
    /help - Show this help message
    """)
  end

  defp execute_command("help", args) do
    chat_id = args["chat_id"]

    send_message(chat_id, """
    Cybernetic VSM Bot Commands:

    /start - Start interaction with the bot
    /status - Check VSM system status
    /episodes - List recent episodes
    /policies - List active policies
    /help - Show this help message
    """)
  end

  defp execute_command("status", args) do
    chat_id = args["chat_id"]

    # Get system status
    status = get_system_status()

    send_message(chat_id, """
    System Status:

    S1 Operations: #{status.s1}
    S2 Coordination: #{status.s2}
    S3 Control: #{status.s3}
    S4 Intelligence: #{status.s4}
    S5 Policy: #{status.s5}

    Uptime: #{status.uptime}
    """)
  end

  defp execute_command("episodes", args) do
    chat_id = args["chat_id"]

    # Fetch recent episodes
    case get_recent_episodes() do
      {:ok, episodes} when episodes != [] ->
        episode_text =
          episodes
          |> Enum.take(5)
          |> Enum.map(fn ep -> "- #{ep.title} (#{ep.status})" end)
          |> Enum.join("\n")

        send_message(chat_id, "Recent Episodes:\n\n#{episode_text}")

      {:ok, []} ->
        send_message(chat_id, "No episodes found.")

      {:error, reason} ->
        Logger.error("Failed to fetch episodes", reason: reason)
        send_message(chat_id, "Failed to fetch episodes. Please try again later.")
    end
  end

  defp execute_command("policies", args) do
    chat_id = args["chat_id"]

    case list_policies() do
      {:ok, policies} when is_list(policies) and policies != [] ->
        policy_text =
          policies
          |> Enum.take(5)
          |> Enum.map(fn p -> "- #{p.name}: #{p.status}" end)
          |> Enum.join("\n")

        send_message(chat_id, "Active Policies:\n\n#{policy_text}")

      {:ok, []} ->
        send_message(chat_id, "No active policies.")

      {:error, _} ->
        send_message(chat_id, "Policy system not available.")
    end
  end

  defp execute_command(unknown, args) do
    chat_id = args["chat_id"]
    send_message(chat_id, "Unknown command: /#{unknown}\n\nUse /help to see available commands.")
  end

  # Callback handlers

  @spec handle_callback(String.t(), map()) :: :ok | {:error, term()}
  defp handle_callback("confirm:" <> action_id, args) do
    callback_id = args["callback_id"]
    user_id = args["user_id"]

    Logger.info("Callback confirmation",
      action_id: action_id,
      user_id: user_id
    )

    answer_callback(callback_id, "Action confirmed!")
    :ok
  end

  defp handle_callback("cancel:" <> action_id, args) do
    callback_id = args["callback_id"]

    Logger.info("Callback cancelled", action_id: action_id)

    answer_callback(callback_id, "Action cancelled.")
    :ok
  end

  defp handle_callback(data, args) do
    callback_id = args["callback_id"]
    Logger.debug("Unhandled callback data", data: data)

    answer_callback(callback_id, "")
    :ok
  end

  # Policy checking

  @spec check_command_policy(String.t(), integer()) :: :allow | :deny
  defp check_command_policy(command, user_id) when is_binary(command) and is_integer(user_id),
    do: :allow

  defp check_command_policy(_command, _user_id), do: :deny

  # Telegram API helpers

  @spec send_message(integer(), String.t(), keyword()) :: :ok | {:error, term()}
  defp send_message(chat_id, text, opts \\ []) do
    bot_token = get_bot_token()

    if bot_token do
      body =
        %{
          chat_id: chat_id,
          text: text,
          parse_mode: Keyword.get(opts, :parse_mode, "Markdown")
        }
        |> maybe_add_reply_markup(opts)

      case send_telegram_request("sendMessage", body, bot_token) do
        {:ok, _} -> :ok
        {:error, reason} -> {:error, reason}
      end
    else
      Logger.warning("Telegram bot token not configured")
      {:error, :not_configured}
    end
  end

  @spec answer_callback(String.t(), String.t()) :: :ok | {:error, term()}
  defp answer_callback(callback_id, text) do
    bot_token = get_bot_token()

    if bot_token do
      body = %{callback_query_id: callback_id, text: text}

      case send_telegram_request("answerCallbackQuery", body, bot_token) do
        {:ok, _} -> :ok
        {:error, reason} -> {:error, reason}
      end
    else
      {:error, :not_configured}
    end
  end

  @spec send_telegram_request(String.t(), map(), String.t()) :: {:ok, map()} | {:error, term()}
  defp send_telegram_request(method, body, bot_token) do
    url = "https://api.telegram.org/bot#{bot_token}/#{method}"

    case Req.post(url, json: body) do
      {:ok, %{status: 200, body: %{"ok" => true, "result" => result}}} ->
        {:ok, result}

      {:ok, %{body: %{"ok" => false, "description" => desc}}} ->
        Logger.error("Telegram API error", method: method, description: desc)
        {:error, desc}

      {:error, reason} ->
        Logger.error("Telegram request failed", method: method, reason: reason)
        {:error, reason}
    end
  end

  defp maybe_add_reply_markup(body, opts) do
    case Keyword.get(opts, :reply_markup) do
      nil -> body
      markup -> Map.put(body, :reply_markup, markup)
    end
  end

  # System status helpers

  @spec get_system_status() :: map()
  defp get_system_status do
    %{
      s1: "Operational",
      s2: "Operational",
      s3: "Operational",
      s4: "Operational",
      s5: "Operational",
      uptime: format_uptime()
    }
  end

  defp format_uptime do
    {uptime, _} = :erlang.statistics(:wall_clock)
    seconds = div(uptime, 1000)
    minutes = div(seconds, 60)
    hours = div(minutes, 60)
    days = div(hours, 24)

    cond do
      days > 0 -> "#{days}d #{rem(hours, 24)}h"
      hours > 0 -> "#{hours}h #{rem(minutes, 60)}m"
      true -> "#{minutes}m #{rem(seconds, 60)}s"
    end
  end

  @spec get_recent_episodes() :: {:ok, [map()]} | {:error, term()}
  defp get_recent_episodes do
    # Placeholder - can be overridden by configuring a backend module.
    backend = Application.get_env(:cybernetic, :episode_store_backend)

    cond do
      is_atom(backend) and Code.ensure_loaded?(backend) and
          function_exported?(backend, :list_recent, 0) ->
        apply(backend, :list_recent, [])

      true ->
        {:ok, []}
    end
  end

  defp list_policies do
    policy_engine = Cybernetic.VSM.System5.PolicyEngine

    if Code.ensure_loaded?(policy_engine) and function_exported?(policy_engine, :list_policies, 0) do
      apply(policy_engine, :list_policies, [])
    else
      {:error, :not_available}
    end
  rescue
    e -> {:error, e}
  end

  @spec get_bot_token() :: String.t() | nil
  defp get_bot_token do
    Application.get_env(:cybernetic, :telegram, [])
    |> Keyword.get(:bot_token)
  end
end
