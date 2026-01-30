defmodule Cybernetic.Security.Passwords do
  @moduledoc """
  Password hashing and verification for Cybernetic aMCP Framework.

  Uses Argon2 with configurable parameters following OWASP recommendations.
  See: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
  """

  @doc """
  Hash a password using Argon2.

  Uses pepper from PASSWORD_SALT environment variable if available.
  """
  @spec hash(String.t()) :: String.t()
  def hash(password) when is_binary(password) and byte_size(password) > 0 do
    pepper = get_pepper()
    opts = argon2_opts()
    Argon2.hash_pwd_salt(password <> pepper, opts)
  end

  @doc """
  Verify a password against a hash.

  Uses pepper from PASSWORD_SALT environment variable if available.
  """
  @spec verify(String.t(), String.t()) :: boolean()
  def verify(password, hash) when is_binary(password) and is_binary(hash) and byte_size(password) > 0 and byte_size(hash) > 0 do
    pepper = get_pepper()
    Argon2.verify_pass(password <> pepper, hash)
  end

  @doc """
  Check if a password meets minimum requirements.

  Requirements:
  - At least 8 characters
  - Not in common password list (basic check)
  """
  @spec valid?(String.t()) :: boolean()
  def valid?(password) when is_binary(password) do
    String.length(password) >= 8 and not common_password?(password)
  end

  @doc """
  Get the configured Argon2 options.
  """
  @spec argon2_opts() :: keyword()
  def argon2_opts do
    config = Application.get_env(:cybernetic, :argon2, [])

    [
      # Time cost (iterations) - higher is more secure but slower
      t_cost: Keyword.get(config, :t_cost, 3),
      # Memory cost as power of 2 (2^16 = 64MB, 2^17 = 128MB)
      m_cost: Keyword.get(config, :m_cost, 16),
      # Parallelism - number of threads
      parallelism: Keyword.get(config, :parallelism, 4)
    ]
  end

  # Get pepper from environment (optional additional secret)
  defp get_pepper do
    System.get_env("PASSWORD_SALT", "")
  end

  # Basic common password check
  @common_passwords ~w(
    password 123456 12345678 qwerty abc123 monkey 1234567 letmein
    trustno1 dragon baseball iloveyou master sunshine ashley
    password1 password123 admin admin123 root welcome
  )

  defp common_password?(password) do
    String.downcase(password) in @common_passwords
  end
end
