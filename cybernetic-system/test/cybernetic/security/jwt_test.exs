defmodule Cybernetic.Security.JWTTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Security.JWT
  alias Cybernetic.Security.JWKSCache

  # Test HS256 secret for signing test tokens
  @test_secret "test-secret-at-least-32-characters-long"

  setup_all do
    # Start JWKS cache if not already running
    case Process.whereis(JWKSCache) do
      nil ->
        {:ok, _pid} = start_supervised(JWKSCache)

      _ ->
        :ok
    end

    :ok
  end

  setup do
    # Ensure JWT_SECRET is set for HS256 tests
    original_secret = System.get_env("JWT_SECRET")
    System.put_env("JWT_SECRET", @test_secret)

    on_exit(fn ->
      if original_secret do
        System.put_env("JWT_SECRET", original_secret)
      else
        System.delete_env("JWT_SECRET")
      end
    end)

    :ok
  end

  describe "verify/1 format validation" do
    test "rejects non-JWT strings" do
      assert {:error, :not_a_jwt} = JWT.verify("not-a-jwt")
      assert {:error, :not_a_jwt} = JWT.verify("only.two")
      assert {:error, :not_a_jwt} = JWT.verify("")
      # 4+ parts also invalid
      assert {:error, :not_a_jwt} = JWT.verify("one.two.three.four")
    end

    test "rejects tokens with invalid base64" do
      # Valid format (3 parts) but garbage content - should fail on decode
      result = JWT.verify("!!!.!!!.!!!")
      # Could be either :not_a_jwt or a decode error
      assert match?({:error, _}, result)
    end
  end

  describe "verify/1 with HS256" do
    test "accepts valid HS256 token" do
      token = create_hs256_token(%{"sub" => "user123", "exp" => future_exp()})
      assert {:ok, claims} = JWT.verify(token)
      assert claims["sub"] == "user123"
    end

    test "rejects HS256 token with wrong secret" do
      token = create_hs256_token(%{"sub" => "user123", "exp" => future_exp()}, "wrong-secret")
      assert {:error, :invalid_signature} = JWT.verify(token)
    end

    test "rejects token with missing alg header" do
      # Create a token with no alg
      header = %{} |> Jason.encode!() |> Base.url_encode64(padding: false)
      payload = %{"sub" => "test"} |> Jason.encode!() |> Base.url_encode64(padding: false)
      token = "#{header}.#{payload}.fake-sig"
      assert {:error, :missing_alg} = JWT.verify(token)
    end

    test "rejects token with unsupported algorithm" do
      # Create a token with alg=ES512 which is not in default allowed list
      # We manually construct the token to test this
      header =
        %{"alg" => "ES512", "typ" => "JWT"}
        |> Jason.encode!()
        |> Base.url_encode64(padding: false)

      payload =
        %{"sub" => "test", "exp" => future_exp()}
        |> Jason.encode!()
        |> Base.url_encode64(padding: false)

      # Fake signature - won't verify but should fail on alg check first
      token = "#{header}.#{payload}.fake-sig"
      assert {:error, {:unsupported_alg, "ES512"}} = JWT.verify(token)
    end
  end

  describe "verify/1 time claims" do
    test "rejects expired token" do
      token = create_hs256_token(%{"sub" => "user123", "exp" => past_exp()})
      assert {:error, :token_expired} = JWT.verify(token)
    end

    test "accepts token within clock skew" do
      # Token that expired 30 seconds ago (within default 60s skew)
      exp = System.system_time(:second) - 30
      token = create_hs256_token(%{"sub" => "user123", "exp" => exp})
      assert {:ok, _} = JWT.verify(token)
    end

    test "rejects token outside clock skew" do
      # Token that expired 120 seconds ago (outside default 60s skew)
      exp = System.system_time(:second) - 120
      token = create_hs256_token(%{"sub" => "user123", "exp" => exp})
      assert {:error, :token_expired} = JWT.verify(token)
    end

    test "rejects not-yet-valid token (nbf in future)" do
      nbf = System.system_time(:second) + 120
      token = create_hs256_token(%{"sub" => "user123", "exp" => future_exp(), "nbf" => nbf})
      assert {:error, :token_not_yet_valid} = JWT.verify(token)
    end

    test "accepts token with nbf within clock skew" do
      # Token that becomes valid in 30 seconds (within default 60s skew)
      nbf = System.system_time(:second) + 30
      token = create_hs256_token(%{"sub" => "user123", "exp" => future_exp(), "nbf" => nbf})
      assert {:ok, _} = JWT.verify(token)
    end
  end

  describe "verify/1 issuer validation" do
    setup do
      original = Application.get_env(:cybernetic, :oidc)
      Application.put_env(:cybernetic, :oidc, issuer: "https://auth.example.com")

      on_exit(fn ->
        if original do
          Application.put_env(:cybernetic, :oidc, original)
        else
          Application.delete_env(:cybernetic, :oidc)
        end
      end)

      :ok
    end

    test "accepts token with matching issuer" do
      token =
        create_hs256_token(%{
          "sub" => "user123",
          "exp" => future_exp(),
          "iss" => "https://auth.example.com"
        })

      assert {:ok, claims} = JWT.verify(token)
      assert claims["iss"] == "https://auth.example.com"
    end

    test "rejects token with wrong issuer" do
      token =
        create_hs256_token(%{
          "sub" => "user123",
          "exp" => future_exp(),
          "iss" => "https://wrong.example.com"
        })

      assert {:error, {:invalid_issuer, _}} = JWT.verify(token)
    end
  end

  describe "verify/1 audience validation" do
    setup do
      original = Application.get_env(:cybernetic, :oidc)
      Application.put_env(:cybernetic, :oidc, audience: "my-api")

      on_exit(fn ->
        if original do
          Application.put_env(:cybernetic, :oidc, original)
        else
          Application.delete_env(:cybernetic, :oidc)
        end
      end)

      :ok
    end

    test "accepts token with matching audience" do
      token = create_hs256_token(%{"sub" => "user123", "exp" => future_exp(), "aud" => "my-api"})
      assert {:ok, _} = JWT.verify(token)
    end

    test "accepts token with audience array containing expected value" do
      token =
        create_hs256_token(%{
          "sub" => "user123",
          "exp" => future_exp(),
          "aud" => ["other-api", "my-api"]
        })

      assert {:ok, _} = JWT.verify(token)
    end

    test "rejects token with wrong audience" do
      token =
        create_hs256_token(%{"sub" => "user123", "exp" => future_exp(), "aud" => "wrong-api"})

      assert {:error, {:invalid_audience, _}} = JWT.verify(token)
    end

    test "rejects token with missing audience when required" do
      token = create_hs256_token(%{"sub" => "user123", "exp" => future_exp()})
      assert {:error, {:invalid_audience, :missing}} = JWT.verify(token)
    end
  end

  describe "verify/1 without issuer/audience config" do
    setup do
      # Clear OIDC config
      original = Application.get_env(:cybernetic, :oidc)
      Application.delete_env(:cybernetic, :oidc)

      on_exit(fn ->
        if original do
          Application.put_env(:cybernetic, :oidc, original)
        end
      end)

      :ok
    end

    test "accepts token without iss/aud when not required" do
      token = create_hs256_token(%{"sub" => "user123", "exp" => future_exp()})
      assert {:ok, _} = JWT.verify(token)
    end
  end

  describe "verify_external/1" do
    test "rejects HS256 tokens (session tokens must be in ETS)" do
      token = create_hs256_token(%{"sub" => "user123", "exp" => future_exp()})
      assert {:error, {:unsupported_alg, "HS256"}} = JWT.verify_external(token)
    end

    test "rejects HS256 even with valid signature" do
      # Even a perfectly valid HS256 token should be rejected by verify_external
      token =
        create_hs256_token(%{
          "sub" => "user123",
          "exp" => future_exp(),
          "iss" => "https://auth.example.com",
          "aud" => "my-api"
        })

      assert {:error, {:unsupported_alg, "HS256"}} = JWT.verify_external(token)
    end
  end

  # Helper functions

  defp create_hs256_token(claims, secret \\ @test_secret) do
    jwk = JOSE.JWK.from_oct(secret)
    jws = %{"alg" => "HS256"}
    jwt = JOSE.JWT.from_map(claims)
    {_, token} = JOSE.JWT.sign(jwk, jws, jwt) |> JOSE.JWS.compact()
    token
  end

  defp future_exp(seconds_from_now \\ 3600) do
    System.system_time(:second) + seconds_from_now
  end

  defp past_exp(seconds_ago \\ 3600) do
    System.system_time(:second) - seconds_ago
  end
end
