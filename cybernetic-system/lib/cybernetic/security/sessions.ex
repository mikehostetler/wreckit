defmodule Cybernetic.Security.Sessions do
  @moduledoc """
  Session management for JWT-based authentication.

  Handles session storage, lifecycle, and cleanup using ETS tables for
  high-performance concurrent access.

  ## VSM Architecture

  This module operates as part of System 1 (Operations) in the Viable
  System Model, providing session state management for authenticated users.

  ## ETS Tables

  - `:auth_sessions` - Maps JWT token to session data
  - `:refresh_tokens` - Maps refresh token to (user_id, tenant_id)
  - `:auth_session_expiry` - Ordered index for O(log n) cleanup

  ## Session Lifecycle

  1. Created on successful authentication
  2. Validated on each request (fast ETS lookup)
  3. Refreshed using refresh token before expiry
  4. Cleaned up automatically when expired
  5. Revoked explicitly on logout
  """

  require Logger

  alias Cybernetic.Security.RBAC

  @typedoc "Session data stored in ETS"
  @type session :: %{
          user_id: String.t(),
          username: String.t(),
          roles: [atom()],
          tenant_id: String.t() | nil,
          jwt: String.t(),
          refresh_token: String.t(),
          created_at: DateTime.t(),
          expires_at: DateTime.t()
        }

  # ETS table names
  @sessions_table :auth_sessions
  @refresh_table :refresh_tokens
  @expiry_table :auth_session_expiry

  # JWT TTL in seconds (1 hour)
  @jwt_ttl_seconds 3600

  # ========== ETS TABLE MANAGEMENT ==========

  @doc """
  Initialize all session-related ETS tables.

  Called by AuthManager during GenServer init. Tables are protected
  so only the owning process can write, but any process can read.
  """
  @spec init_tables() :: :ok
  def init_tables do
    # Main session storage
    :ets.new(@sessions_table, [:set, :protected, :named_table, {:read_concurrency, true}])

    # Refresh token mapping
    :ets.new(@refresh_table, [:set, :protected, :named_table, {:read_concurrency, true}])

    # Expiry index for O(log n) cleanup
    :ets.new(@expiry_table, [:ordered_set, :protected, :named_table])

    :ok
  end

  # ========== SESSION OPERATIONS ==========

  @doc """
  Create a new session for an authenticated user.

  Stores the session in ETS and returns the JWT and refresh token.
  """
  @spec create(map(), String.t(), String.t(), String.t() | nil) :: session()
  def create(user, jwt, refresh_token, tenant_id) when is_map(user) and is_binary(jwt) and is_binary(refresh_token) do
    session = %{
      user_id: user.id,
      username: user.username,
      roles: user.roles,
      tenant_id: tenant_id,
      jwt: jwt,
      refresh_token: refresh_token,
      created_at: DateTime.utc_now(),
      expires_at: DateTime.add(DateTime.utc_now(), @jwt_ttl_seconds, :second)
    }

    :ets.insert(@sessions_table, {jwt, session})
    :ets.insert(@refresh_table, {refresh_token, {user.id, tenant_id}})

    # Index by expiry for O(log n) cleanup
    expiry_key = {DateTime.to_unix(session.expires_at), jwt}
    :ets.insert(@expiry_table, {expiry_key, refresh_token})

    Logger.info("Session created for user: #{user.username}")

    session
  end

  @doc """
  Look up a session by JWT token.

  Returns `{:ok, session}` if found and not expired, otherwise an error.
  This is the fast path used for token validation.
  """
  @spec lookup(String.t()) :: {:ok, session()} | {:error, :not_found | :expired}
  def lookup(token) do
    case :ets.lookup(@sessions_table, token) do
      [{^token, session}] ->
        if DateTime.compare(DateTime.utc_now(), session.expires_at) == :lt do
          {:ok, session}
        else
          {:error, :expired}
        end

      [] ->
        {:error, :not_found}
    end
  end

  @doc """
  Convert a session to an auth context for use in authorization.
  """
  @spec to_auth_context(session()) :: map()
  def to_auth_context(session) do
    %{
      user_id: session.user_id,
      roles: session.roles,
      permissions: RBAC.expand_permissions(session.roles),
      metadata: %{
        username: session.username,
        tenant_id: session.tenant_id,
        auth_method: :jwt
      }
    }
  end

  @doc """
  Look up a refresh token and return the associated user_id and tenant_id.
  """
  @spec lookup_refresh_token(String.t()) :: {:ok, {String.t(), String.t() | nil}} | {:error, :not_found}
  def lookup_refresh_token(refresh_token) when is_binary(refresh_token) do
    case :ets.lookup(@refresh_table, refresh_token) do
      [{^refresh_token, {user_id, tenant_id}}] ->
        {:ok, {user_id, tenant_id}}

      [] ->
        {:error, :not_found}
    end
  end

  @doc """
  Delete a session by JWT token.
  """
  @spec delete(String.t()) :: :ok | {:error, :not_found}
  def delete(token) do
    case :ets.lookup(@sessions_table, token) do
      [{^token, session}] ->
        :ets.delete(@sessions_table, token)
        :ets.delete(@refresh_table, session.refresh_token)

        # Clean up expiry index
        expiry_key = {DateTime.to_unix(session.expires_at), token}
        :ets.delete(@expiry_table, expiry_key)

        Logger.info("Session revoked for user: #{session.user_id}")
        :ok

      [] ->
        {:error, :not_found}
    end
  end

  @doc """
  Delete an old refresh token (used during token refresh).
  """
  @spec delete_refresh_token(String.t()) :: :ok
  def delete_refresh_token(refresh_token) do
    :ets.delete(@refresh_table, refresh_token)
    :ok
  end

  @doc """
  List all active sessions (for admin monitoring).
  """
  @spec list() :: [map()]
  def list do
    :ets.tab2list(@sessions_table)
    |> Enum.map(fn {_token, session} ->
      %{
        user_id: session.user_id,
        username: session.username,
        tenant_id: session.tenant_id,
        created_at: session.created_at,
        expires_at: session.expires_at
      }
    end)
  end

  @doc """
  Check if the sessions ETS table exists.

  Used to handle startup race conditions.
  """
  @spec table_exists?() :: boolean()
  def table_exists? do
    :ets.whereis(@sessions_table) != :undefined
  end

  # ========== CLEANUP ==========

  @doc """
  Clean up expired sessions.

  Uses the expiry index for O(log n) cleanup instead of scanning all sessions.
  Returns the count of sessions cleaned up.
  """
  @spec cleanup_expired() :: non_neg_integer()
  def cleanup_expired do
    now_unix = DateTime.to_unix(DateTime.utc_now())

    # Select all expired entries: keys where expiry_timestamp <= now
    expired =
      :ets.select(
        @expiry_table,
        [{{{:"$1", :"$2"}, :"$3"}, [{:"=<", :"$1", now_unix}], [{{:"$2", :"$3"}}]}]
      )

    # Delete each expired session
    Enum.each(expired, fn {token, refresh_token} ->
      :ets.delete(@sessions_table, token)
      :ets.delete(@refresh_table, refresh_token)
      Logger.debug("Cleaned up expired session", token_prefix: String.slice(token, 0, 8))
    end)

    # Delete from expiry index using range delete
    if length(expired) > 0 do
      :ets.select_delete(
        @expiry_table,
        [{{{:"$1", :_}, :_}, [{:"=<", :"$1", now_unix}], [true]}]
      )

      Logger.debug("Session cleanup complete", expired_count: length(expired))
    end

    length(expired)
  end

  @doc """
  Return the JWT TTL in seconds.
  """
  @spec jwt_ttl_seconds() :: pos_integer()
  def jwt_ttl_seconds, do: @jwt_ttl_seconds
end
