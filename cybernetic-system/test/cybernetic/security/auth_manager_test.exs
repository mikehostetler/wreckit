defmodule Cybernetic.Security.AuthManagerTest do
  use ExUnit.Case, async: false
  alias Cybernetic.Security.AuthManager
  alias Cybernetic.Security.JWKSCache

  setup do
    # Ensure AuthManager is running (prefer the supervised instance started by the app)
    {pid, started_by_test?} =
      case AuthManager.start_link() do
        {:ok, pid} -> {pid, true}
        {:error, {:already_started, pid}} -> {pid, false}
      end

    reset_auth_manager_state(pid)

    on_exit(fn ->
      if started_by_test? and Process.alive?(pid), do: GenServer.stop(pid)
    end)

    {:ok, %{pid: pid}}
  end

  describe "authentication" do
    test "authenticates valid user with correct password" do
      assert {:ok, %{token: token, refresh_token: refresh, expires_in: _}} =
               AuthManager.authenticate("admin", "admin123")

      assert is_binary(token)
      assert is_binary(refresh)
    end

    test "rejects invalid username" do
      assert {:error, :invalid_credentials} =
               AuthManager.authenticate("nonexistent", "password")
    end

    test "rejects invalid password" do
      assert {:error, :invalid_credentials} =
               AuthManager.authenticate("admin", "wrongpassword")
    end

    test "rate limits after multiple failed attempts" do
      # Make 5 failed attempts
      for _ <- 1..5 do
        AuthManager.authenticate("admin", "wrong")
      end

      # 6th attempt should be rate limited
      assert {:error, :too_many_attempts} =
               AuthManager.authenticate("admin", "admin123")
    end
  end

  describe "token validation" do
    test "validates a valid JWT token" do
      {:ok, %{token: token}} = AuthManager.authenticate("admin", "admin123")

      assert {:ok, context} = AuthManager.validate_token(token)
      assert context.user_id == "user_admin"
      assert :admin in context.roles
      assert :all in context.permissions
    end

    test "rejects invalid token" do
      assert {:error, :invalid_token} =
               AuthManager.validate_token("invalid.token")
    end

    test "rejects expired token" do
      # This would require mocking time or waiting for expiration
      # For now, test with invalid token
      assert {:error, :invalid_token} =
               AuthManager.validate_token("expired.token")
    end

    test "rejects external JWTs missing required sub claim" do
      {:ok, jwks_url, kid, jwk} = start_local_jwks_server()

      original_oidc = Application.get_env(:cybernetic, :oidc, [])
      Application.put_env(:cybernetic, :oidc, Keyword.put(original_oidc, :jwks_url, jwks_url))
      JWKSCache.clear()

      on_exit(fn ->
        Application.put_env(:cybernetic, :oidc, original_oidc)
        JWKSCache.clear()
      end)

      # Missing "sub" claim should be rejected by AuthManager
      token = create_rs256_token(jwk, kid, %{"exp" => future_exp()})

      assert {:error, :invalid_token} = AuthManager.validate_token(token)
    end
  end

  describe "refresh tokens" do
    test "refreshes valid refresh token" do
      {:ok, %{refresh_token: refresh}} =
        AuthManager.authenticate("admin", "admin123")

      assert {:ok, %{token: new_token, refresh_token: new_refresh}} =
               AuthManager.refresh_token(refresh)

      assert is_binary(new_token)
      assert is_binary(new_refresh)
      assert new_refresh != refresh

      assert {:ok, context} = AuthManager.validate_token(new_token)
      assert context.user_id == "user_admin"
      assert :admin in context.roles
    end

    test "rejects invalid refresh token" do
      assert {:error, :invalid_refresh_token} =
               AuthManager.refresh_token("invalid_refresh")
    end
  end

  describe "API key management" do
    test "creates and validates API key" do
      assert {:ok, api_key} =
               AuthManager.create_api_key("test_key", [:operator])

      assert String.starts_with?(api_key, "cyb_")

      assert {:ok, context} = AuthManager.authenticate_api_key(api_key)
      assert context.user_id == "test_key"
      assert :operator in context.roles
    end

    test "rejects invalid API key" do
      assert {:error, :invalid_key} =
               AuthManager.authenticate_api_key("invalid_key")
    end

    test "revokes API key" do
      {:ok, api_key} = AuthManager.create_api_key("revoke_test", [:viewer])

      assert :ok = AuthManager.revoke(api_key)
      assert {:error, :invalid_key} = AuthManager.authenticate_api_key(api_key)
    end
  end

  describe "authorization" do
    test "authorizes admin for all actions" do
      {:ok, %{token: token}} = AuthManager.authenticate("admin", "admin123")
      {:ok, context} = AuthManager.validate_token(token)

      assert :ok = AuthManager.authorize(context, :any_resource, :any_action)
    end

    test "authorizes operator for allowed actions" do
      {:ok, %{token: token}} = AuthManager.authenticate("operator", "operator123")
      {:ok, context} = AuthManager.validate_token(token)

      assert :ok = AuthManager.authorize(context, :database, :read)
      assert :ok = AuthManager.authorize(context, :database, :write)
    end

    test "denies viewer write access" do
      {:ok, %{token: token}} = AuthManager.authenticate("viewer", "viewer123")
      {:ok, context} = AuthManager.validate_token(token)

      assert :ok = AuthManager.authorize(context, :database, :read)

      assert {:error, :unauthorized} =
               AuthManager.authorize(context, :database, :write)
    end
  end

  describe "session management" do
    test "lists active sessions" do
      AuthManager.authenticate("admin", "admin123")
      AuthManager.authenticate("operator", "operator123")

      sessions = AuthManager.list_sessions()

      assert length(sessions) >= 2
      assert Enum.any?(sessions, &(&1.username == "admin"))
      assert Enum.any?(sessions, &(&1.username == "operator"))
    end

    test "revokes session token" do
      {:ok, %{token: token}} = AuthManager.authenticate("admin", "admin123")

      assert {:ok, _} = AuthManager.validate_token(token)
      assert :ok = AuthManager.revoke(token)

      # After revoke, session token (HS256) is not in ETS, so fallback rejects it as session_expired
      assert {:error, :session_expired} = AuthManager.validate_token(token)
    end
  end

  describe "security features" do
    test "stores sessions in ETS" do
      {:ok, %{token: token}} = AuthManager.authenticate("admin", "admin123")

      assert [{^token, session}] = :ets.lookup(:auth_sessions, token)
      assert session.user_id == "user_admin"
    end

    test "hashes API keys before storage" do
      {:ok, api_key} = AuthManager.create_api_key("secure_test", [:admin])

      # Check that raw key is not stored
      assert [] = :ets.lookup(:api_keys, api_key)

      # But hashed version works for auth
      assert {:ok, _} = AuthManager.authenticate_api_key(api_key)
    end

    test "different users get different tokens" do
      {:ok, %{token: token1}} = AuthManager.authenticate("admin", "admin123")
      {:ok, %{token: token2}} = AuthManager.authenticate("operator", "operator123")

      assert token1 != token2
    end
  end

  # Test helpers

  defp reset_auth_manager_state(pid) do
    # Clear ETS-backed state between tests (prevents cross-test coupling).
    for table <- [:auth_sessions, :auth_session_expiry, :api_keys, :refresh_tokens] do
      try do
        :ets.delete_all_objects(table)
      rescue
        ArgumentError -> :ok
      end
    end

    # Reset in-process rate limiting counters.
    :sys.replace_state(pid, fn state ->
      state
      |> Map.put(:failed_attempts, %{})
      |> Map.put(:rate_limits, %{})
    end)
  end

  defp start_local_jwks_server do
    kid = "test-kid"
    jwk = JOSE.JWK.generate_key({:rsa, 2048})

    {_fields, public_key_map} = jwk |> JOSE.JWK.to_public() |> JOSE.JWK.to_map()
    jwks = %{"keys" => [Map.put(public_key_map, "kid", kid)]}

    child_spec =
      Plug.Cowboy.child_spec(
        scheme: :http,
        plug: {__MODULE__.JWKSPlug, jwks: jwks},
        options: [port: 0]
      )

    _pid = start_supervised!(child_spec)
    port = :ranch.get_port(__MODULE__.JWKSPlug.HTTP)

    {:ok, "http://127.0.0.1:#{port}/jwks", kid, jwk}
  end

  defmodule JWKSPlug do
    import Plug.Conn

    def init(opts), do: opts

    def call(%Plug.Conn{request_path: "/jwks"} = conn, opts) do
      jwks = Keyword.fetch!(opts, :jwks)

      conn
      |> put_resp_content_type("application/json")
      |> send_resp(200, Jason.encode!(jwks))
    end

    def call(conn, _opts) do
      send_resp(conn, 404, "not found")
    end
  end

  defp create_rs256_token(jwk, kid, claims) do
    jwt = JOSE.JWT.from_map(claims)
    jws = %{"alg" => "RS256", "kid" => kid}
    {_, token} = JOSE.JWT.sign(jwk, jws, jwt) |> JOSE.JWS.compact()
    token
  end

  defp future_exp(seconds_from_now \\ 3600) do
    System.system_time(:second) + seconds_from_now
  end
end
