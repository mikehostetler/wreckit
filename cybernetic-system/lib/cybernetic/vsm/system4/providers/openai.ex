defmodule Cybernetic.VSM.System4.Providers.OpenAI do
  @moduledoc """
  OpenAI provider for S4 Intelligence system.

  Implements the LLM provider behavior for episode analysis using GPT models
  with specialized strengths in code generation and structured outputs.
  """

  @behaviour Cybernetic.VSM.System4.LLMProvider

  require Logger
  require OpenTelemetry.Tracer

  @default_model "gpt-4o"
  @default_base_url "https://api.openai.com"
  @default_chat_path "/v1/chat/completions"
  @default_embeddings_path "/v1/embeddings"
  @default_max_tokens 4096
  @default_temperature 0.1
  @telemetry [:cybernetic, :s4, :openai]

  @impl Cybernetic.VSM.System4.LLMProvider
  def capabilities do
    %{
      modes: [:chat, :tool_use, :json],
      strengths: [:code, :speed],
      max_tokens: 4096,
      context_window: 128_000
    }
  end

  @impl Cybernetic.VSM.System4.LLMProvider
  def analyze_episode(episode, opts \\ []) do
    start_time = System.monotonic_time(:millisecond)

    OpenTelemetry.Tracer.with_span "openai.analyze_episode", %{
      attributes: %{
        model: get_model(opts),
        episode_id: episode.id,
        episode_kind: episode.kind
      }
    } do
      result = do_analyze_episode(episode, opts)

      latency = System.monotonic_time(:millisecond) - start_time
      add_usage_metrics(result, latency)

      result
    end
  end

  @impl Cybernetic.VSM.System4.LLMProvider
  def generate(prompt_or_messages, opts \\ [])

  def generate(prompt, opts) when is_binary(prompt) do
    generate([%{"role" => "user", "content" => prompt}], opts)
  end

  def generate(messages, opts) when is_list(messages) do
    start_time = System.monotonic_time(:millisecond)

    case make_openai_request(build_generate_payload(messages, opts)) do
      {:ok, response} ->
        latency = System.monotonic_time(:millisecond) - start_time
        parse_generate_response(response, latency)

      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl Cybernetic.VSM.System4.LLMProvider
  def embed(text, opts \\ []) do
    start_time = System.monotonic_time(:millisecond)

    payload = %{
      "model" => Keyword.get(opts, :model, "text-embedding-3-small"),
      "input" => text
    }

    case make_openai_request(payload, get_embeddings_path()) do
      {:ok, response} ->
        latency = System.monotonic_time(:millisecond) - start_time
        parse_embed_response(response, latency)

      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl Cybernetic.VSM.System4.LLMProvider
  def health_check do
    case get_api_key() do
      nil ->
        {:error, :missing_api_key}

      _key ->
        # Simple ping test
        case make_openai_request(%{
               "model" => @default_model,
               "messages" => [%{"role" => "user", "content" => "test"}],
               "max_tokens" => 1
             }) do
          {:ok, _} -> :ok
          {:error, reason} -> {:error, reason}
        end
    end
  end

  # Private functions

  defp do_analyze_episode(episode, opts) do
    model = get_model(opts)

    :telemetry.execute(@telemetry ++ [:request], %{count: 1}, %{
      model: model,
      episode_kind: episode.kind
    })

    payload = build_analysis_payload(episode, opts)

    case make_openai_request(payload) do
      {:ok, response} ->
        :telemetry.execute(
          @telemetry ++ [:response],
          %{
            count: 1,
            tokens: get_in(response, ["usage", "completion_tokens"]) || 0
          },
          %{model: model}
        )

        parse_analysis_response(response)

      {:error, reason} = error ->
        :telemetry.execute(@telemetry ++ [:error], %{count: 1}, %{
          reason: inspect(reason),
          model: model
        })

        error
    end
  end

  defp build_analysis_payload(episode, opts) do
    system_prompt = """
    You are the S4 Intelligence system in a Viable System Model (VSM) framework.
    Your role is to analyze operational episodes and provide strategic recommendations.

    Focus on:
    1. Technical root cause analysis
    2. Code-based solutions and SOPs
    3. Automation opportunities
    4. Performance optimization recommendations

    Respond in JSON format with the following structure:
    {
      "summary": "Brief technical analysis summary",
      "root_causes": ["cause1", "cause2"],
      "sop_suggestions": [
        {
          "title": "SOP Title", 
          "category": "operational|coordination|control|intelligence|policy",
          "priority": "high|medium|low",
          "description": "Technical SOP description",
          "triggers": ["when to apply this SOP"],
          "actions": ["step1", "step2"],
          "automation_potential": "high|medium|low"
        }
      ],
      "recommendations": [
        {
          "type": "immediate|short_term|long_term",
          "action": "Specific technical recommendation",
          "rationale": "Technical justification",
          "system": "s1|s2|s3|s4|s5",
          "complexity": "low|medium|high"
        }
      ],
      "risk_level": "low|medium|high|critical",
      "learning_points": ["technical insight 1", "technical insight 2"]
    }
    """

    user_prompt = """
    Episode to analyze:

    ID: #{episode.id}
    Kind: #{episode.kind}
    Title: #{episode.title}
    Priority: #{episode.priority}
    Source: #{episode.source_system}
    Created: #{episode.created_at}

    Context:
    #{Jason.encode!(episode.context, pretty: true)}

    Data:
    #{format_episode_data(episode.data)}

    Metadata:
    #{Jason.encode!(episode.metadata, pretty: true)}

    Please analyze this episode focusing on technical solutions and automation.
    """

    %{
      "model" => get_model(opts),
      "messages" => [
        %{"role" => "system", "content" => system_prompt},
        %{"role" => "user", "content" => user_prompt}
      ],
      "max_tokens" => get_max_tokens(opts),
      "temperature" => get_temperature(opts),
      "response_format" => %{"type" => "json_object"}
    }
  end

  defp build_generate_payload(messages, opts) do
    %{
      "model" => get_model(opts),
      "messages" => messages,
      "max_tokens" => get_max_tokens(opts),
      "temperature" => get_temperature(opts)
    }
  end

  defp make_openai_request(payload, endpoint \\ nil) do
    path = endpoint || get_chat_path()
    url = "#{get_base_url()}#{path}"

    headers = [
      {"Content-Type", "application/json"},
      {"Authorization", "Bearer #{get_api_key()}"}
    ]

    options = [
      timeout: 30_000,
      recv_timeout: 30_000
    ]

    with {:ok, json} <- Jason.encode(payload),
         {:ok, response} <- make_request_with_retry(url, json, headers, options, 3) do
      {:ok, response}
    else
      {:error, reason} ->
        Logger.error("OpenAI API request failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp make_request_with_retry(url, json, headers, options, retries_left) when retries_left > 0 do
    case HTTPoison.post(url, json, headers, options) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, response} -> {:ok, response}
          {:error, reason} -> {:error, {:json_decode_error, reason}}
        end

      {:ok, %HTTPoison.Response{status_code: 429} = response} ->
        Logger.warning("Rate limited by OpenAI API, retrying in #{get_retry_delay(response)} ms")
        :timer.sleep(get_retry_delay(response))
        make_request_with_retry(url, json, headers, options, retries_left - 1)

      {:ok, %HTTPoison.Response{status_code: status}} when status >= 500 ->
        Logger.warning("Server error #{status}, retrying... (#{retries_left} retries left)")
        :timer.sleep(exponential_backoff(4 - retries_left))
        make_request_with_retry(url, json, headers, options, retries_left - 1)

      {:ok, %HTTPoison.Response{status_code: status, body: body}} ->
        Logger.error("OpenAI API error: #{status} - #{body}")
        {:error, {:http_error, status, parse_error_body(body)}}

      {:error, %HTTPoison.Error{reason: :timeout}} ->
        Logger.warning("Request timeout, retrying... (#{retries_left} retries left)")
        make_request_with_retry(url, json, headers, options, retries_left - 1)

      {:error, %HTTPoison.Error{reason: reason}} ->
        Logger.error("HTTP request failed: #{inspect(reason)}")
        {:error, {:network_error, reason}}
    end
  end

  defp make_request_with_retry(_url, _json, _headers, _options, 0) do
    {:error, :max_retries_exceeded}
  end

  defp parse_analysis_response(response) do
    case response do
      %{"choices" => [%{"message" => %{"content" => content}} | _]} ->
        case Jason.decode(content) do
          {:ok, parsed} ->
            usage = extract_usage_info(response)

            result = %{
              text: content,
              tokens: %{
                input: get_in(response, ["usage", "prompt_tokens"]) || 0,
                output: get_in(response, ["usage", "completion_tokens"]) || 0
              },
              usage: usage,
              citations: [],
              confidence: 0.85,
              # Legacy fields for backward compatibility
              summary: parsed["summary"],
              root_causes: parsed["root_causes"] || [],
              sop_suggestions: parsed["sop_suggestions"] || [],
              recommendations: parsed["recommendations"] || [],
              risk_level: parsed["risk_level"] || "medium",
              learning_points: parsed["learning_points"] || []
            }

            {:ok, result}

          {:error, _} ->
            usage = extract_usage_info(response)

            {:ok,
             %{
               text: content,
               tokens: %{
                 input: get_in(response, ["usage", "prompt_tokens"]) || 0,
                 output: get_in(response, ["usage", "completion_tokens"]) || 0
               },
               usage: usage,
               citations: [],
               confidence: 0.6,
               summary: content,
               root_causes: [],
               sop_suggestions: [],
               recommendations: [],
               risk_level: "medium",
               learning_points: []
             }}
        end

      _ ->
        {:error, {:unexpected_response_format, response}}
    end
  end

  defp parse_generate_response(response, latency) do
    case response do
      %{"choices" => [%{"message" => %{"content" => content}} | _]} ->
        usage = extract_usage_info(response, latency)

        result = %{
          text: content,
          tokens: %{
            input: get_in(response, ["usage", "prompt_tokens"]) || 0,
            output: get_in(response, ["usage", "completion_tokens"]) || 0
          },
          usage: usage,
          tool_calls: [],
          finish_reason:
            map_finish_reason(get_in(response, ["choices", Access.at(0), "finish_reason"]))
        }

        {:ok, result}

      _ ->
        {:error, {:unexpected_response_format, response}}
    end
  end

  defp parse_embed_response(response, latency) do
    case response do
      %{"data" => [%{"embedding" => embeddings} | _]} ->
        usage = extract_embed_usage_info(response, latency)

        result = %{
          embeddings: embeddings,
          dimensions: length(embeddings),
          usage: usage
        }

        {:ok, result}

      _ ->
        {:error, {:unexpected_response_format, response}}
    end
  end

  defp extract_usage_info(response, latency \\ 0) do
    prompt_tokens = get_in(response, ["usage", "prompt_tokens"]) || 0
    completion_tokens = get_in(response, ["usage", "completion_tokens"]) || 0

    # Approximate cost calculation for GPT-4o (as of 2024)
    # $2.50/1M input tokens, $10/1M output tokens
    cost_usd = prompt_tokens * 2.5 / 1_000_000 + completion_tokens * 10.0 / 1_000_000

    %{
      cost_usd: cost_usd,
      latency_ms: latency
    }
  end

  defp extract_embed_usage_info(response, latency) do
    total_tokens = get_in(response, ["usage", "total_tokens"]) || 0

    # Embedding cost for text-embedding-3-small: $0.02/1M tokens
    cost_usd = total_tokens * 0.02 / 1_000_000

    %{
      cost_usd: cost_usd,
      latency_ms: latency
    }
  end

  defp get_model(opts), do: Keyword.get(opts, :model, System.get_env("OPENAI_MODEL") || @default_model)
  defp get_max_tokens(opts), do: Keyword.get(opts, :max_tokens, @default_max_tokens)
  defp get_temperature(opts), do: Keyword.get(opts, :temperature, @default_temperature)
  defp get_api_key, do: System.get_env("OPENAI_API_KEY")

  defp get_base_url do
    base_url =
      Application.get_env(:cybernetic, __MODULE__, [])
      |> Keyword.get(:base_url, System.get_env("OPENAI_BASE_URL"))

    resolve_value(base_url, @default_base_url)
    |> normalize_base_url()
  end

  defp get_chat_path do
    Application.get_env(:cybernetic, __MODULE__, [])
    |> Keyword.get(:chat_path, System.get_env("OPENAI_CHAT_COMPLETIONS_PATH"))
    |> resolve_value(@default_chat_path)
  end

  defp get_embeddings_path do
    Application.get_env(:cybernetic, __MODULE__, [])
    |> Keyword.get(:embeddings_path, System.get_env("OPENAI_EMBEDDINGS_PATH"))
    |> resolve_value(@default_embeddings_path)
  end

  defp format_episode_data(data) when is_binary(data), do: data
  defp format_episode_data(data), do: Jason.encode!(data, pretty: true)

  defp add_usage_metrics({:ok, result}, latency) do
    case result do
      %{tokens: %{input: _input, output: _output}} ->
        result =
          Map.update!(result, :usage, fn usage ->
            Map.merge(usage, %{latency_ms: latency})
          end)

        {:ok, result}

      _ ->
        {:ok, result}
    end
  end

  defp add_usage_metrics(error, _latency), do: error

  defp get_retry_delay(response) do
    case get_header(response.headers, "retry-after") do
      # Default 1 second
      nil ->
        1000

      retry_after ->
        case Integer.parse(retry_after) do
          {seconds, ""} -> seconds * 1000
          _ -> 1000
        end
    end
  end

  defp get_header(headers, key) do
    headers
    |> Enum.find(fn {k, _v} -> String.downcase(k) == String.downcase(key) end)
    |> case do
      {_k, v} -> v
      nil -> nil
    end
  end

  defp exponential_backoff(attempt) do
    # 1 second
    base_delay = 1000
    # 30 seconds
    max_delay = 30_000
    delay = base_delay * :math.pow(2, attempt)
    min(delay, max_delay) |> round()
  end

  defp parse_error_body(body) do
    case Jason.decode(body) do
      {:ok, %{"error" => %{"message" => message}}} -> message
      {:ok, %{"error" => error}} when is_binary(error) -> error
      {:ok, parsed} -> inspect(parsed)
      {:error, _} -> body
    end
  end

  defp map_finish_reason("stop"), do: :stop
  defp map_finish_reason("length"), do: :length
  defp map_finish_reason("tool_calls"), do: :tool_calls
  defp map_finish_reason(_), do: :stop

  defp normalize_base_url(base_url) do
    base_url
    |> String.trim()
    |> String.trim_trailing("/")
  end

  defp resolve_value(value, default) when is_binary(value) and value != "", do: value
  defp resolve_value(_value, default), do: default
end
