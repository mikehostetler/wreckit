defmodule Cybernetic.Security.Secrets do
  @moduledoc """
  Centralized secret management for security-sensitive operations.

  Provides a single source of truth for loading and validating secrets used in:
  - JWT signing/verification (JWT_SECRET)
  - HMAC message authentication (CYBERNETIC_HMAC_SECRET)
  - Session encryption (SECRET_KEY_BASE)

  ## Security Properties

  - **Validation**: All secrets are validated for minimum length (32 bytes default)
  - **Production enforcement**: Missing/invalid secrets raise in production
  - **Dev fallbacks**: Non-production environments get safe defaults with warnings
  - **Consistent interface**: All callers use the same validation logic

  ## Configuration

  Secrets are read from environment variables. In production, all secrets MUST be
  explicitly set. In dev/test, fallback values are used with warnings.

  ## Usage

      # Get JWT signing secret
      secret = Cybernetic.Security.Secrets.jwt_secret()

      # Get HMAC authentication secret
      hmac = Cybernetic.Security.Secrets.hmac_secret()

      # Check if running in production mode
      Cybernetic.Security.Secrets.production?()
  """

  require Logger

  @min_secret_length 32
  @dev_jwt_secret "dev-secret-change-in-production-at-least-32bytes"
  @dev_hmac_secret "dev-hmac-secret-not-for-production-use-32bytes"

  @type secret :: String.t()

  @doc """
  Get the JWT signing/verification secret.

  In production, requires JWT_SECRET environment variable with at least 32 bytes.
  In dev/test, returns a safe default with a warning.

  ## Raises

  - In production: if JWT_SECRET is missing or < 32 bytes
  """
  @spec jwt_secret() :: secret()
  def jwt_secret do
    get_validated_secret(
      "JWT_SECRET",
      @dev_jwt_secret,
      "JWT signing secret"
    )
  end

  @doc """
  Get the HMAC authentication secret.

  Used for keyed hashing operations like API key hashing and nonce validation.
  In production, requires CYBERNETIC_HMAC_SECRET with at least 32 bytes.

  ## Raises

  - In production: if CYBERNETIC_HMAC_SECRET is missing or < 32 bytes
  """
  @spec hmac_secret() :: secret()
  def hmac_secret do
    get_validated_secret(
      "CYBERNETIC_HMAC_SECRET",
      @dev_hmac_secret,
      "HMAC authentication secret"
    )
  end

  @doc """
  Get the session encryption secret (SECRET_KEY_BASE).

  Used by Phoenix for session encryption. In production, must be at least 64 bytes.
  """
  @spec secret_key_base() :: secret() | nil
  def secret_key_base do
    case System.get_env("SECRET_KEY_BASE") do
      nil ->
        if production?() do
          Logger.warning("SECRET_KEY_BASE not set in production")
        end

        nil

      "" ->
        if production?() do
          Logger.warning("SECRET_KEY_BASE is empty in production")
        end

        nil

      secret when byte_size(secret) < 64 ->
        if production?() do
          raise "SECRET_KEY_BASE must be at least 64 bytes in production"
        end

        Logger.warning("SECRET_KEY_BASE is too short (< 64 bytes)")
        secret

      secret ->
        secret
    end
  end

  @doc """
  Check if a secret meets minimum length requirements.

  ## Examples

      iex> Cybernetic.Security.Secrets.valid_length?("short")
      false

      iex> Cybernetic.Security.Secrets.valid_length?(String.duplicate("x", 32))
      true
  """
  @spec valid_length?(String.t(), non_neg_integer()) :: boolean()
  def valid_length?(secret, min_length \\ @min_secret_length) when is_binary(secret) do
    byte_size(secret) >= min_length
  end

  @doc """
  Check if running in production environment.

  Checks the :cybernetic application's :environment config, defaulting to :prod.
  """
  @spec production?() :: boolean()
  def production? do
    Application.get_env(:cybernetic, :environment, :prod) == :prod
  end

  @doc """
  Validate that all required secrets are properly configured.

  Returns a list of validation errors, or empty list if all valid.
  Useful for startup checks.

  ## Examples

      iex> Cybernetic.Security.Secrets.validate_all()
      []  # All secrets valid

      iex> Cybernetic.Security.Secrets.validate_all()
      [{:jwt_secret, :missing}, {:hmac_secret, :too_short}]
  """
  @spec validate_all() :: [{atom(), :missing | :too_short | :empty}]
  def validate_all do
    [
      {:jwt_secret, "JWT_SECRET"},
      {:hmac_secret, "CYBERNETIC_HMAC_SECRET"}
    ]
    |> Enum.flat_map(fn {key, env_var} ->
      case System.get_env(env_var) do
        nil -> [{key, :missing}]
        "" -> [{key, :empty}]
        secret when byte_size(secret) < @min_secret_length -> [{key, :too_short}]
        _ -> []
      end
    end)
  end

  @doc """
  Ensure all secrets are valid, raising if any are misconfigured.

  Call this at application startup in production to fail fast.
  """
  @spec ensure_valid!() :: :ok
  def ensure_valid! do
    errors = validate_all()

    if production?() and errors != [] do
      error_msgs =
        Enum.map(errors, fn {key, reason} ->
          "#{key}: #{reason}"
        end)
        |> Enum.join(", ")

      raise "Invalid secrets configuration: #{error_msgs}"
    end

    if errors != [] do
      Logger.warning("Secret validation warnings: #{inspect(errors)}")
    end

    :ok
  end

  # Internal: Get and validate a secret with consistent logic
  @spec get_validated_secret(String.t(), String.t(), String.t()) :: secret()
  defp get_validated_secret(env_var, dev_fallback, description) do
    case System.get_env(env_var) do
      nil ->
        if production?() do
          raise "#{env_var} environment variable is required in production"
        end

        Logger.debug("Using dev fallback for #{description}")
        dev_fallback

      "" ->
        raise "#{env_var} cannot be empty"

      secret when byte_size(secret) < @min_secret_length ->
        if production?() do
          raise "#{env_var} must be at least #{@min_secret_length} bytes in production (got #{byte_size(secret)})"
        end

        Logger.warning("#{description} is shorter than recommended (#{@min_secret_length} bytes)")
        secret

      secret ->
        secret
    end
  end
end
