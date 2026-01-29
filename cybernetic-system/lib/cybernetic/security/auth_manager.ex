defmodule Cybernetic.Security.AuthManager do
  @moduledoc """
  Authentication and Authorization Manager for Cybernetic aMCP Framework.

  Provides:
  - JWT-based authentication
  - API key management
  - Role-Based Access Control (RBAC)
  - Session management
  - Audit logging integration
  """

  use GenServer
  require Logger

  alias Cybernetic.Security.RBAC
  alias Cybernetic.Security.Passwords
  alias Cybernetic.Security.ApiKeys
  alias Cybernetic.Security.Sessions

  @typedoc "User role for RBAC authorization"
  @type role :: :admin | :operator | :viewer | :agent | :system
  @typedoc "Permission atom for fine-grained access control"
  @type permission :: atom()
  @typedoc "JWT authentication token string"
  @type auth_token :: String.t()
  @typedoc "API key for programmatic access"
  @type api_key :: String.t()
  @typedoc "Unique user identifier"
  @type user_id :: String.t()

  @typedoc "Authentication context returned after successful authentication"
  @type auth_context :: %{
          user_id: user_id(),
          roles: [role()],
          permissions: [permission()],
          metadata: map()
        }

  # ========== CONFIGURATION CONSTANTS ==========
  # Session cleanup interval in milliseconds
  @cleanup_interval_ms 60_000

  # Rate limiting configuration
  @rate_limit_window_seconds 300
  @max_failed_attempts 5
  @failed_attempts_history_size 10
  @attempt_cleanup_seconds 3600

  # Circuit breaker for external JWT verification (JWKS fetches)
  # Trips after 5 failures in 60s, resets after 30s
  @jwt_verify_fuse :auth_manager_jwt_verify_fuse
  @jwt_verify_fuse_opts {{:standard, 5, 60_000}, {:reset, 30_000}}

  # Delegate to centralized Secrets module for consistent validation
  @spec get_jwt_secret() :: String.t()
  defp get_jwt_secret, do: Cybernetic.Security.Secrets.jwt_secret()

  # Role definitions delegated to RBAC module

  @doc """
  Starts the Authentication Manager GenServer.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    # Initialize ETS tables via focused modules
    Sessions.init_tables()
    ApiKeys.init_table()

    # Load API keys from environment
    ApiKeys.load_from_env()

    # Install circuit breaker for external JWT verification
    :fuse.install(@jwt_verify_fuse, @jwt_verify_fuse_opts)

    # Start session cleanup timer
    Process.send_after(self(), :cleanup_sessions, @cleanup_interval_ms)

    env = Application.get_env(:cybernetic, :environment, :prod)
    users = load_users(env)
    users_by_id = Map.new(users, fn {_username, user} -> {user.id, user} end)

    state = %{
      sessions: %{},
      api_keys: %{},
      refresh_tokens: %{},
      users: users,
      users_by_id: users_by_id,
      # Track failed auth attempts
      failed_attempts: %{},
      rate_limits: %{}
    }

    Logger.info("AuthManager started with JWT auth and RBAC")

    {:ok, state}
  end

  # ========== PUBLIC API ==========

  @doc """
  Authenticate with username/password and get JWT token.

  Optionally accepts a tenant_id to associate with the session.
  In production, tenant_id should be provided for proper tenant isolation.
  """
  @spec authenticate(String.t(), String.t(), String.t() | nil) :: {:ok, map()} | {:error, atom()}
  def authenticate(username, password, tenant_id \\ nil) do
    GenServer.call(__MODULE__, {:authenticate, username, password, tenant_id})
  end

  @doc """
  Authenticate with API key.
  """
  @spec authenticate_api_key(String.t()) :: {:ok, auth_context()} | {:error, atom()}
  def authenticate_api_key(api_key) do
    GenServer.call(__MODULE__, {:authenticate_api_key, api_key})
  end

  @doc """
  Validate JWT token and return auth context.

  Uses direct ETS read for session tokens (fast path), falling back to
  GenServer call for JWT verification (slow path). This allows high throughput
  for repeated validations of the same session token.
  """
  @spec validate_token(String.t()) :: {:ok, auth_context()} | {:error, atom()}
  def validate_token(token) do
    # Guard: ensure ETS table exists (handles startup/restart race)
    if not Sessions.table_exists?() do
      # Table not ready - fall back to GenServer (will queue until init completes)
      GenServer.call(__MODULE__, {:validate_external_token, token})
    else
      validate_token_fast_path(token)
    end
  end

  defp validate_token_fast_path(token) do
    # Fast path: direct ETS read via Sessions module
    case Sessions.lookup(token) do
      {:ok, session} ->
        {:ok, Sessions.to_auth_context(session)}

      {:error, :expired} ->
        # Expired - need GenServer to delete from ETS
        GenServer.call(__MODULE__, {:validate_expired_token, token})

      {:error, :not_found} ->
        # Not in ETS - need GenServer for JWT verification (may need rate limiting)
        GenServer.call(__MODULE__, {:validate_external_token, token})
    end
  end

  @doc """
  Refresh an expired token using refresh token.
  """
  @spec refresh_token(String.t()) :: {:ok, map()} | {:error, atom()}
  def refresh_token(refresh_token) do
    GenServer.call(__MODULE__, {:refresh_token, refresh_token})
  end

  @doc """
  Authorize an action based on auth context.
  """
  @spec authorize(auth_context(), atom(), atom()) :: :ok | {:error, :unauthorized}
  def authorize(auth_context, resource, action) do
    GenServer.call(__MODULE__, {:authorize, auth_context, resource, action})
  end

  @doc """
  Create a new API key with specified permissions.
  """
  @spec create_api_key(String.t(), [role()], keyword()) :: {:ok, String.t()}
  def create_api_key(name, roles, opts \\ []) do
    GenServer.call(__MODULE__, {:create_api_key, name, roles, opts})
  end

  @doc """
  Revoke an API key or JWT token.
  """
  @spec revoke(String.t()) :: :ok | {:error, :not_found}
  def revoke(token_or_key) do
    GenServer.call(__MODULE__, {:revoke, token_or_key})
  end

  @doc """
  List active sessions.
  """
  @spec list_sessions() :: [map()]
  def list_sessions do
    GenServer.call(__MODULE__, :list_sessions)
  end

  # ========== CALLBACKS ==========

  @impl true
  def handle_call({:authenticate, username, password, tenant_id}, _from, state) do
    # Check rate limiting
    case check_rate_limit(username, state) do
      {:ok, state} ->
        # Verify credentials (in production, check against secure store)
        case verify_credentials(username, password, state.users) do
          {:ok, user} ->
            # Generate tokens
            jwt = generate_jwt(user)
            refresh = generate_refresh_token(user)

            # Store session via Sessions module
            Sessions.create(user, jwt, refresh, tenant_id)

            # Audit log (disabled for now)
            Logger.info("User authenticated: #{username}")

            # Emit telemetry
            :telemetry.execute(
              [:cybernetic, :auth, :login],
              %{count: 1},
              %{user: username, method: :password}
            )

            {:reply, {:ok, %{token: jwt, refresh_token: refresh, expires_in: Sessions.jwt_ttl_seconds()}},
             state}

          {:error, reason} ->
            # Track failed attempt
            state = track_failed_attempt(username, state)

            # Telemetry for security monitoring (attack detection)
            :telemetry.execute(
              [:cybernetic, :auth, :login_failed],
              %{count: 1},
              %{user: username, reason: reason}
            )

            Logger.warning("Authentication failed for #{username}: #{reason}")

            {:reply, {:error, :invalid_credentials}, state}
        end

      {:error, :rate_limited} ->
        # Telemetry for rate limit monitoring (brute force detection)
        :telemetry.execute(
          [:cybernetic, :auth, :rate_limited],
          %{count: 1},
          %{user: username}
        )

        Logger.warning("Rate limited: #{username}")
        {:reply, {:error, :too_many_attempts}, state}
    end
  end

  @impl true
  def handle_call({:authenticate_api_key, api_key}, _from, state) do
    # Delegate to ApiKeys module
    {:reply, ApiKeys.authenticate(api_key), state}
  end

  # Handle expired token - delete from ETS and return error
  @impl true
  def handle_call({:validate_expired_token, token}, _from, state) do
    Sessions.delete(token)
    {:reply, {:error, :token_expired}, state}
  end

  # Handle external JWT verification (RS256 only, falls through from fast path)
  @impl true
  def handle_call({:validate_external_token, token}, _from, state) do
    # Not a local session token; try verifying it as an external JWT (RS256 only).
    # HS256 tokens must be in ETS (session tokens don't survive restart).
    # Circuit breaker protects against JWKS endpoint failures.
    result = verify_external_with_circuit_breaker(token)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:refresh_token, refresh_token}, _from, state) do
    case Sessions.lookup_refresh_token(refresh_token) do
      {:ok, {user_id, tenant_id}} ->
        # Generate new tokens
        user =
          Map.get(state.users_by_id, user_id) ||
            %{
              id: user_id,
              username: user_id,
              roles: [:viewer]
            }

        new_jwt = generate_jwt(user)
        new_refresh = generate_refresh_token(user)

        # Delete old refresh token and create new session
        Sessions.delete_refresh_token(refresh_token)
        Sessions.create(user, new_jwt, new_refresh, tenant_id)

        Logger.info("Token refreshed for user: #{user_id}")

        {:reply,
         {:ok, %{token: new_jwt, refresh_token: new_refresh, expires_in: Sessions.jwt_ttl_seconds()}},
         state}

      {:error, :not_found} ->
        {:reply, {:error, :invalid_refresh_token}, state}
    end
  end

  @impl true
  def handle_call({:authorize, auth_context, resource, action}, _from, state) do
    authorized? =
      case auth_context.permissions do
        [:all | _] ->
          true

        permissions ->
          # Check specific resource/action authorization
          # Check if user has the specific action permission
          RBAC.check_resource_permission(permissions, resource, action) ||
            action in permissions
      end

    if authorized? do
      Logger.debug("Authorization granted: #{auth_context.user_id} -> #{resource}:#{action}")

      {:reply, :ok, state}
    else
      # Telemetry for unauthorized access attempts (security monitoring)
      :telemetry.execute(
        [:cybernetic, :auth, :authorization_denied],
        %{count: 1},
        %{user: auth_context.user_id, resource: resource, action: action}
      )

      Logger.warning("Authorization denied: #{auth_context.user_id} -> #{resource}:#{action}")

      {:reply, {:error, :unauthorized}, state}
    end
  end

  @impl true
  def handle_call({:create_api_key, name, roles, opts}, _from, state) do
    # Delegate to ApiKeys module
    {:reply, ApiKeys.create(name, roles, opts), state}
  end

  @impl true
  def handle_call({:revoke, token_or_key}, _from, state) do
    # Try as JWT session first, then as API key
    case Sessions.delete(token_or_key) do
      :ok ->
        {:reply, :ok, state}

      {:error, :not_found} ->
        # Try as API key
        {:reply, ApiKeys.revoke(token_or_key), state}
    end
  end

  @impl true
  def handle_call(:list_sessions, _from, state) do
    # Delegate to Sessions module
    {:reply, Sessions.list(), state}
  end

  @impl true
  def handle_info(:cleanup_sessions, state) do
    # Delegate session cleanup to Sessions module
    Sessions.cleanup_expired()

    # Reset rate limit counters older than 1 hour
    state = %{
      state
      | failed_attempts: clean_old_attempts(state.failed_attempts),
        rate_limits: %{}
    }

    # Schedule next cleanup
    Process.send_after(self(), :cleanup_sessions, @cleanup_interval_ms)

    {:noreply, state}
  end

  # ========== PRIVATE FUNCTIONS ==========

  @spec verify_external_with_circuit_breaker(String.t()) :: {:ok, map()} | {:error, atom()}
  defp verify_external_with_circuit_breaker(token) do
    with :ok <- check_circuit_breaker(),
         {:ok, claims} <- verify_external_jwt(token),
         {:ok, auth_context} <- auth_context_from_claims(claims) do
      {:ok, auth_context}
    else
      :blown ->
        Logger.warning("External JWT verification circuit breaker open")
        {:error, :service_unavailable}

      {:error, :token_expired} ->
        {:error, :token_expired}

      {:error, {:unsupported_alg, "HS256"}} ->
        {:error, :session_expired}

      {:error, {:jwks_fetch_failed, _} = reason} ->
        :fuse.melt(@jwt_verify_fuse)
        Logger.warning("JWKS fetch failed, circuit breaker triggered", reason: inspect(reason))
        {:error, :service_unavailable}

      {:error, :missing_sub} ->
        Logger.warning("External JWT missing required sub claim")
        {:error, :invalid_token}

      {:error, reason} ->
        Logger.warning("External JWT validation failed", reason: inspect(reason))
        {:error, :invalid_token}
    end
  end

  @spec check_circuit_breaker() :: :ok | :blown
  defp check_circuit_breaker do
    case :fuse.ask(@jwt_verify_fuse, :sync) do
      :ok -> :ok
      :blown -> :blown
      {:error, :not_found} -> :ok  # Fuse not installed, allow through
    end
  end

  @spec verify_external_jwt(String.t()) :: {:ok, map()} | {:error, term()}
  defp verify_external_jwt(token) do
    Cybernetic.Security.JWT.verify_external(token)
  end

  @spec verify_credentials(String.t(), String.t(), map()) :: {:ok, map()} | {:error, atom()}
  defp verify_credentials(username, password, users) when is_map(users) do
    case Map.get(users, username) do
      nil ->
        {:error, :user_not_found}

      user ->
        if Passwords.verify(password, user.password_hash) do
          {:ok, user}
        else
          {:error, :invalid_password}
        end
    end
  end

  @spec load_users(atom()) :: map()
  defp load_users(env) do
    users = get_configured_users()

    if map_size(users) == 0 and env in [:dev, :test] do
      %{
        "admin" => %{
          id: "user_admin",
          username: "admin",
          password_hash: Passwords.hash("admin123"),
          roles: [:admin]
        },
        "operator" => %{
          id: "user_operator",
          username: "operator",
          password_hash: Passwords.hash("operator123"),
          roles: [:operator]
        },
        "viewer" => %{
          id: "user_viewer",
          username: "viewer",
          password_hash: Passwords.hash("viewer123"),
          roles: [:viewer]
        }
      }
    else
      users
    end
  end

  @spec generate_jwt(map()) :: String.t()
  defp generate_jwt(user) do
    claims = %{
      "sub" => user.id,
      "username" => user.username,
      "roles" => user.roles,
      "iat" => DateTime.to_unix(DateTime.utc_now()),
      "exp" => DateTime.to_unix(DateTime.add(DateTime.utc_now(), Sessions.jwt_ttl_seconds(), :second))
    }

    jwk = JOSE.JWK.from_oct(get_jwt_secret())

    jwk
    |> JOSE.JWT.sign(%{"alg" => "HS256"}, claims)
    |> JOSE.JWS.compact()
    |> elem(1)
  end

  @spec generate_refresh_token(map()) :: String.t()
  defp generate_refresh_token(_user) do
    :crypto.strong_rand_bytes(32) |> Base.encode64()
  end


  @spec auth_context_from_claims(map()) :: {:ok, auth_context()} | {:error, :missing_sub}
  defp auth_context_from_claims(claims) when is_map(claims) do
    sub = claims["sub"]

    if not (is_binary(sub) and sub != "") do
      {:error, :missing_sub}
    else
      roles =
        case claims["roles"] do
          roles when is_list(roles) ->
            roles
            |> Enum.map(&to_string/1)
            |> Enum.map(&String.downcase/1)
            |> Enum.map(&RBAC.parse_role/1)
            |> Enum.reject(&is_nil/1)

          role when is_binary(role) ->
            role
            |> String.split(",", trim: true)
            |> Enum.map(&String.downcase/1)
            |> Enum.map(&RBAC.parse_role/1)
            |> Enum.reject(&is_nil/1)

          _ ->
            []
        end

      roles = if roles == [], do: [:viewer], else: roles

      # Type-safe extraction of username (validate all sources are strings)
      username = extract_string_claim(claims, ["username", "preferred_username", "email"])
      tenant_id = extract_string_claim(claims, ["tenant_id", "tid"])

      {:ok,
       %{
         user_id: sub,
         roles: roles,
         permissions: RBAC.expand_permissions(roles),
         metadata: %{
           username: username,
           tenant_id: tenant_id,
           auth_method: :jwt
         }
       }}
    end
  end

  # Extract a string claim from multiple possible keys, validating type
  @spec extract_string_claim(map(), [String.t()]) :: String.t() | nil
  defp extract_string_claim(claims, keys) when is_map(claims) and is_list(keys) do
    Enum.find_value(keys, fn key ->
      case Map.get(claims, key) do
        value when is_binary(value) and value != "" -> value
        _ -> nil
      end
    end)
  end

  @spec check_rate_limit(String.t(), map()) :: {:ok, map()} | {:error, :rate_limited}
  defp check_rate_limit(username, state) do
    attempts = Map.get(state.failed_attempts, username, [])

    recent_attempts =
      attempts
      |> Enum.filter(fn time ->
        # 5 minutes
        DateTime.diff(DateTime.utc_now(), time, :second) < @rate_limit_window_seconds
      end)

    if length(recent_attempts) >= @max_failed_attempts do
      {:error, :rate_limited}
    else
      {:ok, state}
    end
  end

  @spec track_failed_attempt(String.t(), map()) :: map()
  defp track_failed_attempt(username, state) do
    attempts = Map.get(state.failed_attempts, username, [])
    new_attempts = [DateTime.utc_now() | attempts] |> Enum.take(@failed_attempts_history_size)

    %{state | failed_attempts: Map.put(state.failed_attempts, username, new_attempts)}
  end

  @spec clean_old_attempts(map()) :: map()
  defp clean_old_attempts(failed_attempts) do
    cutoff = DateTime.add(DateTime.utc_now(), -@attempt_cleanup_seconds, :second)

    failed_attempts
    |> Enum.map(fn {username, attempts} ->
      filtered =
        Enum.filter(attempts, fn time ->
          DateTime.compare(time, cutoff) == :gt
        end)

      {username, filtered}
    end)
    |> Enum.reject(fn {_username, attempts} -> Enum.empty?(attempts) end)
    |> Map.new()
  end

  @spec get_configured_users() :: map()
  defp get_configured_users do
    # Load users from environment variables
    # Format: CYBERNETIC_USER_<USERNAME>=<password>:<role1,role2>
    # Example: CYBERNETIC_USER_ADMIN=secure_pass:admin,operator

    System.get_env()
    |> Enum.filter(fn {key, _value} -> String.starts_with?(key, "CYBERNETIC_USER_") end)
    |> Enum.reduce(%{}, fn {key, value}, acc ->
      username = String.replace(key, "CYBERNETIC_USER_", "") |> String.downcase()

      case String.split(value, ":", parts: 2) do
        [password, roles_str] ->
          roles =
            roles_str
            |> String.split(",", trim: true)
            |> Enum.map(&String.downcase/1)
            |> Enum.map(&RBAC.parse_role/1)
            |> Enum.reject(&is_nil/1)

          if roles == [] do
            Logger.warning("No valid roles configured for #{key}")
            acc
          else
            user = %{
              id: "user_#{username}",
              username: username,
              password_hash: Passwords.hash(password),
              roles: roles
            }

            Map.put(acc, username, user)
          end

        _ ->
          Logger.warning("Invalid user config format for #{key}")
          acc
      end
    end)
  end

end
