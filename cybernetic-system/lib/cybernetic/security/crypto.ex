defmodule Cybernetic.Security.Crypto do
  @moduledoc """
  Cryptographic utilities for the Cybernetic framework.

  Provides secure hashing, encryption, and key management.
  """

  @doc """
  Generate a secure random key
  """
  def generate_key(bytes \\ 32) do
    :crypto.strong_rand_bytes(bytes)
  end

  @doc """
  Hash data using SHA256
  """
  def hash(data) do
    :crypto.hash(:sha256, data)
  end

  @doc """
  HMAC signing
  """
  def sign(data, key) do
    :crypto.mac(:hmac, :sha256, key, data)
  end

  @doc """
  Verify HMAC signature
  """
  def verify_signature(data, signature, key) do
    expected = sign(data, key)
    :crypto.hash_equals(expected, signature)
  end
end
