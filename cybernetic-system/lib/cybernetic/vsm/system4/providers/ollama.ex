defmodule Cybernetic.VSM.System4.Providers.Ollama do
  @moduledoc """
  Ollama provider for S4 Intelligence system.

  Implements the LLM provider behavior for local model deployments,
  providing privacy-focused analysis capabilities.
  """

  @behaviour Cybernetic.VSM.System4.LLMProvider

  require Logger
  require OpenTelemetry.Tracer

  @default_model "llama3.2:1b"
  @default_endpoint "http://localhost:11434"
  @default_max_tokens 4096
  @default_temperature 0.1
  @telemetry [:cybernetic, :s4, :ollama]

  @impl Cybernetic.VSM.System4.LLMProvider
  def capabilities do
    %{
      modes: [:chat],
      strengths: [:privacy, :cost],
      max_tokens: 2048,
      context_window: 8192
    }
  end

  @impl Cybernetic.VSM.System4.LLMProvider
  def analyze_episode(episode, opts \\ []) do
    start_time = System.monotonic_time(:millisecond)

    OpenTelemetry.Tracer.with_span "ollama.analyze_episode", %{
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
    start_time = System.monotonic_time(:millisecond)

    payload = %{
      "model" => get_model(opts),
      "prompt" => prompt,
      "stream" => false,
      "options" => %{
        "temperature" => get_temperature(opts),
        "num_predict" => get_max_tokens(opts)
      }
    }

    case make_ollama_request(payload, "/api/generate") do
      {:ok, response} ->
        latency = System.monotonic_time(:millisecond) - start_time
        parse_generate_response(response, latency)

      {:error, reason} ->
        {:error, reason}
    end
  end

  def generate(messages, opts) when is_list(messages) do
    # Convert messages to a single prompt for Ollama
    prompt = messages_to_prompt(messages)
    generate(prompt, opts)
  end

  @impl Cybernetic.VSM.System4.LLMProvider
  def embed(text, opts \\ []) do
    start_time = System.monotonic_time(:millisecond)

    payload = %{
      "model" => Keyword.get(opts, :model, "nomic-embed-text"),
      "prompt" => text
    }

    case make_ollama_request(payload, "/api/embeddings") do
      {:ok, response} ->
        latency = System.monotonic_time(:millisecond) - start_time
        parse_embed_response(response, latency)

      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl Cybernetic.VSM.System4.LLMProvider
  def health_check do
    url = "#{get_endpoint()}/api/tags"
    options = [timeout: 5_000, recv_timeout: 5_000]

    case HTTPoison.get(url, [], options) do
      {:ok, %HTTPoison.Response{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, %{"models" => models}} when is_list(models) -> :ok
          {:ok, _} -> {:error, :no_models_available}
          {:error, _} -> {:error, :invalid_response}
        end

      {:ok, %HTTPoison.Response{status_code: _}} ->
        {:error, :server_unavailable}

      {:error, %HTTPoison.Error{reason: :econnrefused}} ->
        {:error, :server_unavailable}

      {:error, _} ->
        {:error, :server_unavailable}
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

    case make_ollama_request(payload, "/api/chat") do
      {:ok, response} ->
        :telemetry.execute(
          @telemetry ++ [:response],
          %{
            count: 1,
            tokens: get_in(response, ["eval_count"]) || 0
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
    Your role is to analyze operational episodes with focus on privacy and local processing.

    Provide analysis that emphasizes:
    1. Privacy-preserving solutions
    2. Local processing capabilities
    3. Reduced external dependencies
    4. Cost-effective recommendations

    Respond in JSON format with the following structure:
    {
      "summary": "Brief privacy-focused analysis summary",
      "root_causes": ["cause1", "cause2"],
      "sop_suggestions": [
        {
          "title": "SOP Title", 
          "category": "operational|coordination|control|intelligence|policy",
          "priority": "high|medium|low",
          "description": "Privacy-focused SOP description",
          "triggers": ["when to apply this SOP"],
          "actions": ["step1", "step2"],
          "privacy_level": "high|medium|low"
        }
      ],
      "recommendations": [
        {
          "type": "immediate|short_term|long_term",
          "action": "Privacy-focused recommendation",
          "rationale": "Privacy and cost justification",
          "system": "s1|s2|s3|s4|s5",
          "local_processing": true
        }
      ],
      "risk_level": "low|medium|high|critical",
      "learning_points": ["privacy insight 1", "cost insight 2"]
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

    Please analyze this episode focusing on privacy and local processing solutions.
    """

    %{
      "model" => get_model(opts),
      "messages" => [
        %{"role" => "system", "content" => system_prompt},
        %{"role" => "user", "content" => user_prompt}
      ],
      "stream" => false,
      "options" => %{
        "temperature" => get_temperature(opts),
        "num_predict" => get_max_tokens(opts)
      }
    }
  end

  defp make_ollama_request(payload, endpoint) do
    url = "#{get_endpoint()}#{endpoint}"
    headers = [{"Content-Type", "application/json"}]

    options = [
      # Ollama can be slower
      timeout: 60_000,
      recv_timeout: 60_000,
      hackney: [pool: :ollama_pool]
    ]

    with {:ok, json} <- Jason.encode(payload),
         {:ok, response} <- make_request_with_retry(url, json, headers, options, 2) do
      {:ok, response}
    else
      {:error, reason} ->
        Logger.error("Ollama API request failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp make_request_with_retry(url, json, headers, options, retries_left) when retries_left > 0 do
    case HTTPoison.post(url, json, headers, options) do
      {:ok, %{status_code: 200, body: body}} ->
        case Jason.decode(body) do
          {:ok, response} -> {:ok, response}
          {:error, reason} -> {:error, {:json_decode_error, reason}}
        end

      {:ok, %{status_code: status, body: _body}} when status >= 500 ->
        Logger.warning(
          "Ollama server error #{status}, retrying... (#{retries_left} retries left)"
        )

        :timer.sleep(exponential_backoff(3 - retries_left))
        make_request_with_retry(url, json, headers, options, retries_left - 1)

      {:ok, %{status_code: status, body: body}} ->
        Logger.error("Ollama API error: #{status} - #{body}")
        {:error, {:http_error, status, body}}

      {:error, %HTTPoison.Error{reason: :timeout}} ->
        Logger.warning("Request timeout, retrying... (#{retries_left} retries left)")
        make_request_with_retry(url, json, headers, options, retries_left - 1)

      {:error, %HTTPoison.Error{reason: :econnrefused}} ->
        Logger.error("Ollama server not available at #{url}")
        {:error, :server_unavailable}

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
      %{"message" => %{"content" => content}} ->
        case Jason.decode(content) do
          {:ok, parsed} ->
            usage = extract_usage_info(response)

            result = %{
              text: content,
              tokens: %{
                input: get_in(response, ["prompt_eval_count"]) || 0,
                output: get_in(response, ["eval_count"]) || 0
              },
              usage: usage,
              citations: [],
              # Lower confidence for local models
              confidence: 0.7,
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
                 input: get_in(response, ["prompt_eval_count"]) || 0,
                 output: get_in(response, ["eval_count"]) || 0
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
      %{"response" => content} ->
        usage = extract_usage_info(response, latency)

        result = %{
          text: content,
          tokens: %{
            input: get_in(response, ["prompt_eval_count"]) || 0,
            output: get_in(response, ["eval_count"]) || 0
          },
          usage: usage,
          tool_calls: [],
          finish_reason: map_done_reason(get_in(response, ["done"]))
        }

        {:ok, result}

      _ ->
        {:error, {:unexpected_response_format, response}}
    end
  end

  defp parse_embed_response(response, latency) do
    case response do
      %{"embedding" => embeddings} when is_list(embeddings) ->
        usage = %{
          # Local processing, no cost
          cost_usd: 0.0,
          latency_ms: latency
        }

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

  defp extract_usage_info(_response, latency \\ 0) do
    # Ollama is local, so no cost
    %{
      cost_usd: 0.0,
      latency_ms: latency
    }
  end

  defp messages_to_prompt(messages) do
    messages
    |> Enum.map(fn
      %{"role" => "system", "content" => content} -> "System: #{content}"
      %{"role" => "user", "content" => content} -> "User: #{content}"
      %{"role" => "assistant", "content" => content} -> "Assistant: #{content}"
      message -> inspect(message)
    end)
    |> Enum.join("\n\n")
  end

  defp get_model(opts), do: Keyword.get(opts, :model, @default_model)
  defp get_max_tokens(opts), do: Keyword.get(opts, :max_tokens, @default_max_tokens)
  defp get_temperature(opts), do: Keyword.get(opts, :temperature, @default_temperature)
  defp get_endpoint, do: System.get_env("OLLAMA_ENDPOINT", @default_endpoint)

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

  defp exponential_backoff(attempt) do
    # 2 seconds base for Ollama
    base_delay = 2000
    # 30 seconds max
    max_delay = 30_000
    delay = base_delay * :math.pow(2, attempt)
    min(delay, max_delay) |> round()
  end

  defp map_done_reason(true), do: :stop
  defp map_done_reason(false), do: :length
  defp map_done_reason(_), do: :stop
end
