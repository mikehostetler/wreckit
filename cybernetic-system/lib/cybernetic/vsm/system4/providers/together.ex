defmodule Cybernetic.VSM.System4.Providers.Together do
  @moduledoc """
  Together AI provider for S4 Intelligence system.

  Provides access to multiple open-source models including Llama, Mistral,
  and specialized models with competitive pricing and performance.
  """

  @behaviour Cybernetic.VSM.System4.LLMProvider

  require Logger
  require OpenTelemetry.Tracer, as: Tracer

  @default_model "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"
  @default_max_tokens 4096
  @default_temperature 0.1
  @telemetry [:cybernetic, :s4, :together]
  @base_url "https://api.together.xyz"

  @impl Cybernetic.VSM.System4.LLMProvider
  def capabilities do
    %{
      modes: [:chat, :completion, :reasoning],
      strengths: [:speed, :variety, :open_source],
      max_tokens: 8192,
      # Llama 3.1 supports 128k context
      context_window: 131_072
    }
  end

  @impl Cybernetic.VSM.System4.LLMProvider
  def analyze_episode(episode, opts \\ []) do
    start_time = System.monotonic_time(:millisecond)

    Tracer.with_span "together.analyze_episode", %{
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

    case make_together_request(build_generate_payload(messages, opts)) do
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
      "model" => Keyword.get(opts, :model, "togethercomputer/m2-bert-80M-8k-retrieval"),
      "input" => text
    }

    case make_together_request(payload, "/v1/embeddings") do
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
        # Simple ping test with a fast model
        case make_together_request(%{
               "model" => "togethercomputer/RedPajama-INCITE-Chat-3B-v1",
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

    case make_together_request(payload) do
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
    Your role is to analyze operational episodes leveraging open-source AI models.

    Focus on:
    1. Rapid analysis with high-quality open models
    2. Cost-effective recommendations
    3. Practical solutions using proven approaches
    4. Leveraging specialized models when appropriate

    Respond in JSON format with the following structure:
    {
      "summary": "Brief analysis using open-source insights",
      "root_causes": ["cause1", "cause2"],
      "sop_suggestions": [
        {
          "title": "SOP Title", 
          "category": "operational|coordination|control|intelligence|policy",
          "priority": "high|medium|low",
          "description": "Practical SOP description",
          "triggers": ["when to apply this SOP"],
          "actions": ["step1", "step2"],
          "model_recommendation": "suggested_model_for_task"
        }
      ],
      "recommendations": [
        {
          "type": "immediate|short_term|long_term",
          "action": "Practical recommendation",
          "rationale": "Open-source solution justification",
          "system": "s1|s2|s3|s4|s5",
          "tools": ["open_source_tools_to_use"]
        }
      ],
      "risk_level": "low|medium|high|critical",
      "learning_points": ["insight 1", "insight 2"],
      "model_performance": "assessment of model effectiveness"
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

    Please analyze this episode and provide structured recommendations using open-source best practices.
    """

    # Model selection based on task type
    model =
      case episode.kind do
        :code_gen -> "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo"
        :reasoning -> "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"
        :fast_response -> "mistralai/Mixtral-8x7B-Instruct-v0.1"
        _ -> get_model(opts)
      end

    %{
      "model" => model,
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

  defp make_together_request(payload, endpoint \\ "/v1/chat/completions") do
    url = "#{@base_url}#{endpoint}"

    headers = [
      {"Content-Type", "application/json"},
      {"Authorization", "Bearer #{get_api_key()}"}
    ]

    options = [
      timeout: 30_000,
      recv_timeout: 30_000,
      hackney: [pool: :together_pool]
    ]

    with {:ok, json} <- Jason.encode(payload),
         {:ok, response} <- make_request_with_retry(url, json, headers, options, 3) do
      {:ok, response}
    else
      {:error, reason} ->
        Logger.error("Together API request failed: #{inspect(reason)}")
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
        Logger.warning("Rate limited by Together API, retrying...")
        :timer.sleep(get_retry_delay(response))
        make_request_with_retry(url, json, headers, options, retries_left - 1)

      {:ok, %HTTPoison.Response{status_code: status}} when status >= 500 ->
        Logger.warning("Server error #{status}, retrying... (#{retries_left} retries left)")
        :timer.sleep(exponential_backoff(4 - retries_left))
        make_request_with_retry(url, json, headers, options, retries_left - 1)

      {:ok, %HTTPoison.Response{status_code: status, body: body}} ->
        Logger.error("Together API error: #{status} - #{body}")
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
              # Moderate confidence for open models
              confidence: 0.75,
              # Legacy fields for backward compatibility
              summary: parsed["summary"],
              root_causes: parsed["root_causes"] || [],
              sop_suggestions: parsed["sop_suggestions"] || [],
              recommendations: parsed["recommendations"] || [],
              risk_level: parsed["risk_level"] || "medium",
              learning_points: parsed["learning_points"] || [],
              model_performance: parsed["model_performance"]
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
               confidence: 0.5,
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

    # Together AI pricing (approximate as of 2024)
    # Llama 3.1 70B: $0.88/1M input, $0.88/1M output
    # Mixtral 8x7B: $0.60/1M input, $0.60/1M output
    cost_usd = prompt_tokens * 0.88 / 1_000_000 + completion_tokens * 0.88 / 1_000_000

    %{
      cost_usd: cost_usd,
      latency_ms: latency
    }
  end

  defp extract_embed_usage_info(response, latency) do
    total_tokens = get_in(response, ["usage", "total_tokens"]) || 0

    # Embedding cost for Together AI: ~$0.008/1M tokens
    cost_usd = total_tokens * 0.008 / 1_000_000

    %{
      cost_usd: cost_usd,
      latency_ms: latency
    }
  end

  defp get_model(opts), do: Keyword.get(opts, :model, @default_model)
  defp get_max_tokens(opts), do: Keyword.get(opts, :max_tokens, @default_max_tokens)
  defp get_temperature(opts), do: Keyword.get(opts, :temperature, @default_temperature)
  defp get_api_key, do: System.get_env("TOGETHER_API_KEY")

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
end
