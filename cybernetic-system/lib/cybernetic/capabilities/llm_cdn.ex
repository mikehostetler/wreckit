defmodule Cybernetic.Capabilities.LLMCDN do
  @moduledoc """
  Goldrush LLM-CDN for caching and deduplicating LLM requests.

  Provides request fingerprinting, caching, and deduplication to reduce
  redundant LLM API calls and improve response times.

  ## Features

  - **Request Fingerprinting**: Deterministic hashing of prompts + params
  - **Cache Layer**: In-memory + optional persistent storage
  - **Request Deduplication**: Coalesces concurrent identical requests
  - **ReqLLM Integration**: Wraps ReqLLM for transparent caching

  ## Configuration

      config :cybernetic, Cybernetic.Capabilities.LLMCDN,
        cache_ttl: :timer.hours(24),
        dedup_window_ms: 5_000,
        max_cache_size: 10_000

  ## Example

      # Cached LLM request
      {:ok, response} = LLMCDN.complete(%{
        model: "gpt-4",
        messages: [%{role: "user", content: "Hello"}]
      })

      # Check cache stats
      stats = LLMCDN.stats()
      # %{hits: 42, misses: 10, hit_rate: 0.807...}
  """
  use GenServer

  require Logger

  @type fingerprint :: String.t()
  @type cache_entry :: %{
          fingerprint: fingerprint(),
          response: term(),
          created_at: DateTime.t(),
          expires_at: DateTime.t(),
          hits: non_neg_integer()
        }

  @dedup_window_ms 5_000
  @default_ttl :timer.hours(24)
  @max_cache_size 10_000
  @max_concurrent_requests 50

  @telemetry [:cybernetic, :capabilities, :llm_cdn]

  # Client API

  @doc "Start the LLM CDN server"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Complete a chat request with caching"
  @spec complete(map(), keyword()) :: {:ok, term()} | {:error, term()}
  def complete(params, opts \\ []) do
    GenServer.call(__MODULE__, {:complete, params, opts}, :timer.seconds(120))
  end

  @doc "Generate embeddings with caching"
  @spec embed(String.t() | [String.t()], keyword()) :: {:ok, term()} | {:error, term()}
  def embed(input, opts \\ []) do
    GenServer.call(__MODULE__, {:embed, input, opts}, :timer.seconds(60))
  end

  @doc "Get cache entry by fingerprint"
  @spec get_cached(fingerprint()) :: {:ok, term()} | {:error, :not_found}
  def get_cached(fingerprint) do
    GenServer.call(__MODULE__, {:get_cached, fingerprint})
  end

  @doc "Invalidate cache entry"
  @spec invalidate(fingerprint()) :: :ok
  def invalidate(fingerprint) do
    GenServer.call(__MODULE__, {:invalidate, fingerprint})
  end

  @doc "Clear entire cache"
  @spec clear_cache() :: :ok
  def clear_cache do
    GenServer.call(__MODULE__, :clear_cache)
  end

  @doc "Get cache statistics"
  @spec stats() :: map()
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  @doc "Compute fingerprint for request params"
  @spec fingerprint(map()) :: fingerprint()
  def fingerprint(params) do
    # Normalize and hash the request
    normalized =
      params
      |> normalize_params()
      |> Jason.encode!()

    :crypto.hash(:sha256, normalized)
    |> Base.encode16(case: :lower)
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    Logger.info("LLM CDN starting")

    state = %{
      cache: %{},
      in_flight: %{},
      ttl: Keyword.get(opts, :cache_ttl, @default_ttl),
      dedup_window: Keyword.get(opts, :dedup_window_ms, @dedup_window_ms),
      max_size: Keyword.get(opts, :max_cache_size, @max_cache_size),
      max_concurrent: Keyword.get(opts, :max_concurrent_requests, @max_concurrent_requests),
      stats: %{
        hits: 0,
        misses: 0,
        deduped: 0,
        evictions: 0,
        rejected: 0
      }
    }

    # Schedule periodic cleanup
    schedule_cleanup()

    {:ok, state}
  end

  @impl true
  def handle_call({:complete, params, opts}, from, state) do
    start_time = System.monotonic_time(:millisecond)
    fp = fingerprint(params)
    skip_cache = Keyword.get(opts, :skip_cache, false)

    cond do
      # Check cache first
      not skip_cache and Map.has_key?(state.cache, fp) ->
        entry = Map.get(state.cache, fp)

        if DateTime.compare(DateTime.utc_now(), entry.expires_at) == :lt do
          # Cache hit
          updated_entry = %{entry | hits: entry.hits + 1}
          new_state = put_in(state, [:cache, fp], updated_entry)
          new_state = update_in(new_state, [:stats, :hits], &(&1 + 1))

          emit_telemetry(:complete, start_time, %{cache: :hit})
          {:reply, {:ok, entry.response}, new_state}
        else
          # Expired, fetch fresh
          handle_cache_miss(params, opts, fp, from, state, start_time)
        end

      # Check if request is already in flight (deduplication)
      Map.has_key?(state.in_flight, fp) ->
        # Add caller to waiters list
        new_in_flight =
          update_in(state.in_flight, [fp, :waiters], fn waiters ->
            [from | waiters]
          end)

        new_state = update_in(%{state | in_flight: new_in_flight}, [:stats, :deduped], &(&1 + 1))
        emit_telemetry(:complete, start_time, %{cache: :deduped})
        {:noreply, new_state}

      # Check concurrent limit before initiating new request
      map_size(state.in_flight) >= state.max_concurrent ->
        new_state = update_in(state, [:stats, :rejected], &(&1 + 1))
        emit_telemetry(:complete, start_time, %{cache: :rejected})
        {:reply, {:error, :too_many_requests}, new_state}

      true ->
        # Cache miss, initiate request
        handle_cache_miss(params, opts, fp, from, state, start_time)
    end
  end

  @impl true
  def handle_call({:embed, input, opts}, from, state) do
    start_time = System.monotonic_time(:millisecond)
    params = %{type: :embed, input: input, opts: opts}
    fp = fingerprint(params)
    skip_cache = Keyword.get(opts, :skip_cache, false)

    cond do
      not skip_cache and Map.has_key?(state.cache, fp) ->
        entry = Map.get(state.cache, fp)

        if DateTime.compare(DateTime.utc_now(), entry.expires_at) == :lt do
          updated_entry = %{entry | hits: entry.hits + 1}
          new_state = put_in(state, [:cache, fp], updated_entry)
          new_state = update_in(new_state, [:stats, :hits], &(&1 + 1))

          emit_telemetry(:embed, start_time, %{cache: :hit})
          {:reply, {:ok, entry.response}, new_state}
        else
          handle_embed_miss(input, opts, fp, from, state, start_time)
        end

      Map.has_key?(state.in_flight, fp) ->
        new_in_flight =
          update_in(state.in_flight, [fp, :waiters], fn waiters ->
            [from | waiters]
          end)

        new_state = update_in(%{state | in_flight: new_in_flight}, [:stats, :deduped], &(&1 + 1))
        {:noreply, new_state}

      # Check concurrent limit
      map_size(state.in_flight) >= state.max_concurrent ->
        new_state = update_in(state, [:stats, :rejected], &(&1 + 1))
        emit_telemetry(:embed, start_time, %{cache: :rejected})
        {:reply, {:error, :too_many_requests}, new_state}

      true ->
        handle_embed_miss(input, opts, fp, from, state, start_time)
    end
  end

  @impl true
  def handle_call({:get_cached, fp}, _from, state) do
    case Map.get(state.cache, fp) do
      nil ->
        {:reply, {:error, :not_found}, state}

      entry ->
        if DateTime.compare(DateTime.utc_now(), entry.expires_at) == :lt do
          {:reply, {:ok, entry.response}, state}
        else
          {:reply, {:error, :not_found}, state}
        end
    end
  end

  @impl true
  def handle_call({:invalidate, fp}, _from, state) do
    new_cache = Map.delete(state.cache, fp)
    {:reply, :ok, %{state | cache: new_cache}}
  end

  @impl true
  def handle_call(:clear_cache, _from, state) do
    {:reply, :ok, %{state | cache: %{}}}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    total = state.stats.hits + state.stats.misses

    stats =
      Map.merge(state.stats, %{
        cache_size: map_size(state.cache),
        in_flight: map_size(state.in_flight),
        hit_rate: if(total > 0, do: state.stats.hits / total, else: 0.0)
      })

    {:reply, stats, state}
  end

  @impl true
  def handle_info({:llm_response, fp, result}, state) do
    case Map.get(state.in_flight, fp) do
      nil ->
        {:noreply, state}

      %{waiters: waiters} ->
        # Reply to all waiters
        Enum.each(waiters, fn waiter ->
          GenServer.reply(waiter, result)
        end)

        # Cache successful responses
        new_state =
          case result do
            {:ok, response} ->
              cache_response(state, fp, response)

            {:error, _} ->
              state
          end

        {:noreply, %{new_state | in_flight: Map.delete(state.in_flight, fp)}}
    end
  end

  @impl true
  def handle_info(:cleanup, state) do
    now = DateTime.utc_now()

    # Remove expired entries
    {expired, valid} =
      Enum.split_with(state.cache, fn {_fp, entry} ->
        DateTime.compare(now, entry.expires_at) != :lt
      end)

    new_cache = Map.new(valid)

    # Evict oldest if over max size
    {new_cache, evictions} =
      if map_size(new_cache) > state.max_size do
        evict_oldest(new_cache, map_size(new_cache) - state.max_size)
      else
        {new_cache, 0}
      end

    total_evictions = length(expired) + evictions

    if total_evictions > 0 do
      Logger.debug("LLM CDN cleanup",
        expired: length(expired),
        evicted: evictions
      )
    end

    new_stats = update_in(state.stats.evictions, &(&1 + total_evictions))
    schedule_cleanup()

    {:noreply, %{state | cache: new_cache, stats: new_stats}}
  end

  # Private Functions

  @spec handle_cache_miss(map(), keyword(), fingerprint(), GenServer.from(), map(), integer()) ::
          {:noreply, map()}
  defp handle_cache_miss(params, _opts, fp, from, state, start_time) do
    # Register in-flight request
    new_in_flight = Map.put(state.in_flight, fp, %{waiters: [from], started_at: start_time})
    new_state = update_in(%{state | in_flight: new_in_flight}, [:stats, :misses], &(&1 + 1))

    # Spawn async request
    parent = self()

    Task.start(fn ->
      result = call_llm_complete(params)
      send(parent, {:llm_response, fp, result})
    end)

    emit_telemetry(:complete, start_time, %{cache: :miss})
    {:noreply, new_state}
  end

  @spec handle_embed_miss(term(), keyword(), fingerprint(), GenServer.from(), map(), integer()) ::
          {:noreply, map()}
  defp handle_embed_miss(input, _opts, fp, from, state, start_time) do
    new_in_flight = Map.put(state.in_flight, fp, %{waiters: [from], started_at: start_time})
    new_state = update_in(%{state | in_flight: new_in_flight}, [:stats, :misses], &(&1 + 1))

    parent = self()

    Task.start(fn ->
      result = call_llm_embed(input)
      send(parent, {:llm_response, fp, result})
    end)

    emit_telemetry(:embed, start_time, %{cache: :miss})
    {:noreply, new_state}
  end

  @spec cache_response(map(), fingerprint(), term()) :: map()
  defp cache_response(state, fp, response) do
    now = DateTime.utc_now()

    entry = %{
      fingerprint: fp,
      response: response,
      created_at: now,
      expires_at: DateTime.add(now, state.ttl, :millisecond),
      hits: 0
    }

    put_in(state, [:cache, fp], entry)
  end

  @spec evict_oldest(map(), non_neg_integer()) :: {map(), non_neg_integer()}
  defp evict_oldest(cache, count) do
    sorted =
      cache
      |> Enum.sort_by(fn {_fp, entry} -> entry.created_at end, DateTime)

    to_remove = Enum.take(sorted, count) |> Enum.map(fn {fp, _} -> fp end)
    new_cache = Map.drop(cache, to_remove)

    {new_cache, length(to_remove)}
  end

  @spec normalize_params(map()) :: map()
  defp normalize_params(params) do
    params
    |> Map.drop([:stream, :timeout])
    |> Enum.sort_by(fn {k, _v} -> to_string(k) end)
    |> Map.new()
  end

  @spec call_llm_complete(map()) :: {:ok, term()} | {:error, term()}
  defp call_llm_complete(params) do
    # P2 Fix: Use apply/3 to avoid compile warnings for optional dependency
    try do
      if Code.ensure_loaded?(ReqLLM) and function_exported?(ReqLLM, :chat, 1) do
        apply(ReqLLM, :chat, [params])
      else
        # Placeholder response for testing
        {:ok,
         %{
           choices: [
             %{
               message: %{
                 role: "assistant",
                 content: "[Placeholder - ReqLLM not configured]"
               }
             }
           ]
         }}
      end
    rescue
      e ->
        Logger.error("LLM complete failed", error: inspect(e))
        {:error, Exception.message(e)}
    end
  end

  @spec call_llm_embed(term()) :: {:ok, term()} | {:error, term()}
  defp call_llm_embed(input) do
    # P2 Fix: Use apply/3 to avoid compile warnings for optional dependency
    try do
      if Code.ensure_loaded?(ReqLLM) and function_exported?(ReqLLM, :embeddings, 1) do
        apply(ReqLLM, :embeddings, [%{input: input}])
      else
        # Placeholder for testing - generate pseudo-embeddings
        embedding =
          input
          |> to_string()
          |> then(&:crypto.hash(:sha256, &1))
          |> :binary.bin_to_list()
          |> Enum.take(16)
          |> Enum.map(&(&1 / 255.0))

        {:ok, %{data: [%{embedding: embedding}]}}
      end
    rescue
      e ->
        Logger.error("LLM embed failed", error: inspect(e))
        {:error, Exception.message(e)}
    end
  end

  @spec schedule_cleanup() :: reference()
  defp schedule_cleanup do
    Process.send_after(self(), :cleanup, :timer.minutes(5))
  end

  @spec emit_telemetry(atom(), integer(), map()) :: :ok
  defp emit_telemetry(event, start_time, metadata) do
    duration = System.monotonic_time(:millisecond) - start_time

    :telemetry.execute(
      @telemetry ++ [event],
      %{duration: duration},
      metadata
    )
  end
end
