defmodule Cybernetic.Intelligence.Vectors.VQTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Intelligence.Vectors.VQ

  setup do
    :rand.seed(:exsplus, {201, 202, 203})
    :ok
  end

  defp random_vectors(count, dim) do
    for _ <- 1..count do
      for _ <- 1..dim, do: :rand.uniform()
    end
  end

  test "encode_binary/2 uses 1 byte for k <= 256" do
    vectors = random_vectors(30, 8)
    assert {:ok, codebook} = VQ.train(vectors, k: 16, iterations: 2)

    {:ok, encoded} = VQ.encode_binary(codebook, hd(vectors))
    assert byte_size(encoded) == 1

    assert {:ok, decoded} = VQ.decode_binary(codebook, encoded)
    assert length(decoded) == codebook.dim
  end

  test "decode_binary/2 rejects invalid sizes" do
    vectors = random_vectors(10, 8)
    assert {:ok, codebook} = VQ.train(vectors, k: 16, iterations: 1)

    assert {:error, :invalid_binary} = VQ.decode_binary(codebook, <<0, 0, 0>>)
  end
end
