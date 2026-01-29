defmodule Cybernetic.VSM.System4.Providers.ReqLLMProvider do
  @moduledoc """
  Unified LLM provider using req_llm pipeline.
  """

  @behaviour Cybernetic.VSM.System4.LLMProvider

  alias Cybernetic.VSM.System4.LLM.Pipeline
  require Logger

  @impl true
  def capabilities do
    %{
      modes: [:chat, :completion, :reasoning, :tool_use, :json],
      strengths: [:unified, :extensible, :reliable],
      max_tokens: 128_000,
      context_window: 1_000_000
    }
  end

  @impl true
  def analyze_episode(episode, opts \\ []) do
    policy = extract_policy(opts)

    # Direct bypass for Anthropic/Z.AI to fix 401 error
    if policy[:force_provider] == :anthropic or opts[:provider] == :anthropic do
      # Extract messages from episode context if available or build from prompt
      messages = episode.context[:messages] || [%{role: "user", content: episode.data}]

      # Inject system prompt
      messages =
        if episode.context[:system_prompt] do
          [%{role: "system", content: episode.context[:system_prompt]} | messages]
        else
          messages
        end

      direct_anthropic_call(messages, opts)
    else
      # Standard Pipeline
      ctx = %{
        op: :analyze,
        episode: episode,
        stream?: opts[:stream?] || false,
        policy: policy,
        params: extract_params(opts),
        meta: %{
          request_id: opts[:request_id],
          caller: opts[:caller] || self()
        }
      }

      run_pipeline(ctx)
    end
  end

  @impl true
  def generate(prompt, opts \\ []) do
    policy = extract_policy(opts)

    # Direct bypass for Anthropic/Z.AI
    if policy[:force_provider] == :anthropic or opts[:provider] == :anthropic do
      messages = [%{role: "user", content: prompt}]
      direct_anthropic_call(messages, opts)
    else
      ctx = build_generate_context(prompt, opts)
      run_pipeline(ctx)
    end
  end

  defp run_pipeline(ctx) do
    case Pipeline.run(ctx) do
      {:ok, result} ->
        # Result format depends on op, but for now we unify
        format_generate_response(result)

      {:error, reason} ->
        Logger.error("ReqLLMProvider pipeline failed: #{inspect(reason)}")
        {:error, reason}

      stream when is_struct(stream, Stream) or is_function(stream, 2) ->
        stream
    end
  end

  # ===========================================================================
  # Direct Z.AI/Anthropic Implementation (Bypassing ReqLLM/ReqAnthropic)
  # ===========================================================================

  @impl true
  def chat(messages, opts \\ []) do
    generate(messages, opts)
  end

  @impl true
  def embed(_text, _opts \\ []) do
    {:error, :not_implemented}
  end

  @impl true
  def health_check do
    # Health check uses direct call too
    generate("ping", provider: :anthropic, max_tokens: 1)
  end

  # ===========================================================================
  # Private Helpers
  # ===========================================================================

  defp build_generate_context(prompt, opts) when is_binary(prompt) do
    %{
      op: :generate,
      messages: [%{role: "user", content: prompt}],
      stream?: opts[:stream?] || false,
      policy: extract_policy(opts),
      params: extract_params(opts),
      meta: %{request_id: opts[:request_id], caller: opts[:caller] || self()}
    }
  end

  defp build_generate_context(messages, opts) when is_list(messages) do
    %{
      op: :generate,
      messages: messages,
      stream?: opts[:stream?] || false,
      policy: extract_policy(opts),
      params: extract_params(opts),
      meta: %{request_id: opts[:request_id], caller: opts[:caller] || self()}
    }
  end

  defp extract_policy(opts) do
    provider = opts[:provider]
    model = opts[:model]

    %{}
    |> maybe_add_policy(:force_provider, provider)
    |> maybe_add_policy(:force_model, model)
    |> maybe_add_policy(:budget, opts[:budget])
    |> maybe_add_policy(:timeout_ms, opts[:timeout])
  end

  defp maybe_add_policy(policy, _key, nil), do: policy
  defp maybe_add_policy(policy, key, value), do: Map.put(policy, key, value)

  defp extract_params(opts) do
    req_opts = []

    extra = opts[:extra] || []
    extra = if req_opts != [], do: Keyword.put(extra, :req_options, req_opts), else: extra

    %{}
    |> maybe_add_param(:temperature, opts[:temperature])
    |> maybe_add_param(:max_tokens, opts[:max_tokens])
    |> maybe_add_param(:extra, extra)
  end

  defp maybe_add_param(params, _key, nil), do: params
  defp maybe_add_param(params, key, value), do: Map.put(params, key, value)

  defp format_analyze_response(result), do: format_generate_response(result)

  defp format_generate_response(result) do
    {:ok,
     %{
       text: result[:text] || "",
       tokens: result[:tokens] || %{input: 0, output: 0},
       usage: result[:usage] || %{},
       finish_reason: result[:finish_reason] || :stop
     }}
  end

  defp format_chat_response(result), do: format_generate_response(result)

  defp direct_anthropic_call(messages, opts) do
    config = resolve_anthropic_config(opts)
    headers = build_anthropic_headers(config.api_key)
    {system_content, clean_messages} = prepare_messages(messages)
    payload = build_anthropic_payload(config.model, system_content, clean_messages, opts)

    Logger.debug("ReqLLMProvider: Direct Z.AI call to #{config.base_url} with model #{config.model}")

    http_request(config.base_url, headers, payload, config.model)
  end

  defp resolve_anthropic_config(opts) do
    %{
      api_key: System.get_env("ANTHROPIC_API_KEY"),
      base_url: System.get_env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com",
      model: opts[:model] || System.get_env("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20241022"
    }
  end

  defp build_anthropic_headers(api_key) do
    [
      {"x-api-key", api_key},
      {"anthropic-version", "2023-06-01"},
      {"content-type", "application/json"}
    ]
  end

  defp prepare_messages(messages) do
    {system_msg, other_messages} = Enum.split_with(messages, fn m -> m[:role] == "system" end)

    system_content =
      case system_msg do
        [%{content: content} | _] -> content
        _ -> nil
      end

    clean_messages =
      Enum.map(other_messages, fn m ->
        %{role: m[:role], content: m[:content]}
      end)

    {system_content, clean_messages}
  end

  defp build_anthropic_payload(model, system_content, messages, opts) do
    base = %{
      model: model,
      messages: messages,
      max_tokens: opts[:max_tokens] || 4096,
      temperature: opts[:temperature] || 0.7,
      stream: false
    }

    if system_content, do: Map.put(base, :system, system_content), else: base
  end

  defp http_request(base_url, headers, payload, model) do
    url = "#{base_url}/v1/messages"

    case Req.post(url, headers: headers, json: payload, receive_timeout: 60_000) do
      {:ok, %{status: 200, body: body}} ->
        handle_success_response(body, model)

      {:ok, %{status: status, body: body}} ->
        log_and_return_error("Z.AI Error #{status}: #{inspect(body)}")

      {:error, reason} ->
        log_and_return_error("Z.AI Request Failed: #{inspect(reason)}")
    end
  end

  defp handle_success_response(body, model) do
    text =
      case body["content"] do
        [%{"text" => t} | _] -> t
        _ -> ""
      end

    usage = body["usage"] || %{}

    {:ok,
     %{
       text: text,
       usage: usage,
       finish_reason: body["stop_reason"],
       provider: :anthropic,
       model: model
     }}
  end

  defp log_and_return_error(message) do
    Logger.error(message)
    {:error, message}
  end
end