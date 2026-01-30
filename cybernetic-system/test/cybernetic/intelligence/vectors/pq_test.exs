defmodule Cybernetic.Intelligence.Vectors.PQTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Intelligence.Vectors.PQ

  setup do
    :rand.seed(:exsplus, {101, 102, 103})
    :ok
  end

  defp random_vectors(count, dim) do
    for _ <- 1..count do
      for _ <- 1..dim, do: :rand.uniform()
    end
  end

  test "train/2 rejects k > 256 (byte encoding constraint)" do
    vectors = random_vectors(10, 8)

    assert {:error, {:invalid_params, msg}} = PQ.train(vectors, m: 2, k: 257, iterations: 1)
    assert msg =~ "k must be <="
  end

  test "encode/decode round-trip preserves vector length" do
    vectors = random_vectors(20, 8)
    assert {:ok, codebook} = PQ.train(vectors, m: 2, k: 4, iterations: 2)

    vec = hd(vectors)
    assert {:ok, encoded} = PQ.encode(codebook, vec)
    assert is_binary(encoded)
    assert byte_size(encoded) == codebook.m

    assert {:ok, decoded} = PQ.decode(codebook, encoded)
    assert length(decoded) == codebook.dim
  end

  test "encode/2 rejects dimension mismatches" do
    vectors = random_vectors(10, 8)
    {:ok, codebook} = PQ.train(vectors, m: 2, k: 4, iterations: 1)

    assert {:error, {:dimension_mismatch, 7, 8}} = PQ.encode(codebook, Enum.take(hd(vectors), 7))
  end
end
