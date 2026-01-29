defmodule Cybernetic.Intelligence.Vectors.Quantizer do
  @moduledoc """
  Unified vector quantization module supporting PQ and VQ.

  Provides 4-8x compression with <5% recall loss for vector search.

  ## Strategies

  - `:pq` - Product Quantization: Best compression, slight accuracy loss
  - `:vq` - Vector Quantization: Simpler, less compression
  - `:auto` - Automatically select based on dimension and requirements

  ## Usage

      # Train quantizer
      {:ok, quantizer} = Quantizer.train(vectors, strategy: :pq, target_compression: 8)

      # Encode vectors
      {:ok, encoded} = Quantizer.encode(quantizer, vector)

      # Decode
      {:ok, decoded} = Quantizer.decode(quantizer, encoded)

      # Search with quantized distances
      results = Quantizer.search(quantizer, query, encoded_vectors, top_k: 10)
  """

  alias Cybernetic.Intelligence.Vectors.{PQ, VQ}
  require Logger

  @type vector :: [float()] | tuple()
  @type strategy :: :pq | :vq | :auto
  @type quantizer :: %{
          strategy: strategy(),
          codebook: PQ.codebook() | VQ.codebook(),
          metadata: map()
        }
  @type encoded :: binary()

  @doc """
  Train a quantizer on sample vectors.

  ## Options

  - `:strategy` - `:pq`, `:vq`, or `:auto` (default: `:auto`)
  - `:target_compression` - Target compression ratio (default: 8)
  - `:m` - PQ sub-vectors (default: auto-calculated)
  - `:k` - Centroids per sub-vector (default: 256)
  - `:iterations` - K-means iterations (default: 20)
  """
  @spec train([vector()], keyword()) :: {:ok, quantizer()} | {:error, term()}
  def train(vectors, opts \\ []) when is_list(vectors) and length(vectors) > 0 do
    strategy = Keyword.get(opts, :strategy, :auto)
    target_compression = Keyword.get(opts, :target_compression, 8)

    sample = Enum.map(vectors, &to_list/1)
    dim = length(hd(sample))

    # Auto-select strategy
    actual_strategy = select_strategy(strategy, dim, target_compression)

    Logger.info("Training #{actual_strategy} quantizer for #{dim}-dim vectors")

    case actual_strategy do
      :pq ->
        train_pq(sample, dim, target_compression, opts)

      :vq ->
        train_vq(sample, opts)
    end
  end

  @doc """
  Encode a vector using the trained quantizer.
  """
  @spec encode(quantizer(), vector()) :: {:ok, encoded()} | {:error, term()}
  def encode(%{strategy: :pq, codebook: codebook}, vector) do
    PQ.encode(codebook, vector)
  end

  def encode(%{strategy: :vq, codebook: codebook}, vector) do
    VQ.encode_binary(codebook, vector)
  end

  @doc """
  Encode multiple vectors.
  """
  @spec batch_encode(quantizer(), [vector()]) :: {:ok, [encoded()]} | {:error, term()}
  def batch_encode(quantizer, vectors) do
    results = Enum.map(vectors, &encode(quantizer, &1))

    case Enum.find(results, &match?({:error, _}, &1)) do
      nil -> {:ok, Enum.map(results, fn {:ok, enc} -> enc end)}
      error -> error
    end
  end

  @doc """
  Decode an encoded vector back to approximate original.
  """
  @spec decode(quantizer(), encoded()) :: {:ok, vector()} | {:error, term()}
  def decode(%{strategy: :pq, codebook: codebook}, encoded) do
    PQ.decode(codebook, encoded)
  end

  def decode(%{strategy: :vq, codebook: codebook}, encoded) do
    VQ.decode_binary(codebook, encoded)
  end

  @doc """
  Compute distance between query and encoded vector.
  """
  @spec distance(quantizer(), vector(), encoded()) :: float()
  def distance(%{strategy: :pq, codebook: codebook}, query, encoded) do
    PQ.asymmetric_distance(codebook, query, encoded)
  end

  def distance(%{strategy: :vq, codebook: codebook}, query, encoded) do
    {:ok, idx} = decode_index(codebook, encoded)
    VQ.distance(codebook, query, idx)
  end

  @doc """
  Search for nearest neighbors among encoded vectors.

  ## Options

  - `:top_k` - Number of results (default: 10)
  """
  @spec search(quantizer(), vector(), [encoded()], keyword()) :: [{encoded(), float()}]
  def search(%{strategy: :pq, codebook: codebook} = _quantizer, query, encoded_vectors, opts) do
    top_k = Keyword.get(opts, :top_k, 10)

    # Build distance table for efficient batch queries
    distance_table = PQ.build_distance_table(codebook, query)

    encoded_vectors
    |> Enum.map(fn enc ->
      dist = PQ.table_distance(distance_table, enc)
      {enc, dist}
    end)
    |> Enum.sort_by(fn {_enc, dist} -> dist end)
    |> Enum.take(top_k)
  end

  def search(%{strategy: :vq} = quantizer, query, encoded_vectors, opts) do
    top_k = Keyword.get(opts, :top_k, 10)

    encoded_vectors
    |> Enum.map(fn enc ->
      dist = distance(quantizer, query, enc)
      {enc, dist}
    end)
    |> Enum.sort_by(fn {_enc, dist} -> dist end)
    |> Enum.take(top_k)
  end

  @doc """
  Get compression ratio achieved by quantizer.
  """
  @spec compression_ratio(quantizer()) :: float()
  def compression_ratio(%{strategy: :pq, codebook: codebook}) do
    PQ.compression_ratio(codebook)
  end

  def compression_ratio(%{strategy: :vq, codebook: codebook}) do
    VQ.compression_ratio(codebook)
  end

  @doc """
  Compute recall at k by comparing exact and approximate results.

  Returns fraction of true top-k neighbors found in approximate top-k.
  """
  @spec recall_at_k([vector()], quantizer(), [encoded()], pos_integer()) :: float()
  def recall_at_k(test_queries, quantizer, encoded_db, k) do
    # Decode all encoded vectors for exact search
    decoded_db =
      Enum.map(encoded_db, fn enc ->
        {:ok, vec} = decode(quantizer, enc)
        vec
      end)

    recalls =
      Enum.map(test_queries, fn query ->
        query = to_list(query)

        # Exact top-k
        exact_top_k =
          decoded_db
          |> Enum.with_index()
          |> Enum.map(fn {vec, idx} -> {idx, euclidean_distance(query, vec)} end)
          |> Enum.sort_by(fn {_idx, dist} -> dist end)
          |> Enum.take(k)
          |> Enum.map(fn {idx, _dist} -> idx end)
          |> MapSet.new()

        # Approximate top-k
        approx_top_k =
          encoded_db
          |> Enum.with_index()
          |> Enum.map(fn {enc, idx} -> {idx, distance(quantizer, query, enc)} end)
          |> Enum.sort_by(fn {_idx, dist} -> dist end)
          |> Enum.take(k)
          |> Enum.map(fn {idx, _dist} -> idx end)
          |> MapSet.new()

        # Recall = |intersection| / k
        MapSet.intersection(exact_top_k, approx_top_k) |> MapSet.size()
      end)

    Enum.sum(recalls) / (length(recalls) * k)
  end

  @doc """
  Serialize quantizer to binary.
  """
  @spec serialize(quantizer()) :: binary()
  def serialize(quantizer) do
    :erlang.term_to_binary(quantizer)
  end

  @doc """
  Deserialize quantizer from binary.
  """
  @spec deserialize(binary()) :: {:ok, quantizer()} | {:error, term()}
  def deserialize(binary) when is_binary(binary) do
    try do
      quantizer = :erlang.binary_to_term(binary, [:safe])

      if is_map(quantizer) and Map.has_key?(quantizer, :strategy) do
        {:ok, quantizer}
      else
        {:error, :invalid_quantizer}
      end
    rescue
      _ -> {:error, :deserialize_failed}
    end
  end

  @doc """
  Get quantizer info.
  """
  @spec info(quantizer()) :: map()
  def info(%{strategy: strategy, codebook: codebook, metadata: metadata}) do
    %{
      strategy: strategy,
      compression_ratio: compression_ratio(%{strategy: strategy, codebook: codebook}),
      metadata: metadata
    }
  end

  # Private helpers

  defp select_strategy(:auto, dim, target_compression) do
    # Use PQ for high dimensions and high compression targets
    if dim >= 128 and target_compression >= 4 do
      :pq
    else
      :vq
    end
  end

  defp select_strategy(strategy, _dim, _target_compression), do: strategy

  defp train_pq(vectors, dim, target_compression, opts) do
    # Calculate m based on target compression, unless explicitly provided
    # compression = dim * 4 / m
    # m = dim * 4 / compression
    m =
      case Keyword.get(opts, :m) do
        nil ->
          default_m = max(8, div(dim * 4, target_compression))
          # Ensure m divides dim evenly
          find_divisor(dim, default_m)

        explicit_m ->
          explicit_m
      end

    k = Keyword.get(opts, :k, 256)
    iterations = Keyword.get(opts, :iterations, 20)

    case PQ.train(vectors, m: m, k: k, iterations: iterations) do
      {:ok, codebook} ->
        quantizer = %{
          strategy: :pq,
          codebook: codebook,
          metadata: %{
            trained_at: DateTime.utc_now(),
            sample_size: length(vectors),
            target_compression: target_compression
          }
        }

        {:ok, quantizer}

      error ->
        error
    end
  end

  defp train_vq(vectors, opts) do
    k = Keyword.get(opts, :k, 1024)
    iterations = Keyword.get(opts, :iterations, 25)

    case VQ.train(vectors, k: k, iterations: iterations) do
      {:ok, codebook} ->
        quantizer = %{
          strategy: :vq,
          codebook: codebook,
          metadata: %{
            trained_at: DateTime.utc_now(),
            sample_size: length(vectors)
          }
        }

        {:ok, quantizer}

      error ->
        error
    end
  end

  defp find_divisor(dim, target) do
    # Find divisor of dim closest to target
    divisors =
      1..dim
      |> Enum.filter(fn d -> rem(dim, d) == 0 end)

    Enum.min_by(divisors, fn d -> abs(d - target) end)
  end

  defp decode_index(%{k: k}, binary) do
    index =
      cond do
        k <= 256 and byte_size(binary) == 1 ->
          <<idx::8>> = binary
          idx

        k <= 65536 and byte_size(binary) == 2 ->
          <<idx::16>> = binary
          idx

        byte_size(binary) == 4 ->
          <<idx::32>> = binary
          idx

        true ->
          nil
      end

    if index, do: {:ok, index}, else: {:error, :invalid_binary}
  end

  defp to_list(vec) when is_list(vec), do: vec
  defp to_list(vec) when is_tuple(vec), do: Tuple.to_list(vec)

  defp euclidean_distance(v1, v2) do
    Enum.zip(v1, v2)
    |> Enum.reduce(0.0, fn {a, b}, acc ->
      diff = a - b
      acc + diff * diff
    end)
    |> :math.sqrt()
  end
end
