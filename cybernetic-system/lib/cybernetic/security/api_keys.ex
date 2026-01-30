defmodule Cybernetic.Security.ApiKeys do
  @moduledoc """
  API Key management for programmatic access to the Cybernetic platform.

  Provides secure API key generation, validation, and lifecycle management.
  Keys are stored in a protected ETS table with HMAC-SHA256 hashing.

  ## VSM Architecture

  This module operates as part of System 1 (Operations) in the Viable
  System Model, providing programmatic authentication for API clients.

  ## Key Format

  API keys are prefixed with `cyb_` for easy identification:
  - `cyb_` prefix + 32 bytes of cryptographic randomness (base64 encoded)
  - Example: `cyb_a1b2c3d4e5f6g7h8i9j0...`

  ## Security

  - Keys are hashed with HMAC-SHA256 before storage (prevents rainbow tables)
  - Original key is never stored - only returned once at creation
  - Keys can be scoped to specific tenants
  - Keys have configurable expiration (default: 1 year)
  """

  require Logger

  alias Cybernetic.Security.RBAC

  @typedoc "API key data stored in ETS"
  @type key_data :: %{
          name: String.t(),
          roles: [atom()],
          tenant_id: String.t() | nil,
          created_at: DateTime.t(),
          expires_at: DateTime.t(),
          metadata: map()
        }

  # ETS table name for API keys
  @ets_table :api_keys

  # API key expiry (1 year in seconds)
  @default_ttl_seconds 365 * 24 * 3600

  # ========== ETS TABLE MANAGEMENT ==========

  @doc """
  Initialize the API keys ETS table.

  Called by AuthManager during GenServer init. The table is protected
  so only the owning process can write, but any process can read.
  """
  @spec init_table() :: :ok
  def init_table do
    :ets.new(@ets_table, [:set, :protected, :named_table, {:read_concurrency, true}])
    :ok
  end

  @doc """
  Load system API key from environment variable.

  Looks for CYBERNETIC_SYSTEM_API_KEY and creates a system-level key.
  """
  @spec load_from_env() :: :ok
  def load_from_env do
    if key = System.get_env("CYBERNETIC_SYSTEM_API_KEY") do
      key_hash = hash_key(key)

      key_data = %{
        name: "system",
        roles: [:system],
        tenant_id: "system",
        created_at: DateTime.utc_now(),
        expires_at: DateTime.add(DateTime.utc_now(), 10 * @default_ttl_seconds, :second),
        metadata: %{source: "env"}
      }

      :ets.insert(@ets_table, {key_hash, key_data})
      Logger.info("Loaded system API key from environment")
    end

    :ok
  end

  # ========== KEY OPERATIONS ==========

  @doc """
  Create a new API key with the specified name, roles, and options.

  Returns the plaintext key which should be shown to the user once.
  The key is hashed before storage - the plaintext cannot be recovered.

  ## Options

  - `:tenant_id` - Scope key to a specific tenant
  - `:expires_in` - Expiration in seconds (default: 1 year)
  - `:metadata` - Additional metadata map
  """
  @spec create(String.t(), [atom()], keyword()) :: {:ok, String.t()}
  def create(name, roles, opts \\ []) when is_binary(name) and is_list(roles) do
    key = generate_key()
    key_hash = hash_key(key)

    expires_at =
      case Keyword.get(opts, :expires_in) do
        nil -> DateTime.add(DateTime.utc_now(), @default_ttl_seconds, :second)
        seconds -> DateTime.add(DateTime.utc_now(), seconds, :second)
      end

    key_data = %{
      name: name,
      tenant_id: Keyword.get(opts, :tenant_id),
      roles: roles,
      created_at: DateTime.utc_now(),
      expires_at: expires_at,
      metadata: Keyword.get(opts, :metadata, %{})
    }

    :ets.insert(@ets_table, {key_hash, key_data})

    Logger.info("API key created: #{name} with roles #{inspect(roles)}")

    {:ok, key}
  end

  @doc """
  Authenticate an API key and return an auth context.

  Returns `{:ok, auth_context}` if the key is valid and not expired,
  or `{:error, reason}` otherwise.
  """
  @spec authenticate(String.t()) :: {:ok, map()} | {:error, atom()}
  def authenticate(api_key) do
    case :ets.lookup(@ets_table, hash_key(api_key)) do
      [{_hash, key_data}] ->
        if DateTime.compare(DateTime.utc_now(), key_data.expires_at) == :lt do
          auth_context = %{
            user_id: key_data.name,
            roles: key_data.roles,
            permissions: RBAC.expand_permissions(key_data.roles),
            metadata: %{
              tenant_id: key_data.tenant_id,
              auth_method: :api_key
            }
          }

          Logger.info("API key authenticated: #{key_data.name}")

          {:ok, auth_context}
        else
          Logger.warning("API key expired: #{key_data.name}")
          {:error, :expired_key}
        end

      [] ->
        Logger.warning("Invalid API key attempt")
        {:error, :invalid_key}
    end
  end

  @doc """
  Revoke an API key.

  Returns `:ok` if the key was found and deleted, `{:error, :not_found}` otherwise.
  """
  @spec revoke(String.t()) :: :ok | {:error, :not_found}
  def revoke(api_key) do
    key_hash = hash_key(api_key)

    case :ets.lookup(@ets_table, key_hash) do
      [{^key_hash, key_data}] ->
        :ets.delete(@ets_table, key_hash)
        Logger.info("API key revoked: #{key_data.name}")
        :ok

      [] ->
        {:error, :not_found}
    end
  end

  @doc """
  Check if a string looks like an API key (has the cyb_ prefix).
  """
  @spec is_api_key?(String.t()) :: boolean()
  def is_api_key?(str) when is_binary(str) do
    String.starts_with?(str, "cyb_")
  end

  def is_api_key?(_), do: false

  @doc """
  List all API keys (metadata only, not the actual keys).
  """
  @spec list() :: [map()]
  def list do
    :ets.tab2list(@ets_table)
    |> Enum.map(fn {_hash, key_data} ->
      %{
        name: key_data.name,
        roles: key_data.roles,
        tenant_id: key_data.tenant_id,
        created_at: key_data.created_at,
        expires_at: key_data.expires_at
      }
    end)
  end

  # ========== PRIVATE FUNCTIONS ==========

  @spec generate_key() :: String.t()
  defp generate_key do
    "cyb_" <> (:crypto.strong_rand_bytes(32) |> Base.encode64(padding: false))
  end

  @spec hash_key(String.t()) :: String.t()
  defp hash_key(key) do
    # Use HMAC-SHA256 with a secret (keyed hash prevents rainbow table attacks)
    hmac_secret = Cybernetic.Security.Secrets.hmac_secret()
    :crypto.mac(:hmac, :sha256, hmac_secret, key) |> Base.encode16()
  end
end
