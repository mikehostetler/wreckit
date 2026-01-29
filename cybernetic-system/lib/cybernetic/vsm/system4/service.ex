defmodule Cybernetic.VSM.System4.Service do
  @moduledoc """
  S4 Service - Intelligent routing and coordination for LLM providers.
  Routes episodes to appropriate providers based on task type and availability.
  """
  use GenServer
  require Logger

  alias Cybernetic.VSM.System4.{Episode, Memory}
  alias Cybernetic.VSM.System4.Providers.{Anthropic, OpenAI, Together, Ollama, Null}
  alias Cybernetic.Core.Security.RateLimiter
  alias Cybernetic.Core.Resilience.AdaptiveCircuitBreaker

  @default_timeout 30_000

  # Provider selection rules
  @provider_rules %{
    reasoning: [:anthropic, :openai],
    code_generation: [:anthropic, :openai, :together],
    general: [:anthropic, :openai, :together, :ollama],
    fast: [:anthropic, :openai, :together, :ollama],
    quality: [:anthropic, :openai]
  }

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    providers = init_providers(opts)
    init_circuit_breakers(providers)

    state = %{
      providers: providers,
      stats: %{
        total_requests: 0,
        successful: 0,
        failed: 0,
        by_provider: %{}
      }
    }

    Logger.info("S4 Service initialized with providers: #{inspect(Map.keys(state.providers))}")
    {:ok, state}
  end

  # Public API

  @doc """
  Route an episode to the appropriate provider based on task type and availability.
  """
  def route_episode(episode_map) when is_map(episode_map) do
    GenServer.call(__MODULE__, {:route_episode, episode_map}, @default_timeout)
  catch
    :exit, {:noproc, _} ->
      # Service not started, use null provider
      {:ok, %{provider: :null, content: "Service not available", episode_id: episode_map[:id]}}
  end

  @doc """
  Analyze an episode using intelligent routing.
  """
  def analyze_episode(%Episode{} = episode, opts \\ []) do
    GenServer.call(__MODULE__, {:analyze, episode, opts}, @default_timeout)
  catch
    :exit, {:noproc, _} ->
      # Service not started, use null provider
      {:ok, %{provider: :null, content: "Service not available", episode_id: episode.id}}
  end

  @doc """
  Get service statistics.
  """
  def stats do
    GenServer.call(__MODULE__, :stats)
  catch
    :exit, {:noproc, _} ->
      %{error: "Service not running"}
  end

  @doc """
  Health check for all providers.
  """
  def health_check do
    GenServer.call(__MODULE__, :health_check, 10_000)
  catch
    :exit, {:noproc, _} ->
      %{status: :down, providers: %{}}
  end

  # Server Callbacks

  @impl true
  def handle_call({:route_episode, episode_map}, _from, state) do
    # Convert map to Episode struct if needed
    {episode, budget} =
      case episode_map do
        %Episode{} = e ->
          {e, %{}}

        %{} ->
          budget = Map.get(episode_map, :budget, %{})
          episode = struct(Episode, Map.delete(episode_map, :budget))
          {episode, budget}
      end

    result = route_to_provider(episode, budget, state)

    # Update stats
    new_state = update_stats(state, result)

    {:reply, result, new_state}
  end

  @impl true
  def handle_call({:analyze, episode, opts}, _from, state) do
    result = do_analyze(episode, opts, state)
    new_state = update_stats(state, result)
    {:reply, result, new_state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    {:reply, state.stats, state}
  end

  @impl true
  def handle_call(:health_check, _from, state) do
    # Check provider health
    provider_health =
      Enum.reduce(state.providers, %{}, fn {name, provider}, acc ->
        status =
          try do
            provider.health_check()
          rescue
            _ -> :error
          end

        Map.put(acc, name, status)
      end)

    # Check circuit breaker status
    breaker_health =
      Enum.reduce(state.providers, %{}, fn {name, _}, acc ->
        circuit_breaker_name = :"s4_provider_#{name}"

        status =
          try do
            cb_state = AdaptiveCircuitBreaker.get_state(circuit_breaker_name)

            %{
              state: cb_state.state,
              failure_count: cb_state.failure_count,
              success_count: cb_state.success_count,
              health_score: cb_state.health_score
            }
          rescue
            _ -> %{state: :unknown}
          end

        Map.put(acc, name, status)
      end)

    health = %{
      status: :up,
      providers: provider_health,
      circuit_breakers: breaker_health
    }

    {:reply, health, state}
  end

  # Private Functions

  defp init_circuit_breakers(providers) do
    # Start circuit breakers for each provider
    for {provider, _module} <- providers do
      circuit_breaker_name = :"s4_provider_#{provider}"

      {:ok, _pid} =
        AdaptiveCircuitBreaker.start_link(
          name: circuit_breaker_name,
          failure_threshold: 3,
          success_threshold: 2,
          timeout_ms: 30_000
        )

      Logger.info("Started circuit breaker for S4 provider: #{provider}")
    end

    :ok
  end

  defp init_providers(opts) do
    providers = Keyword.get(opts, :providers, [:anthropic, :openai, :together, :ollama])

    Enum.reduce(providers, %{}, fn provider, acc ->
      module =
        case provider do
          :anthropic -> Anthropic
          :openai -> OpenAI
          :together -> Together
          :ollama -> Ollama
          _ -> Null
        end

      Map.put(acc, provider, module)
    end)
  end

  defp route_to_provider(episode, budget, state) do
    task_type = detect_task_type(episode)
    provider_order = get_provider_order(task_type, state)

    # Check rate limits with graceful fallback
    case check_rate_limit(episode.id) do
      :ok ->
        attempt_providers(episode, provider_order, budget, state)

      {:error, :rate_limited} ->
        {:error, "Rate limited for episode #{episode.id}"}
    end
  end

  defp check_rate_limit(episode_id) do
    try do
      RateLimiter.check(episode_id, :s4_llm)
    catch
      :exit, {:noproc, _} ->
        # RateLimiter not running, allow request
        :ok

      _ ->
        # Other errors, allow request
        :ok
    end
  end

  defp detect_task_type(%Episode{kind: kind}) when not is_nil(kind) do
    # Map episode kinds to task types
    case kind do
      :policy_review -> :reasoning
      :root_cause -> :reasoning
      :code_gen -> :code_generation
      :anomaly_detection -> :reasoning
      :compliance_check -> :reasoning
      :optimization -> :general
      :prediction -> :general
      :classification -> :fast
      _ -> :general
    end
  end

  defp detect_task_type(%Episode{data: data}) when is_binary(data) do
    # Analyze data content to detect task type
    content = String.downcase(data)

    cond do
      String.contains?(content, ["reason", "logic", "analyze", "think"]) -> :reasoning
      String.contains?(content, ["code", "function", "implement", "program"]) -> :code_generation
      String.contains?(content, ["quick", "simple", "fast"]) -> :fast
      true -> :general
    end
  end

  defp detect_task_type(_), do: :general

  defp get_provider_order(task_type, state) do
    # Get providers for this task type
    candidates = Map.get(@provider_rules, task_type, [:anthropic, :openai, :together, :ollama])

    # Filter to available providers and sort by circuit breaker state
    candidates
    |> Enum.filter(fn p -> Map.has_key?(state.providers, p) end)
    |> Enum.sort_by(fn p ->
      circuit_breaker_name = :"s4_provider_#{p}"

      breaker_state =
        try do
          AdaptiveCircuitBreaker.get_state(circuit_breaker_name)
        rescue
          _ -> %{state: :closed, health_score: 1.0}
        end

      # Sort by circuit breaker state and health score
      case breaker_state.state do
        # Prefer closed with high health
        :closed -> {0, 1.0 - breaker_state.health_score}
        :half_open -> {1, 1.0 - breaker_state.health_score}
        :open -> {2, 1.0 - breaker_state.health_score}
      end
    end)
  end

  defp attempt_providers(_episode, [], _budget, _state) do
    {:error, "No providers available"}
  end

  defp attempt_providers(episode, [provider | rest], budget, state) do
    module = Map.get(state.providers, provider)
    circuit_breaker_name = :"s4_provider_#{provider}"

    case AdaptiveCircuitBreaker.call(circuit_breaker_name, fn ->
           # Store context before calling provider
           Memory.store(episode.id, :system, "Routing to #{provider}", %{provider: provider})

           # Call the provider
           case module.analyze_episode(episode, budget: budget) do
             {:ok, result} ->
               Map.put(result, :provider, provider)

             error ->
               throw(error)
           end
         end) do
      {:ok, result} ->
        {:ok, result}

      {:error, :circuit_breaker_open} ->
        Logger.warning("Circuit breaker open for #{provider}, trying next")
        attempt_providers(episode, rest, budget, state)

      {:error, reason} ->
        Logger.warning("Provider #{provider} failed: #{inspect(reason)}, trying next")
        attempt_providers(episode, rest, budget, state)
    end
  end

  defp do_analyze(episode, opts, state) do
    # Store the episode in memory
    Memory.store(episode.id, :user, episode.data || "", %{})

    # Route to appropriate provider
    route_to_provider(episode, Keyword.get(opts, :budget, %{}), state)
  end

  defp update_stats(state, result) do
    stats = state.stats

    new_stats =
      case result do
        {:ok, %{provider: provider}} ->
          %{
            stats
            | total_requests: stats.total_requests + 1,
              successful: stats.successful + 1,
              by_provider: Map.update(stats.by_provider, provider, 1, &(&1 + 1))
          }

        {:error, _} ->
          %{stats | total_requests: stats.total_requests + 1, failed: stats.failed + 1}
      end

    %{state | stats: new_stats}
  end
end
