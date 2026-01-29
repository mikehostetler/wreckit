defmodule Cybernetic.Intelligence.Vectors.QuantizerTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Intelligence.Vectors.Quantizer

  setup do
    :rand.seed(:exsplus, {301, 302, 303})
    :ok
  end

  defp random_vectors(count, dim) do
    for _ <- 1..count do
      for _ <- 1..dim, do: :rand.uniform()
    end
  end

  test "train/2 rejects unsupported PQ k values" do
    vectors = random_vectors(10, 128)

    assert {:error, {:invalid_params, _}} =
             Quantizer.train(vectors,
               strategy: :pq,
               target_compression: 64,
               k: 257,
               iterations: 1
             )
  end

  test "PQ encode/decode + search" do
    vectors = random_vectors(25, 128)

    assert {:ok, quantizer} =
             Quantizer.train(vectors, strategy: :pq, target_compression: 64, k: 16, iterations: 2)

    {:ok, encoded_db} = Quantizer.batch_encode(quantizer, vectors)
    assert length(encoded_db) == length(vectors)

    query = hd(vectors)
    results = Quantizer.search(quantizer, query, encoded_db, top_k: 5)

    assert length(results) == 5

    Enum.each(results, fn {encoded, dist} ->
      assert is_binary(encoded)
      assert is_float(dist)
      assert dist >= 0.0
    end)

    {:ok, encoded} = Quantizer.encode(quantizer, query)
    assert {:ok, decoded} = Quantizer.decode(quantizer, encoded)
    assert length(decoded) == 128
  end

  test "VQ encode/decode + search" do
    vectors = random_vectors(40, 16)
    assert {:ok, quantizer} = Quantizer.train(vectors, strategy: :vq, k: 32, iterations: 2)

    {:ok, encoded_db} = Quantizer.batch_encode(quantizer, vectors)
    results = Quantizer.search(quantizer, hd(vectors), encoded_db, top_k: 3)

    assert length(results) == 3

    Enum.each(results, fn {encoded, dist} ->
      assert is_binary(encoded)
      assert is_float(dist)
      assert dist >= 0.0
    end)
  end
end
