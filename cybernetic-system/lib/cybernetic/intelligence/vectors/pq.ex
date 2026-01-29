defmodule Cybernetic.Intelligence.Vectors.PQ do
  @moduledoc """
  Product Quantization (PQ) for high-dimensional vector compression.

  PQ achieves 4-8x compression with <5% recall loss by:
  1. Splitting vectors into M sub-vectors
  2. Quantizing each sub-vector to K centroids (codebook)
  3. Storing indices instead of full vectors

  For a 1536-dim vector with M=192 sub-vectors and K=256 centroids:
  - Original: 1536 * 4 bytes = 6144 bytes
  - Compressed: 192 * 1 byte = 192 bytes
  - Compression ratio: 32x

  ## Usage

      # Train codebook on sample vectors
      {:ok, codebook} = PQ.train(training_vectors, m: 64, k: 256)

      # Encode vectors to compact representation
      {:ok, encoded} = PQ.encode(codebook, vector)

      # Decode back to approximate vector
      {:ok, decoded} = PQ.decode(codebook, encoded)

      # Compute distance between query and encoded vector
      distance = PQ.asymmetric_distance(codebook, query, encoded)
  """

  require Logger

  @type vector :: [float()] | tuple()
  @type codebook :: %{
          m: pos_integer(),
          k: pos_integer(),
          dim: pos_integer(),
          sub_dim: pos_integer(),
          centroids: [[vector()]]
        }
  @type encoded :: binary()

  @default_m 64
  @default_k 256
  @default_iterations 20
  @default_sample_size 10_000

  @doc """
  Train a PQ codebook from training vectors.

  ## Options

  - `:m` - Number of sub-vectors (default: 64)
  - `:k` - Number of centroids per sub-vector (default: 256)
  - `:iterations` - K-means iterations (default: 20)
  - `:sample_size` - Max training samples (default: 10000)

  ## Returns

  `{:ok, codebook}` or `{:error, reason}`
  """
  # PQ encodes one centroid index per byte, so k is limited to 256.
  @max_k 256

  @spec train([vector()], keyword()) :: {:ok, codebook()} | {:error, term()}
  def train(vectors, opts \\ []) when is_list(vectors) and length(vectors) > 0 do
    m = Keyword.get(opts, :m, @default_m)
    k = Keyword.get(opts, :k, @default_k)
    iterations = Keyword.get(opts, :iterations, @default_iterations)
    sample_size = Keyword.get(opts, :sample_size, @default_sample_size)

    cond do
      k < 2 ->
        {:error, {:invalid_params, "k must be at least 2, got #{k}"}}

      k > @max_k ->
        {:error, {:invalid_params, "k must be <= #{@max_k}, got #{k}"}}

      true ->
        do_train(vectors, m, k, iterations, sample_size)
    end
  end

  defp do_train(vectors, m, k, iterations, sample_size) do
    # Sample if needed
    training_vectors =
      if length(vectors) > sample_size do
        Enum.take_random(vectors, sample_size)
      else
        vectors
      end

    # Normalize to lists
    training_vectors = Enum.map(training_vectors, &to_list/1)

    dim = length(hd(training_vectors))

    if rem(dim, m) != 0 do
      {:error, {:invalid_params, "Vector dimension #{dim} must be divisible by m=#{m}"}}
    else
      sub_dim = div(dim, m)

      Logger.info("Training PQ codebook: dim=#{dim}, m=#{m}, k=#{k}, sub_dim=#{sub_dim}")

      # Train codebook for each sub-vector
      centroids =
        0..(m - 1)
        |> Enum.map(fn sub_idx ->
          # Extract sub-vectors for this partition
          sub_vectors =
            Enum.map(training_vectors, fn vec ->
              Enum.slice(vec, sub_idx * sub_dim, sub_dim)
            end)

          # Run k-means to find centroids
          kmeans(sub_vectors, k, iterations)
        end)

      codebook = %{
        m: m,
        k: k,
        dim: dim,
        sub_dim: sub_dim,
        centroids: centroids
      }

      {:ok, codebook}
    end
  end

  @doc """
  Encode a vector using the trained codebook.

  Returns compact binary where each byte is a centroid index.
  """
  @spec encode(codebook(), vector()) :: {:ok, encoded()} | {:error, term()}
  def encode(%{m: m, sub_dim: sub_dim, centroids: centroids}, vector) do
    vector = to_list(vector)

    if length(vector) != m * sub_dim do
      {:error, {:dimension_mismatch, length(vector), m * sub_dim}}
    else
      # Find nearest centroid for each sub-vector
      indices =
        0..(m - 1)
        |> Enum.map(fn sub_idx ->
          sub_vector = Enum.slice(vector, sub_idx * sub_dim, sub_dim)
          sub_centroids = Enum.at(centroids, sub_idx)
          find_nearest_centroid(sub_vector, sub_centroids)
        end)

      # Pack indices into binary (1 byte per index for k<=256)
      encoded = :erlang.list_to_binary(indices)
      {:ok, encoded}
    end
  end

  @doc """
  Decode an encoded vector back to approximate original.
  """
  @spec decode(codebook(), encoded()) :: {:ok, vector()} | {:error, term()}
  def decode(%{m: m, centroids: centroids}, encoded) when byte_size(encoded) == m do
    indices = :erlang.binary_to_list(encoded)

    decoded =
      indices
      |> Enum.with_index()
      |> Enum.flat_map(fn {idx, sub_idx} ->
        Enum.at(Enum.at(centroids, sub_idx), idx)
      end)

    {:ok, decoded}
  end

  def decode(%{m: m}, encoded) do
    {:error, {:invalid_encoding, byte_size(encoded), m}}
  end

  @doc """
  Compute asymmetric distance between query vector and encoded vector.

  This is more accurate than symmetric distance since query is not quantized.
  """
  @spec asymmetric_distance(codebook(), vector(), encoded()) :: float()
  def asymmetric_distance(%{m: m, sub_dim: sub_dim, centroids: centroids}, query, encoded)
      when byte_size(encoded) == m do
    query = to_list(query)
    indices = :erlang.binary_to_list(encoded)

    # Sum squared distances for each sub-vector
    0..(m - 1)
    |> Enum.reduce(0.0, fn sub_idx, acc ->
      sub_query = Enum.slice(query, sub_idx * sub_dim, sub_dim)
      centroid_idx = Enum.at(indices, sub_idx)
      centroid = Enum.at(Enum.at(centroids, sub_idx), centroid_idx)
      acc + squared_distance(sub_query, centroid)
    end)
    |> :math.sqrt()
  end

  @doc """
  Build distance table for efficient batch queries.

  For each sub-vector, precompute distances from query to all centroids.
  """
  @spec build_distance_table(codebook(), vector()) :: [[float()]]
  def build_distance_table(%{m: m, k: k, sub_dim: sub_dim, centroids: centroids}, query) do
    query = to_list(query)

    0..(m - 1)
    |> Enum.map(fn sub_idx ->
      sub_query = Enum.slice(query, sub_idx * sub_dim, sub_dim)
      sub_centroids = Enum.at(centroids, sub_idx)

      0..(k - 1)
      |> Enum.map(fn centroid_idx ->
        centroid = Enum.at(sub_centroids, centroid_idx)
        squared_distance(sub_query, centroid)
      end)
    end)
  end

  @doc """
  Compute distance using precomputed distance table.

  Much faster for batch queries against many encoded vectors.
  """
  @spec table_distance([[float()]], encoded()) :: float()
  def table_distance(distance_table, encoded) do
    indices = :erlang.binary_to_list(encoded)

    indices
    |> Enum.with_index()
    |> Enum.reduce(0.0, fn {centroid_idx, sub_idx}, acc ->
      acc + Enum.at(Enum.at(distance_table, sub_idx), centroid_idx)
    end)
    |> :math.sqrt()
  end

  @doc """
  Serialize codebook to binary for persistence.
  """
  @spec serialize(codebook()) :: binary()
  def serialize(codebook) do
    :erlang.term_to_binary(codebook)
  end

  @doc """
  Deserialize codebook from binary.
  """
  @spec deserialize(binary()) :: {:ok, codebook()} | {:error, term()}
  def deserialize(binary) when is_binary(binary) do
    try do
      codebook = :erlang.binary_to_term(binary, [:safe])

      if is_map(codebook) and Map.has_key?(codebook, :centroids) do
        {:ok, codebook}
      else
        {:error, :invalid_codebook}
      end
    rescue
      _ -> {:error, :deserialize_failed}
    end
  end

  @doc """
  Get compression ratio.
  """
  @spec compression_ratio(codebook()) :: float()
  def compression_ratio(%{dim: dim, m: m}) do
    # Original: dim * 4 bytes (float32)
    # Compressed: m bytes (1 byte per sub-vector index)
    dim * 4 / m
  end

  # Private helpers

  defp to_list(vec) when is_list(vec), do: vec
  defp to_list(vec) when is_tuple(vec), do: Tuple.to_list(vec)

  defp kmeans(vectors, k, iterations) do
    n = length(vectors)

    # Initialize centroids by random sampling
    initial_centroids =
      vectors
      |> Enum.take_random(min(k, n))
      |> pad_centroids(k, hd(vectors))

    # Iterate k-means
    Enum.reduce(1..iterations, initial_centroids, fn _iter, centroids ->
      # Assign each vector to nearest centroid
      assignments =
        Enum.map(vectors, fn vec ->
          find_nearest_centroid(vec, centroids)
        end)

      # Recompute centroids
      0..(k - 1)
      |> Enum.map(fn cluster_idx ->
        members =
          Enum.zip(vectors, assignments)
          |> Enum.filter(fn {_vec, idx} -> idx == cluster_idx end)
          |> Enum.map(fn {vec, _idx} -> vec end)

        if members == [] do
          # Keep old centroid if cluster is empty
          Enum.at(centroids, cluster_idx)
        else
          compute_centroid(members)
        end
      end)
    end)
  end

  defp pad_centroids(centroids, k, template) when length(centroids) < k do
    dim = length(template)
    padding = for _ <- length(centroids)..(k - 1), do: for(_ <- 1..dim, do: :rand.uniform())
    centroids ++ padding
  end

  defp pad_centroids(centroids, _k, _template), do: centroids

  defp find_nearest_centroid(vector, centroids) do
    centroids
    |> Enum.with_index()
    |> Enum.min_by(fn {centroid, _idx} -> squared_distance(vector, centroid) end)
    |> elem(1)
  end

  defp compute_centroid(vectors) do
    n = length(vectors)
    dim = length(hd(vectors))

    sums =
      Enum.reduce(vectors, List.duplicate(0.0, dim), fn vec, acc ->
        Enum.zip(vec, acc) |> Enum.map(fn {v, a} -> v + a end)
      end)

    Enum.map(sums, &(&1 / n))
  end

  defp squared_distance(v1, v2) do
    Enum.zip(v1, v2)
    |> Enum.reduce(0.0, fn {a, b}, acc ->
      diff = a - b
      acc + diff * diff
    end)
  end
end
