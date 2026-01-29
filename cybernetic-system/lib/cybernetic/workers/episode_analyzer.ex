defmodule Cybernetic.Workers.EpisodeAnalyzer do
  @moduledoc """
  Oban worker for analyzing episodes using LLM-based analysis.

  Processes episode content to extract:
  - Key topics and themes
  - Entity mentions
  - Sentiment analysis
  - Action items
  - Summary generation

  ## Configuration

      config :cybernetic, Oban,
        queues: [analysis: 5]

      config :cybernetic, :llm,
        max_content_length: 10_000,
        model: "gpt-4o-mini"

      config :cybernetic, :workers,
        analysis_parallelism: 4

  ## Job Arguments

      %{
        episode_id: "uuid",
        tenant_id: "tenant-1",
        analysis_type: "full" | "summary" | "entities",
        options: %{}
      }

  ## Security

  - Episode IDs are validated as UUIDs
  - Content is truncated before sending to LLM
  - LLM responses are sanitized
  """
  use Oban.Worker,
    queue: :analysis,
    max_attempts: 3,
    priority: 2

  require Logger

  alias Cybernetic.Config
  alias Cybernetic.Validation

  @telemetry [:cybernetic, :worker, :episode_analyzer]

  @valid_analysis_types [:full, :summary, :entities, :sentiment]

  @type analysis_type :: :full | :summary | :entities | :sentiment
  @type job_args :: %{
          episode_id: String.t(),
          tenant_id: String.t(),
          analysis_type: String.t(),
          options: map()
        }

  @impl Oban.Worker
  @spec perform(Oban.Job.t()) :: :ok | {:error, term()} | {:snooze, pos_integer()}
  def perform(%Oban.Job{args: args, attempt: attempt}) do
    start_time = System.monotonic_time(:millisecond)

    # Validate and extract arguments
    with {:ok, validated} <- validate_args(args) do
      %{
        episode_id: episode_id,
        tenant_id: tenant_id,
        analysis_type: analysis_type,
        options: options
      } = validated

      Logger.info("Starting episode analysis",
        episode_id: episode_id,
        tenant_id: tenant_id,
        analysis_type: analysis_type,
        attempt: attempt
      )

      result =
        with {:ok, episode} <- fetch_episode(tenant_id, episode_id),
             {:ok, content} <- extract_and_validate_content(episode),
             {:ok, analysis} <- analyze_content(content, analysis_type, options),
             :ok <- store_analysis(tenant_id, episode_id, analysis) do
          emit_telemetry(:success, start_time, analysis_type)
          publish_analysis_complete(tenant_id, episode_id, analysis)
          :ok
        else
          {:error, :not_found} ->
            Logger.warning("Episode not found",
              episode_id: episode_id,
              tenant_id: tenant_id
            )

            emit_telemetry(:not_found, start_time, analysis_type)
            {:error, :not_found}

          {:error, :rate_limited} ->
            backoff = calculate_backoff(attempt)

            Logger.info("Rate limited, snoozing",
              episode_id: episode_id,
              backoff_seconds: backoff
            )

            emit_telemetry(:rate_limited, start_time, analysis_type)
            {:snooze, backoff}

          {:error, :empty_content} ->
            Logger.warning("Episode has no content",
              episode_id: episode_id,
              tenant_id: tenant_id
            )

            emit_telemetry(:empty_content, start_time, analysis_type)
            {:error, :empty_content}

          {:error, reason} ->
            Logger.error("Episode analysis failed",
              episode_id: episode_id,
              reason: inspect(reason)
            )

            emit_telemetry(:error, start_time, analysis_type)
            {:error, reason}
        end

      result
    else
      {:error, reason} ->
        Logger.error("Invalid job arguments", reason: reason, args: inspect(args))
        emit_telemetry(:validation_error, start_time, :unknown)
        {:error, reason}
    end
  end

  # Validate job arguments
  @spec validate_args(map()) :: {:ok, map()} | {:error, atom()}
  defp validate_args(args) do
    with {:ok, episode_id} <- validate_episode_id(args["episode_id"]),
         {:ok, tenant_id} <- Validation.validate_tenant_id(args["tenant_id"]),
         {:ok, analysis_type} <- validate_analysis_type(args["analysis_type"]) do
      {:ok,
       %{
         episode_id: episode_id,
         tenant_id: tenant_id,
         analysis_type: analysis_type,
         options: args["options"] || %{}
       }}
    end
  end

  defp validate_episode_id(nil), do: {:error, :missing_episode_id}

  defp validate_episode_id(id) when is_binary(id) do
    if Validation.valid_uuid?(id) do
      {:ok, id}
    else
      {:error, :invalid_episode_id}
    end
  end

  defp validate_episode_id(_), do: {:error, :invalid_episode_id}

  defp validate_analysis_type(nil), do: {:ok, :full}

  defp validate_analysis_type(type) when is_binary(type) do
    Validation.safe_to_atom(type, @valid_analysis_types)
  end

  defp validate_analysis_type(_), do: {:error, :invalid_analysis_type}

  # Fetch episode from storage
  @spec fetch_episode(String.t(), String.t()) :: {:ok, map()} | {:error, term()}
  defp fetch_episode(tenant_id, episode_id) do
    # Try to get episode from EpisodeStore or database
    case get_episode_from_store(tenant_id, episode_id) do
      {:ok, episode} ->
        {:ok, episode}

      {:error, :not_found} ->
        # Try storage as fallback
        path = "episodes/#{episode_id}/content.json"

        case Cybernetic.Storage.get(tenant_id, path) do
          {:ok, content} ->
            Validation.safe_json_decode(content)

          {:error, %Cybernetic.Storage.Error{reason: :not_found}} ->
            {:error, :not_found}

          error ->
            error
        end
    end
  end

  defp get_episode_from_store(tenant_id, episode_id) do
    backend = Application.get_env(:cybernetic, :episode_store_backend)

    cond do
      is_atom(backend) and Code.ensure_loaded?(backend) and function_exported?(backend, :get, 2) ->
        apply(backend, :get, [tenant_id, episode_id])

      true ->
        {:error, :not_found}
    end
  end

  # Extract and validate content from episode
  @spec extract_and_validate_content(map()) :: {:ok, String.t()} | {:error, atom()}
  defp extract_and_validate_content(episode) do
    content = episode["content"] || episode["text"] || episode["body"] || ""

    cond do
      not is_binary(content) ->
        {:error, :invalid_content}

      String.trim(content) == "" ->
        {:error, :empty_content}

      true ->
        # Truncate content to prevent token overflow and cost explosion
        truncated = Validation.truncate_content(content)
        {:ok, truncated}
    end
  end

  # Analyze content based on type
  @spec analyze_content(String.t(), analysis_type(), map()) :: {:ok, map()} | {:error, term()}
  defp analyze_content(content, :full, options) do
    # Run all analyses in parallel for performance
    # Note: parallelism config available for future task pool implementation
    timeout = Config.llm_timeout() * 2

    tasks = [
      Task.async(fn -> {:summary, generate_summary(content, options)} end),
      Task.async(fn -> {:entities, extract_entities(content, options)} end),
      Task.async(fn -> {:sentiment, analyze_sentiment(content, options)} end),
      Task.async(fn -> {:topics, extract_topics(content, options)} end)
    ]

    results =
      tasks
      |> Task.await_many(timeout)
      |> Enum.into(%{})

    # Check for any failures
    errors =
      results
      |> Enum.filter(fn {_key, result} -> match?({:error, _}, result) end)
      |> Enum.map(fn {key, {:error, reason}} -> {key, reason} end)

    if errors != [] do
      # Check if any error is rate limiting
      if Enum.any?(errors, fn {_, reason} -> reason == :rate_limited end) do
        {:error, :rate_limited}
      else
        Logger.warning("Some analyses failed", errors: errors)
        # Continue with partial results
        build_analysis_result(:full, results)
      end
    else
      build_analysis_result(:full, results)
    end
  end

  defp analyze_content(content, :summary, options) do
    case generate_summary(content, options) do
      {:ok, summary} ->
        {:ok,
         %{
           type: :summary,
           summary: summary,
           analyzed_at: DateTime.utc_now(),
           model: get_model_info()
         }}

      error ->
        error
    end
  end

  defp analyze_content(content, :entities, options) do
    case extract_entities(content, options) do
      {:ok, entities} ->
        {:ok,
         %{
           type: :entities,
           entities: entities,
           analyzed_at: DateTime.utc_now(),
           model: get_model_info()
         }}

      error ->
        error
    end
  end

  defp analyze_content(content, :sentiment, options) do
    case analyze_sentiment(content, options) do
      {:ok, sentiment} ->
        {:ok,
         %{
           type: :sentiment,
           sentiment: sentiment,
           analyzed_at: DateTime.utc_now(),
           model: get_model_info()
         }}

      error ->
        error
    end
  end

  # Build analysis result from parallel task results
  defp build_analysis_result(:full, results) do
    {:ok,
     %{
       type: :full,
       summary: extract_result(results[:summary], ""),
       entities: extract_result(results[:entities], []),
       sentiment: extract_result(results[:sentiment], %{"overall" => "neutral"}),
       topics: extract_result(results[:topics], []),
       analyzed_at: DateTime.utc_now(),
       model: get_model_info()
     }}
  end

  defp extract_result({:ok, value}, _default), do: value
  defp extract_result({:error, _}, default), do: default
  defp extract_result(nil, default), do: default

  # LLM-based analysis functions with content already truncated

  @spec generate_summary(String.t(), map()) :: {:ok, String.t()} | {:error, term()}
  defp generate_summary(content, _options) do
    if String.length(content) < 100 do
      {:ok, content}
    else
      prompt = """
      Summarize the following content in 2-3 sentences. Be concise and factual.

      Content:
      #{content}
      """

      call_llm(prompt)
    end
  end

  @spec extract_entities(String.t(), map()) :: {:ok, [map()]} | {:error, term()}
  defp extract_entities(content, _options) do
    prompt = """
    Extract named entities from the following content. Return ONLY a JSON array with objects containing:
    - name: entity name
    - type: person, organization, location, product, event, or other
    - mentions: number of times mentioned

    Content:
    #{content}

    Response (JSON array only):
    """

    case call_llm(prompt) do
      {:ok, response} ->
        case Validation.extract_json(response, []) do
          {:ok, entities} when is_list(entities) -> {:ok, entities}
          _ -> {:ok, []}
        end

      error ->
        error
    end
  end

  @spec analyze_sentiment(String.t(), map()) :: {:ok, map()} | {:error, term()}
  defp analyze_sentiment(content, _options) do
    prompt = """
    Analyze the sentiment of the following content. Return ONLY a JSON object with:
    - overall: "positive", "negative", "neutral", or "mixed"
    - confidence: number between 0.0 and 1.0
    - aspects: array of objects with {aspect, sentiment, confidence}

    Content:
    #{content}

    Response (JSON object only):
    """

    default = %{"overall" => "neutral", "confidence" => 0.5, "aspects" => []}

    case call_llm(prompt) do
      {:ok, response} ->
        case Validation.extract_json(response, default) do
          {:ok, sentiment} when is_map(sentiment) -> {:ok, sentiment}
          _ -> {:ok, default}
        end

      error ->
        error
    end
  end

  @spec extract_topics(String.t(), map()) :: {:ok, [String.t()]} | {:error, term()}
  defp extract_topics(content, _options) do
    prompt = """
    Extract 3-5 main topics from the following content. Return ONLY a JSON array of topic strings.

    Content:
    #{content}

    Response (JSON array of strings only):
    """

    case call_llm(prompt) do
      {:ok, response} ->
        case Validation.extract_json(response, []) do
          {:ok, topics} when is_list(topics) ->
            # Ensure all topics are strings
            valid_topics = Enum.filter(topics, &is_binary/1)
            {:ok, valid_topics}

          _ ->
            {:ok, []}
        end

      error ->
        error
    end
  end

  # LLM API call with timeout and error handling
  @spec call_llm(String.t()) :: {:ok, String.t()} | {:error, term()}
  defp call_llm(prompt) do
    if Code.ensure_loaded?(ReqLLM) do
      call_llm_with_reqllm(prompt)
    else
      Logger.warning("ReqLLM not available, using placeholder analysis")
      {:ok, "[Analysis placeholder - ReqLLM not configured]"}
    end
  end

  defp call_llm_with_reqllm(prompt) do
    base_url = Config.llm_base_url()
    model = Config.llm_model()
    max_tokens = Config.llm_max_tokens()
    timeout = Config.llm_timeout()

    req =
      Req.new(
        base_url: base_url,
        receive_timeout: timeout,
        retry: false
      )
      |> maybe_attach_reqllm()

    case Req.post(req,
           url: "/chat/completions",
           json: %{
             model: model,
             messages: [%{role: "user", content: prompt}],
             max_tokens: max_tokens,
             temperature: 0.3
           }
         ) do
      {:ok, %{status: 200, body: %{"choices" => [%{"message" => %{"content" => content}} | _]}}} ->
        {:ok, String.trim(content)}

      {:ok, %{status: 429}} ->
        {:error, :rate_limited}

      {:ok, %{status: 401}} ->
        Logger.error("LLM API authentication failed")
        {:error, :auth_failed}

      {:ok, %{status: status, body: body}} ->
        Logger.error("LLM API error", status: status, body: inspect(body))
        {:error, {:api_error, status}}

      {:error, %Req.TransportError{reason: :timeout}} ->
        {:error, :timeout}

      {:error, reason} ->
        Logger.error("LLM request failed", reason: inspect(reason))
        {:error, :request_failed}
    end
  rescue
    e ->
      Logger.error("LLM call exception", error: Exception.message(e))
      {:error, :llm_error}
  end

  defp maybe_attach_reqllm(req) do
    if Code.ensure_loaded?(ReqLLM) and function_exported?(ReqLLM, :attach, 1) do
      apply(ReqLLM, :attach, [req])
    else
      req
    end
  end

  defp get_model_info do
    %{
      provider: to_string(Config.llm_provider()),
      model: Config.llm_model()
    }
  end

  # Store analysis results
  @spec store_analysis(String.t(), String.t(), map()) :: :ok | {:error, term()}
  defp store_analysis(tenant_id, episode_id, analysis) do
    path = "episodes/#{episode_id}/analysis.json"

    case Jason.encode(analysis) do
      {:ok, content} ->
        case Cybernetic.Storage.put(tenant_id, path, content, content_type: "application/json") do
          {:ok, _} -> :ok
          error -> error
        end

      {:error, _} ->
        {:error, :encoding_failed}
    end
  end

  # Publish completion event
  defp publish_analysis_complete(tenant_id, episode_id, analysis) do
    pubsub = Config.pubsub_module()

    Phoenix.PubSub.broadcast(
      pubsub,
      "events:episode",
      {:event, "episode.analyzed",
       %{
         tenant_id: tenant_id,
         episode_id: episode_id,
         analysis_type: analysis.type,
         timestamp: DateTime.utc_now()
       }}
    )
  end

  # Calculate exponential backoff for rate limiting
  defp calculate_backoff(attempt) do
    base = 30
    max_backoff = 300
    jitter = :rand.uniform(10)

    min((base * :math.pow(2, attempt - 1)) |> round(), max_backoff) + jitter
  end

  # Telemetry
  defp emit_telemetry(status, start_time, analysis_type) do
    duration = System.monotonic_time(:millisecond) - start_time

    :telemetry.execute(
      @telemetry,
      %{duration: duration, count: 1},
      %{status: status, analysis_type: analysis_type}
    )
  end
end
