defmodule Cybernetic.VSM.System4.Memory do
  @moduledoc """
  Conversation memory for S4 Intelligence Hub.

  Maintains context across episode interactions using an ETS-backed
  sliding window memory with semantic chunking and CRDT synchronization.
  """

  use GenServer
  require Logger

  @table_name :s4_memory
  # tokens
  @max_context_size 10_000
  @max_episodes 20
  # 1 hour
  @ttl_ms 3_600_000

  defstruct [
    :table,
    :contexts,
    :embeddings_cache,
    :stats
  ]

  @type t :: %__MODULE__{
          table: atom(),
          contexts: map(),
          embeddings_cache: map(),
          stats: map()
        }

  @type context_entry :: %{
          episode_id: String.t(),
          timestamp: integer(),
          role: :user | :assistant | :system,
          content: String.t(),
          tokens: integer(),
          metadata: map()
        }

  # Public API

  @doc """
  Start the memory service.
  """
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Store an episode interaction in memory.
  """
  def store(episode_id, role, content, metadata \\ %{}) do
    GenServer.cast(__MODULE__, {:store, episode_id, role, content, metadata})
  end

  @doc """
  Retrieve context for an episode, including related memories.
  """
  def get_context(episode_id, opts \\ []) do
    GenServer.call(__MODULE__, {:get_context, episode_id, opts})
  end

  @doc """
  Search memories by semantic similarity.
  """
  def search(query, opts \\ []) do
    GenServer.call(__MODULE__, {:search, query, opts})
  end

  @doc """
  Clear memory for a specific episode or all episodes.
  """
  def clear(episode_id \\ :all) do
    GenServer.call(__MODULE__, {:clear, episode_id})
  end

  @doc """
  Get memory statistics.
  """
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # GenServer callbacks

  @impl GenServer
  def init(_opts) do
    table =
      :ets.new(@table_name, [
        :set,
        :public,
        :named_table,
        {:read_concurrency, true},
        {:write_concurrency, true}
      ])

    state = %__MODULE__{
      table: table,
      contexts: %{},
      embeddings_cache: %{},
      stats: %{
        total_entries: 0,
        total_tokens: 0,
        cache_hits: 0,
        cache_misses: 0
      }
    }

    # Schedule cleanup
    schedule_cleanup()

    Logger.info("S4 Memory service initialized")
    {:ok, state}
  end

  @impl GenServer
  def handle_cast({:store, episode_id, role, content, metadata}, state) do
    timestamp = System.system_time(:millisecond)
    tokens = estimate_tokens(content)

    entry = %{
      episode_id: episode_id,
      timestamp: timestamp,
      role: role,
      content: content,
      tokens: tokens,
      metadata: metadata
    }

    # Store in ETS
    key = {episode_id, timestamp}
    :ets.insert(@table_name, {key, entry})

    # Update context tracking - append new entry to maintain chronological order
    context = Map.get(state.contexts, episode_id, [])
    new_context = manage_context_window(context ++ [entry])
    new_contexts = Map.put(state.contexts, episode_id, new_context)

    # Broadcast to CRDT for distributed sync
    broadcast_memory_update(episode_id, entry)

    # Update stats
    new_stats = %{
      state.stats
      | total_entries: state.stats.total_entries + 1,
        total_tokens: state.stats.total_tokens + tokens
    }

    {:noreply, %{state | contexts: new_contexts, stats: new_stats}}
  end

  @impl GenServer
  def handle_call({:get_context, episode_id, opts}, _from, state) do
    max_tokens = Keyword.get(opts, :max_tokens, @max_context_size)
    include_related = Keyword.get(opts, :include_related, true)

    # Get direct context
    direct_context = Map.get(state.contexts, episode_id, [])

    # Get related context if requested
    related_context =
      if include_related do
        find_related_context(episode_id, direct_context, state)
      else
        []
      end

    # Combine and trim to token limit
    combined = combine_contexts(direct_context, related_context, max_tokens)

    # Format for LLM consumption
    formatted = format_context_for_llm(combined)

    {:reply, {:ok, formatted}, update_cache_stats(state, true)}
  end

  @impl GenServer
  def handle_call({:search, query, opts}, _from, state) do
    limit = Keyword.get(opts, :limit, 5)
    threshold = Keyword.get(opts, :threshold, 0.7)

    # Generate embedding for query (would use actual embedding service)
    query_embedding = generate_embedding(query)

    # Search all memories
    matches = search_by_embedding(query_embedding, threshold, limit, state)

    {:reply, {:ok, matches}, update_cache_stats(state, false)}
  end

  @impl GenServer
  def handle_call({:clear, episode_id}, _from, state) do
    case episode_id do
      :all ->
        :ets.delete_all_objects(@table_name)
        {:reply, :ok, %{state | contexts: %{}, embeddings_cache: %{}}}

      episode_id ->
        # Clear from ETS
        :ets.match_delete(@table_name, {{{episode_id, :_}, :_}})

        # Clear from state
        new_contexts = Map.delete(state.contexts, episode_id)

        new_cache =
          Map.reject(state.embeddings_cache, fn {k, _} ->
            String.starts_with?(k, episode_id)
          end)

        {:reply, :ok, %{state | contexts: new_contexts, embeddings_cache: new_cache}}
    end
  end

  @impl GenServer
  def handle_call(:stats, _from, state) do
    stats =
      Map.merge(state.stats, %{
        active_episodes: map_size(state.contexts),
        cache_size: map_size(state.embeddings_cache),
        ets_size: :ets.info(@table_name, :size)
      })

    {:reply, stats, state}
  end

  @impl GenServer
  def handle_info(:cleanup, state) do
    # Clean up old entries
    cutoff = System.system_time(:millisecond) - @ttl_ms

    # Remove from ETS
    :ets.select_delete(@table_name, [
      {{{:_, :"$1"}, %{timestamp: :"$2"}}, [{:<, :"$2", cutoff}], [true]}
    ])

    # Clean contexts
    new_contexts =
      Enum.reduce(state.contexts, %{}, fn {episode_id, entries}, acc ->
        recent = Enum.filter(entries, &(&1.timestamp > cutoff))
        if recent != [], do: Map.put(acc, episode_id, recent), else: acc
      end)

    schedule_cleanup()
    {:noreply, %{state | contexts: new_contexts}}
  end

  # Private functions

  defp manage_context_window(context) do
    # Context is already in chronological order
    # Take the most recent messages (from the end)
    context
    |> Enum.take(-@max_episodes)
    |> trim_to_token_limit(@max_context_size)
  end

  defp trim_to_token_limit(entries, max_tokens) do
    {kept, _} =
      Enum.reduce(entries, {[], 0}, fn entry, {acc, tokens} ->
        new_tokens = tokens + entry.tokens

        if new_tokens <= max_tokens do
          {[entry | acc], new_tokens}
        else
          {acc, tokens}
        end
      end)

    Enum.reverse(kept)
  end

  defp find_related_context(_episode_id, direct_context, state) do
    # Use episode metadata to find related episodes
    # This would use semantic search in production

    related_ids = extract_related_episodes(direct_context)

    Enum.flat_map(related_ids, fn id ->
      Map.get(state.contexts, id, [])
      # Take top 3 from each related
      |> Enum.take(3)
    end)
  end

  defp extract_related_episodes(context) do
    # Extract episode references from metadata
    context
    |> Enum.flat_map(fn entry ->
      Map.get(entry.metadata, :references, [])
    end)
    |> Enum.uniq()
    |> Enum.take(5)
  end

  defp combine_contexts(direct, related, max_tokens) do
    # Prioritize direct context, add related if space
    direct_tokens = Enum.sum(Enum.map(direct, & &1.tokens))
    remaining = max_tokens - direct_tokens

    if remaining > 0 do
      related_trimmed = trim_to_token_limit(related, remaining)
      direct ++ related_trimmed
    else
      trim_to_token_limit(direct, max_tokens)
    end
  end

  defp format_context_for_llm(entries) do
    # Entries are already in chronological order
    entries
    |> Enum.group_by(& &1.episode_id)
    |> Enum.map(fn {episode_id, episode_entries} ->
      messages =
        Enum.map(episode_entries, fn entry ->
          %{
            role: entry.role,
            content: entry.content,
            timestamp: entry.timestamp
          }
        end)

      %{
        episode_id: episode_id,
        messages: messages
      }
    end)
  end

  defp generate_embedding(_text) do
    # Placeholder - would call embedding service
    # Could use OpenAI, Together, or local Ollama
    Enum.map(1..768, fn _ -> :rand.uniform() end)
  end

  defp search_by_embedding(_query_embedding, _threshold, limit, _state) do
    # Placeholder for semantic search
    # Would compute cosine similarity with cached embeddings

    all_entries = :ets.tab2list(@table_name)

    all_entries
    |> Enum.map(fn {_key, entry} -> entry end)
    |> Enum.take(limit)
  end

  defp estimate_tokens(content) when is_binary(content) do
    # Rough estimate: ~4 characters per token
    div(String.length(content), 4)
  end

  defp estimate_tokens(_), do: 0

  defp broadcast_memory_update(episode_id, entry) do
    # Broadcast to CRDT for distributed sync
    _message = %{
      type: :memory_update,
      episode_id: episode_id,
      entry: entry,
      node: node()
    }

    # TODO: Implement CRDT integration when ContextGraph.add_event/3 is available
    # Cybernetic.Core.CRDT.ContextGraph.add_event(
    #   "s4_memory",
    #   episode_id,
    #   message
    # )
    :ok
  rescue
    # Fail silently if CRDT not available
    _ -> :ok
  end

  defp update_cache_stats(state, hit?) do
    if hit? do
      put_in(state.stats.cache_hits, state.stats.cache_hits + 1)
    else
      put_in(state.stats.cache_misses, state.stats.cache_misses + 1)
    end
  end

  defp schedule_cleanup do
    # Every minute
    Process.send_after(self(), :cleanup, 60_000)
  end
end
