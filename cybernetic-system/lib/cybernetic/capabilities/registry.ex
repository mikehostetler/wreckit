defmodule Cybernetic.Capabilities.Registry do
  @moduledoc """
  Capability registry for managing and discovering capabilities.

  Provides registration, lookup, and semantic discovery of capabilities
  using embeddings for similarity matching.

  ## Configuration

      config :cybernetic, Cybernetic.Capabilities.Registry,
        embedding_model: "text-embedding-3-small",
        match_threshold: 0.8,
        max_results: 10

  ## Example

      # Register a capability
      {:ok, cap} = Registry.register(%{
        name: "code_review",
        description: "Analyzes code for quality and best practices",
        provider: MyProvider,
        inputs: [:code, :language],
        outputs: [:review, :suggestions]
      })

      # Discover capabilities by query
      {:ok, results} = Registry.discover("review my code for bugs")

      # Match by embedding similarity
      {:ok, matches} = Registry.match_semantic(embedding, threshold: 0.85)
  """
  use GenServer

  require Logger

  alias Cybernetic.Capabilities.Validation

  @type capability :: %{
          id: String.t(),
          name: String.t(),
          description: String.t(),
          embedding: [float()] | nil,
          inputs: [atom()],
          outputs: [atom()],
          provider: module(),
          version: String.t(),
          metadata: map(),
          registered_at: DateTime.t()
        }

  @type discover_opts :: [
          threshold: float(),
          limit: pos_integer(),
          filter: (capability() -> boolean())
        ]

  @telemetry [:cybernetic, :capabilities, :registry]

  # Client API

  @doc "Start the registry GenServer"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Register a new capability"
  @spec register(map()) :: {:ok, capability()} | {:error, term()}
  def register(capability_attrs) do
    GenServer.call(__MODULE__, {:register, capability_attrs})
  end

  @doc "Unregister a capability by ID"
  @spec unregister(String.t()) :: :ok | {:error, :not_found}
  def unregister(capability_id) do
    GenServer.call(__MODULE__, {:unregister, capability_id})
  end

  @doc "Get a capability by ID"
  @spec get(String.t()) :: {:ok, capability()} | {:error, :not_found}
  def get(capability_id) do
    GenServer.call(__MODULE__, {:get, capability_id})
  end

  @doc "Get a capability by name"
  @spec get_by_name(String.t()) :: {:ok, capability()} | {:error, :not_found}
  def get_by_name(name) do
    GenServer.call(__MODULE__, {:get_by_name, name})
  end

  @doc "List all registered capabilities"
  @spec list() :: [capability()]
  def list do
    GenServer.call(__MODULE__, :list)
  end

  @doc "Discover capabilities matching a query"
  @spec discover(String.t(), discover_opts()) :: {:ok, [capability()]} | {:error, term()}
  def discover(query, opts \\ []) do
    GenServer.call(__MODULE__, {:discover, query, opts}, :timer.seconds(30))
  end

  @doc "Match capabilities by embedding similarity"
  @spec match_semantic([float()], discover_opts()) :: {:ok, [capability()]}
  def match_semantic(embedding, opts \\ []) do
    GenServer.call(__MODULE__, {:match_semantic, embedding, opts})
  end

  @doc "Update capability embedding"
  @spec update_embedding(String.t(), [float()]) :: :ok | {:error, :not_found}
  def update_embedding(capability_id, embedding) do
    GenServer.call(__MODULE__, {:update_embedding, capability_id, embedding})
  end

  @doc "Get registry statistics"
  @spec stats() :: map()
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    Logger.info("Capability Registry starting")

    state = %{
      capabilities: %{},
      name_index: %{},
      embedding_model: Keyword.get(opts, :embedding_model, "text-embedding-3-small"),
      match_threshold: Keyword.get(opts, :match_threshold, 0.8),
      max_results: Keyword.get(opts, :max_results, 10),
      stats: %{
        registrations: 0,
        discoveries: 0,
        matches: 0,
        started_at: DateTime.utc_now()
      }
    }

    {:ok, state}
  end

  @impl true
  def handle_call({:register, attrs}, _from, state) do
    start_time = System.monotonic_time(:millisecond)

    case build_capability(attrs) do
      {:ok, capability} ->
        # Check for duplicate name
        if Map.has_key?(state.name_index, capability.name) do
          {:reply, {:error, :name_already_registered}, state}
        else
          new_state = %{
            state
            | capabilities: Map.put(state.capabilities, capability.id, capability),
              name_index: Map.put(state.name_index, capability.name, capability.id),
              stats: Map.update!(state.stats, :registrations, &(&1 + 1))
          }

          emit_telemetry(:register, start_time, %{name: capability.name})
          Logger.info("Capability registered", name: capability.name, id: capability.id)

          {:reply, {:ok, capability}, new_state}
        end

      {:error, _reason} = error ->
        {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:unregister, id}, _from, state) do
    case Map.get(state.capabilities, id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      capability ->
        new_state = %{
          state
          | capabilities: Map.delete(state.capabilities, id),
            name_index: Map.delete(state.name_index, capability.name)
        }

        Logger.info("Capability unregistered", name: capability.name, id: id)
        {:reply, :ok, new_state}
    end
  end

  @impl true
  def handle_call({:get, id}, _from, state) do
    case Map.get(state.capabilities, id) do
      nil -> {:reply, {:error, :not_found}, state}
      capability -> {:reply, {:ok, capability}, state}
    end
  end

  @impl true
  def handle_call({:get_by_name, name}, _from, state) do
    case Map.get(state.name_index, name) do
      nil ->
        {:reply, {:error, :not_found}, state}

      id ->
        capability = Map.get(state.capabilities, id)
        {:reply, {:ok, capability}, state}
    end
  end

  @impl true
  def handle_call(:list, _from, state) do
    capabilities = Map.values(state.capabilities)
    {:reply, capabilities, state}
  end

  @impl true
  def handle_call({:discover, query, opts}, _from, state) do
    start_time = System.monotonic_time(:millisecond)
    threshold = Keyword.get(opts, :threshold, state.match_threshold)
    limit = Keyword.get(opts, :limit, state.max_results)
    filter_fn = Keyword.get(opts, :filter, fn _ -> true end)

    result =
      case generate_embedding(query, state.embedding_model) do
        {:ok, query_embedding} ->
          matches =
            state.capabilities
            |> Map.values()
            |> Enum.filter(filter_fn)
            |> Enum.filter(&(&1.embedding != nil))
            |> Enum.map(fn cap ->
              similarity = cosine_similarity(query_embedding, cap.embedding)
              {cap, similarity}
            end)
            |> Enum.filter(fn {_cap, sim} -> sim >= threshold end)
            |> Enum.sort_by(fn {_cap, sim} -> sim end, :desc)
            |> Enum.take(limit)
            |> Enum.map(fn {cap, _sim} -> cap end)

          {:ok, matches}

        {:error, reason} ->
          # Fall back to keyword matching
          Logger.warning("Embedding failed, using keyword matching", reason: reason)
          matches = keyword_match(query, state.capabilities, limit, filter_fn)
          {:ok, matches}
      end

    new_stats = Map.update!(state.stats, :discoveries, &(&1 + 1))
    emit_telemetry(:discover, start_time, %{query: query, results: length(elem(result, 1))})

    {:reply, result, %{state | stats: new_stats}}
  end

  @impl true
  def handle_call({:match_semantic, embedding, opts}, _from, state) do
    start_time = System.monotonic_time(:millisecond)
    threshold = Keyword.get(opts, :threshold, state.match_threshold)
    limit = Keyword.get(opts, :limit, state.max_results)

    matches =
      state.capabilities
      |> Map.values()
      |> Enum.filter(&(&1.embedding != nil))
      |> Enum.map(fn cap ->
        similarity = cosine_similarity(embedding, cap.embedding)
        {cap, similarity}
      end)
      |> Enum.filter(fn {_cap, sim} -> sim >= threshold end)
      |> Enum.sort_by(fn {_cap, sim} -> sim end, :desc)
      |> Enum.take(limit)
      |> Enum.map(fn {cap, _sim} -> cap end)

    new_stats = Map.update!(state.stats, :matches, &(&1 + 1))
    emit_telemetry(:match, start_time, %{results: length(matches)})

    {:reply, {:ok, matches}, %{state | stats: new_stats}}
  end

  @impl true
  def handle_call({:update_embedding, id, embedding}, _from, state) do
    case Map.get(state.capabilities, id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      capability ->
        updated = %{capability | embedding: embedding}
        new_capabilities = Map.put(state.capabilities, id, updated)
        {:reply, :ok, %{state | capabilities: new_capabilities}}
    end
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      Map.merge(state.stats, %{
        capability_count: map_size(state.capabilities),
        with_embeddings: Enum.count(state.capabilities, fn {_, c} -> c.embedding != nil end)
      })

    {:reply, stats, state}
  end

  # Private Functions

  @spec build_capability(map()) :: {:ok, capability()} | {:error, term()}
  defp build_capability(attrs) do
    with :ok <- Validation.validate_required(attrs, [:name, :description, :provider]),
         :ok <- Validation.validate_name(attrs[:name]),
         :ok <- Validation.validate_description(attrs[:description]),
         :ok <- Validation.validate_provider(attrs[:provider]),
         :ok <- validate_metadata_size(attrs[:metadata]) do
      capability = %{
        id: generate_id(),
        name: attrs[:name],
        description: attrs[:description],
        embedding: attrs[:embedding],
        inputs: attrs[:inputs] || [],
        outputs: attrs[:outputs] || [],
        provider: attrs[:provider],
        version: attrs[:version] || "1.0.0",
        metadata: attrs[:metadata] || %{},
        registered_at: DateTime.utc_now()
      }

      {:ok, capability}
    end
  end

  @spec validate_metadata_size(term()) :: :ok | {:error, :metadata_too_large}
  defp validate_metadata_size(nil), do: :ok

  defp validate_metadata_size(metadata) when is_map(metadata) do
    case Validation.validate_context_size(metadata) do
      :ok -> :ok
      {:error, :context_too_large} -> {:error, :metadata_too_large}
    end
  end

  defp validate_metadata_size(_), do: :ok

  @spec generate_id() :: String.t()
  defp generate_id do
    UUID.uuid4()
  end

  @spec generate_embedding(String.t(), String.t()) :: {:ok, [float()]} | {:error, term()}
  defp generate_embedding(text, _model) do
    # Placeholder - would use ReqLLM in production
    # For now, generate a simple hash-based pseudo-embedding
    try do
      hash = :crypto.hash(:sha256, text)

      embedding =
        hash
        |> :binary.bin_to_list()
        |> Enum.take(16)
        |> Enum.map(&(&1 / 255.0))

      {:ok, embedding}
    rescue
      e -> {:error, Exception.message(e)}
    end
  end

  @spec cosine_similarity([float()], [float()]) :: float()
  defp cosine_similarity(a, b) when length(a) != length(b), do: 0.0

  defp cosine_similarity(a, b) do
    dot_product = Enum.zip(a, b) |> Enum.map(fn {x, y} -> x * y end) |> Enum.sum()
    magnitude_a = :math.sqrt(Enum.map(a, &(&1 * &1)) |> Enum.sum())
    magnitude_b = :math.sqrt(Enum.map(b, &(&1 * &1)) |> Enum.sum())

    if magnitude_a == 0.0 or magnitude_b == 0.0 do
      0.0
    else
      dot_product / (magnitude_a * magnitude_b)
    end
  end

  @spec keyword_match(String.t(), map(), pos_integer(), (capability() -> boolean())) :: [
          capability()
        ]
  defp keyword_match(query, capabilities, limit, filter_fn) do
    query_words =
      query
      |> String.downcase()
      |> String.split(~r/\s+/)
      |> MapSet.new()

    capabilities
    |> Map.values()
    |> Enum.filter(filter_fn)
    |> Enum.map(fn cap ->
      cap_words =
        "#{cap.name} #{cap.description}"
        |> String.downcase()
        |> String.split(~r/\s+/)
        |> MapSet.new()

      overlap = MapSet.intersection(query_words, cap_words) |> MapSet.size()
      {cap, overlap}
    end)
    |> Enum.filter(fn {_cap, overlap} -> overlap > 0 end)
    |> Enum.sort_by(fn {_cap, overlap} -> overlap end, :desc)
    |> Enum.take(limit)
    |> Enum.map(fn {cap, _overlap} -> cap end)
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
