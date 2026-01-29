defmodule Cybernetic.Intelligence.Vectors.VQ do
  @moduledoc """
  Vector Quantization (VQ) for embedding compression.

  VQ quantizes entire vectors to nearest centroids in a learned codebook.
  Simpler than PQ but lower compression ratio.

  For a 1536-dim vector with K=65536 centroids:
  - Original: 1536 * 4 bytes = 6144 bytes
  - Compressed: 2 bytes (index)
  - Compression ratio: 3072x (but requires large codebook in memory)

  ## Usage

      # Train codebook
      {:ok, codebook} = VQ.train(training_vectors, k: 1024)

      # Encode to index
      {:ok, index} = VQ.encode(codebook, vector)

      # Decode back to centroid
      {:ok, centroid} = VQ.decode(codebook, index)
  """

  require Logger

  @type vector :: [float()] | tuple()
  @type codebook :: %{
          k: pos_integer(),
          dim: pos_integer(),
          centroids: [vector()]
        }
  @type index :: non_neg_integer()

  @default_k 1024
  @default_iterations 25
  @default_sample_size 50_000

  @doc """
  Train a VQ codebook from training vectors.

  ## Options

  - `:k` - Number of centroids (default: 1024)
  - `:iterations` - K-means iterations (default: 25)
  - `:sample_size` - Max training samples (default: 50000)
  """
  @spec train([vector()], keyword()) :: {:ok, codebook()} | {:error, term()}
  def train(vectors, opts \\ []) when is_list(vectors) and length(vectors) > 0 do
    k = Keyword.get(opts, :k, @default_k)
    iterations = Keyword.get(opts, :iterations, @default_iterations)
    sample_size = Keyword.get(opts, :sample_size, @default_sample_size)

    training_vectors =
      if length(vectors) > sample_size do
        Enum.take_random(vectors, sample_size)
      else
        vectors
      end

    training_vectors = Enum.map(training_vectors, &to_list/1)
    dim = length(hd(training_vectors))

    Logger.info("Training VQ codebook: dim=#{dim}, k=#{k}")

    centroids = kmeans(training_vectors, k, iterations)

    codebook = %{
      k: k,
      dim: dim,
      centroids: centroids
    }

    {:ok, codebook}
  end

  @doc """
  Encode a vector to its nearest centroid index.
  """
  @spec encode(codebook(), vector()) :: {:ok, index()} | {:error, term()}
  def encode(%{centroids: centroids, dim: dim}, vector) do
    vector = to_list(vector)

    if length(vector) != dim do
      {:error, {:dimension_mismatch, length(vector), dim}}
    else
      index = find_nearest_centroid(vector, centroids)
      {:ok, index}
    end
  end

  @doc """
  Encode a vector to compact binary representation.
  Uses 2 bytes for k <= 65536, 4 bytes otherwise.
  """
  @spec encode_binary(codebook(), vector()) :: {:ok, binary()} | {:error, term()}
  def encode_binary(%{k: k} = codebook, vector) do
    case encode(codebook, vector) do
      {:ok, index} when k <= 256 ->
        {:ok, <<index::8>>}

      {:ok, index} when k <= 65536 ->
        {:ok, <<index::16>>}

      {:ok, index} ->
        {:ok, <<index::32>>}

      error ->
        error
    end
  end

  @doc """
  Decode an index back to its centroid vector.
  """
  @spec decode(codebook(), index()) :: {:ok, vector()} | {:error, term()}
  def decode(%{centroids: centroids, k: k}, index) when index >= 0 and index < k do
    {:ok, Enum.at(centroids, index)}
  end

  def decode(%{k: k}, index) do
    {:error, {:invalid_index, index, k}}
  end

  @doc """
  Decode binary representation back to centroid.
  """
  @spec decode_binary(codebook(), binary()) :: {:ok, vector()} | {:error, term()}
  def decode_binary(%{k: k} = codebook, binary) do
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

    if index do
      decode(codebook, index)
    else
      {:error, :invalid_binary}
    end
  end

  @doc """
  Compute distance between query and encoded vector.
  """
  @spec distance(codebook(), vector(), index()) :: float()
  def distance(%{centroids: centroids}, query, index) do
    query = to_list(query)
    centroid = Enum.at(centroids, index)
    euclidean_distance(query, centroid)
  end

  @doc """
  Batch encode multiple vectors.
  """
  @spec batch_encode(codebook(), [vector()]) :: {:ok, [index()]} | {:error, term()}
  def batch_encode(codebook, vectors) when is_list(vectors) do
    results =
      Enum.map(vectors, fn vec ->
        case encode(codebook, vec) do
          {:ok, idx} -> {:ok, idx}
          error -> error
        end
      end)

    case Enum.find(results, &match?({:error, _}, &1)) do
      nil -> {:ok, Enum.map(results, fn {:ok, idx} -> idx end)}
      error -> error
    end
  end

  @doc """
  Serialize codebook to binary.
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
  def compression_ratio(%{dim: dim, k: k}) do
    index_bytes =
      cond do
        k <= 256 -> 1
        k <= 65536 -> 2
        true -> 4
      end

    dim * 4 / index_bytes
  end

  @doc """
  Compute quantization error (mean reconstruction error).
  """
  @spec quantization_error(codebook(), [vector()]) :: float()
  def quantization_error(codebook, test_vectors) do
    errors =
      Enum.map(test_vectors, fn vec ->
        vec = to_list(vec)

        case encode(codebook, vec) do
          {:ok, idx} ->
            {:ok, reconstructed} = decode(codebook, idx)
            squared_distance(vec, reconstructed)

          _ ->
            0.0
        end
      end)

    :math.sqrt(Enum.sum(errors) / length(errors))
  end

  # Private helpers

  defp to_list(vec) when is_list(vec), do: vec
  defp to_list(vec) when is_tuple(vec), do: Tuple.to_list(vec)

  defp kmeans(vectors, k, iterations) do
    n = length(vectors)

    initial_centroids =
      vectors
      |> Enum.take_random(min(k, n))
      |> pad_centroids(k, hd(vectors))

    Enum.reduce(1..iterations, initial_centroids, fn _iter, centroids ->
      assignments = Enum.map(vectors, &find_nearest_centroid(&1, centroids))

      0..(k - 1)
      |> Enum.map(fn cluster_idx ->
        members =
          Enum.zip(vectors, assignments)
          |> Enum.filter(fn {_vec, idx} -> idx == cluster_idx end)
          |> Enum.map(fn {vec, _idx} -> vec end)

        if members == [] do
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

  defp euclidean_distance(v1, v2) do
    :math.sqrt(squared_distance(v1, v2))
  end
end
