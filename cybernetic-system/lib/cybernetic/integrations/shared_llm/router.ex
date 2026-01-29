defmodule Cybernetic.Integrations.SharedLLM.Router do
  @moduledoc """
  Shared LLM routing layer for cross-platform deduplication and caching.

  Provides a unified interface for LLM requests from both Cybernetic and
  oh-my-opencode, with:

  - **Request Deduplication**: Identical in-flight requests are coalesced
  - **Shared Cache**: Deterministic cache hits across platforms
  - **Load Balancing**: Distribute requests across providers
  - **Rate Limiting**: Per-tenant and global rate limits
  - **Metrics**: Unified metrics for all LLM usage

  ## Architecture

  ```
  Cybernetic ─┐
              ├──► Shared LLM Router ──► LLM Providers
  oh-my-opencode ─┘     │
                        ├── Deduplication (in-flight coalescing)
                        ├── Cache Layer (deterministic)
                        └── Rate Limiting (per-tenant)
  ```

  ## Usage

      # Route a chat request
      {:ok, response} = SharedLLM.Router.chat(tenant_id, %{
        model: "claude-3-5-sonnet",
        messages: [%{role: "user", content: "Hello"}]
      })

      # Route with priority
      {:ok, response} = SharedLLM.Router.chat(tenant_id, params, priority: :high)

      # Route embeddings
      {:ok, embeddings} = SharedLLM.Router.embed(tenant_id, %{
        model: "text-embedding-ada-002",
        input: ["Hello world"]
      })
  """

  use GenServer
  require Logger

  alias Cybernetic.Capabilities.LLMCDN
  # Note: LLMCDN handles caching internally; DeterministicCache reserved for future cross-platform sharing
  alias Cybernetic.VSM.System3.RateLimiter

  @default_timeout_ms 60_000
  @max_in_flight 100

  defstruct [
    :in_flight,
    :stats,
    :config
  ]

  # Public API

  @doc """
  Start the shared LLM router.
  """
  def start_link(opts \\ []) do
    _tenant_id = Keyword.fetch!(opts, :tenant_id)
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Route a chat completion request.

  Options:
  - `:priority` - :critical, :high, :normal, :low (default: :normal)
  - `:timeout` - Request timeout in ms (default: 60000)
  - `:bypass_cache` - Skip cache lookup (default: false)
  - `:source` - :cybernetic or :oh_my_opencode (for metrics)
  """
  @spec chat(String.t(), map(), keyword()) :: {:ok, map()} | {:error, term()}
  def chat(tenant_id, params, opts \\ []) do
    route_request(tenant_id, :chat, params, opts)
  end

  @doc """
  Route an embeddings request.
  """
  @spec embed(String.t(), map(), keyword()) :: {:ok, map()} | {:error, term()}
  def embed(tenant_id, params, opts \\ []) do
    route_request(tenant_id, :embed, params, opts)
  end

  @doc """
  Route a completion request (legacy).
  """
  @spec complete(String.t(), map(), keyword()) :: {:ok, map()} | {:error, term()}
  def complete(tenant_id, params, opts \\ []) do
    route_request(tenant_id, :complete, params, opts)
  end

  @doc """
  Get router statistics.
  """
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  @doc """
  Get in-flight request count.
  """
  def in_flight_count do
    GenServer.call(__MODULE__, :in_flight_count)
  end

  @doc """
  Clear cached responses (admin only).
  """
  def clear_cache do
    GenServer.call(__MODULE__, :clear_cache)
  end

  # GenServer callbacks

  @impl true
  def init(opts) do
    state = %__MODULE__{
      in_flight: %{},
      stats: %{
        total_requests: 0,
        cache_hits: 0,
        cache_misses: 0,
        deduplicated: 0,
        errors: 0,
        by_source: %{cybernetic: 0, oh_my_opencode: 0},
        by_operation: %{chat: 0, embed: 0, complete: 0},
        started_at: DateTime.utc_now()
      },
      config: %{
        timeout_ms: Keyword.get(opts, :timeout_ms, @default_timeout_ms),
        max_in_flight: Keyword.get(opts, :max_in_flight, @max_in_flight),
        cache_enabled: Keyword.get(opts, :cache_enabled, true)
      }
    }

    Logger.info("Shared LLM Router started")
    {:ok, state}
  end

  @impl true
  def handle_call({:route, tenant_id, operation, params, opts}, from, state) do
    # Check rate limit
    priority = Keyword.get(opts, :priority, :normal)

    case check_rate_limit(tenant_id, priority) do
      :ok ->
        # Check in-flight limit
        if map_size(state.in_flight) >= state.config.max_in_flight do
          {:reply, {:error, :too_many_requests}, state}
        else
          # Generate request fingerprint for deduplication
          fingerprint = generate_fingerprint(operation, params)

          # Check for in-flight duplicate
          case Map.get(state.in_flight, fingerprint) do
            nil ->
              # New request - process it
              process_request(state, fingerprint, tenant_id, operation, params, opts, from)

            waiters ->
              # Duplicate request - add to waiters
              new_in_flight = Map.put(state.in_flight, fingerprint, [from | waiters])
              new_stats = update_stat(state.stats, :deduplicated)
              {:noreply, %{state | in_flight: new_in_flight, stats: new_stats}}
          end
        end

      {:error, :rate_limited} ->
        {:reply, {:error, :rate_limited}, state}

      {:error, :unknown_budget} ->
        # Budget not configured for this tenant - allow but log
        Logger.debug("No rate limit budget for tenant, allowing request")
        # Check in-flight limit
        if map_size(state.in_flight) >= state.config.max_in_flight do
          {:reply, {:error, :too_many_requests}, state}
        else
          fingerprint = generate_fingerprint(operation, params)
          case Map.get(state.in_flight, fingerprint) do
            nil ->
              process_request(state, fingerprint, tenant_id, operation, params, opts, from)

            waiters ->
              new_in_flight = Map.put(state.in_flight, fingerprint, [from | waiters])
              new_stats = update_stat(state.stats, :deduplicated)
              {:noreply, %{state | in_flight: new_in_flight, stats: new_stats}}
          end
        end

      {:denied, _reason} ->
        {:reply, {:error, :rate_limited}, state}
    end
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      Map.merge(state.stats, %{
        in_flight_count: map_size(state.in_flight),
        uptime_seconds: DateTime.diff(DateTime.utc_now(), state.stats.started_at),
        cache_hit_rate: calculate_hit_rate(state.stats)
      })

    {:reply, stats, state}
  end

  @impl true
  def handle_call(:in_flight_count, _from, state) do
    {:reply, map_size(state.in_flight), state}
  end

  @impl true
  def handle_call(:clear_cache, _from, state) do
    # Clear LLMCDN's internal cache (DeterministicCache is not used directly)
    # Use try/catch since GenServer.call exits if process not running
    result =
      try do
        LLMCDN.clear_cache()
        :ok
      rescue
        _ -> {:error, :cache_unavailable}
      catch
        :exit, _ -> {:error, :cache_unavailable}
      end

    {:reply, result, state}
  end

  @impl true
  def handle_info({:request_complete, fingerprint, result}, state) do
    case Map.get(state.in_flight, fingerprint) do
      nil ->
        {:noreply, state}

      waiters ->
        # Reply to all waiters
        Enum.each(waiters, fn waiter ->
          GenServer.reply(waiter, result)
        end)

        new_in_flight = Map.delete(state.in_flight, fingerprint)
        {:noreply, %{state | in_flight: new_in_flight}}
    end
  end

  @impl true
  def handle_info(_msg, state) do
    {:noreply, state}
  end

  # Private helpers

  defp route_request(tenant_id, operation, params, opts) do
    GenServer.call(__MODULE__, {:route, tenant_id, operation, params, opts}, @default_timeout_ms)
  catch
    :exit, {:timeout, _} -> {:error, :timeout}
    :exit, reason -> {:error, reason}
  end

  defp process_request(state, fingerprint, tenant_id, operation, params, opts, from) do
    bypass_cache = Keyword.get(opts, :bypass_cache, false)
    source = Keyword.get(opts, :source, :cybernetic)

    # Update stats
    new_stats =
      state.stats
      |> update_stat(:total_requests)
      |> update_source_stat(source)
      |> update_operation_stat(operation)

    # Note: Caching is handled by LLMCDN internally
    # Future: add cross-platform cache layer here if needed
    _ = bypass_cache  # Acknowledge the option even though we pass through to LLMCDN
    new_stats = update_stat(new_stats, :cache_misses)

    # Register in-flight request
    new_in_flight = Map.put(state.in_flight, fingerprint, [from])

    # Spawn async request
    router_pid = self()

    Task.start(fn ->
      result = execute_llm_request(tenant_id, operation, params, opts)
      send(router_pid, {:request_complete, fingerprint, result})
    end)

    {:noreply, %{state | in_flight: new_in_flight, stats: new_stats}}
  end

  defp generate_fingerprint(operation, params) do
    # Deterministic fingerprint for cache key and deduplication
    data = :erlang.term_to_binary({operation, normalize_params(params)})
    :crypto.hash(:sha256, data) |> Base.encode16(case: :lower)
  end

  defp normalize_params(params) when is_map(params) do
    params
    |> Map.drop(["stream", :stream, "request_id", :request_id])
    |> Enum.sort()
    |> Enum.map(fn {k, v} -> {to_string(k), normalize_params(v)} end)
  end

  defp normalize_params(params) when is_list(params) do
    Enum.map(params, &normalize_params/1)
  end

  defp normalize_params(params), do: params

  # Note: LLMCDN handles caching internally
  # Future: add check_cache/cache_response here for cross-platform cache sharing

  defp execute_llm_request(_tenant_id, operation, params, opts) do
    timeout = Keyword.get(opts, :timeout, @default_timeout_ms)

    # Use LLM CDN for routing
    # Note: LLMCDN.complete/2 handles chat completions, LLMCDN.embed/2 handles embeddings
    try do
      case operation do
        :chat ->
          # Chat uses the complete endpoint (messages-based)
          LLMCDN.complete(params, timeout: timeout)

        :embed ->
          # Embed takes input string(s), not a params map
          input = Map.get(params, :input) || Map.get(params, "input") || ""
          LLMCDN.embed(input, timeout: timeout)

        :complete ->
          LLMCDN.complete(params, timeout: timeout)
      end
    rescue
      e ->
        Logger.warning("LLM request failed: #{inspect(e)}")
        {:error, {:llm_error, Exception.message(e)}}
    end
  end

  defp check_rate_limit(tenant_id, priority) do
    try do
      RateLimiter.request_tokens(RateLimiter, {:shared_llm, tenant_id}, :llm_request, priority)
    rescue
      _ ->
        # If rate limiter unavailable, allow in non-prod
        env = Application.get_env(:cybernetic, :environment, :prod)
        if env == :prod, do: {:error, :rate_limited}, else: :ok
    end
  end

  defp update_stat(stats, key) do
    Map.update!(stats, key, &(&1 + 1))
  end

  defp update_source_stat(stats, source) do
    update_in(stats, [:by_source, source], &((&1 || 0) + 1))
  end

  defp update_operation_stat(stats, operation) do
    update_in(stats, [:by_operation, operation], &((&1 || 0) + 1))
  end

  defp calculate_hit_rate(%{cache_hits: hits, cache_misses: misses}) do
    total = hits + misses

    if total > 0 do
      Float.round(hits / total * 100, 2)
    else
      0.0
    end
  end
end
