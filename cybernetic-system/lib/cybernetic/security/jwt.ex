defmodule Cybernetic.Security.JWT do
  @moduledoc """
  JWT verification utilities.

  Supports:
  - HS256 verification using `JWT_SECRET` (service-issued tokens)
  - RS256 verification using OIDC JWKS (`OIDC_JWKS_URL` or `OIDC_ISSUER` discovery)

  This module validates:
  - Signature (strict alg match)
  - `exp` (with configurable clock skew)
  - `nbf` (with configurable clock skew)
  - Optional `iss` and `aud` when configured

  JWKS caching is handled by `Cybernetic.Security.JWKSCache` (GenServer-owned ETS).
  """

  require Logger

  alias Cybernetic.Security.JWKSCache

  @default_clock_skew_sec 60

  @type claims :: map()

  @type error_reason ::
          :not_a_jwt
          | :missing_alg
          | {:unsupported_alg, String.t()}
          | :missing_jwks_config
          | :missing_kid
          | {:jwks_fetch_failed, term()}
          | :invalid_signature
          | :token_expired
          | :token_not_yet_valid
          | {:invalid_issuer, String.t() | nil}
          | {:invalid_audience, term()}
          | {:decode_error, term()}

  @doc """
  Verify a JWT and return its claims.

  Accepts both HS256 (using JWT_SECRET) and RS256 (using JWKS).
  """
  @spec verify(String.t()) :: {:ok, claims()} | {:error, error_reason()}
  def verify(token) when is_binary(token) do
    verify_with_algs(token, allowed_algs())
  end

  @doc """
  Verify an external JWT (RS256 only via JWKS).

  Use this for fallback validation when session token is not found in ETS.
  Rejects HS256 to prevent session tokens from becoming stateless after restart.
  """
  @spec verify_external(String.t()) :: {:ok, claims()} | {:error, error_reason()}
  def verify_external(token) when is_binary(token) do
    # Only allow RS256 for external tokens - HS256 session tokens must be in ETS
    verify_with_algs(token, ["RS256"])
  end

  defp verify_with_algs(token, allowed) do
    with true <- jwt_format?(token) || {:error, :not_a_jwt},
         {:ok, header} <- peek_header(token),
         {:ok, alg} <- fetch_alg(header),
         :ok <- validate_alg_in_list(alg, allowed),
         {:ok, jwk} <- resolve_verification_key(alg, header),
         {:ok, claims} <- verify_and_extract_claims(jwk, alg, token),
         :ok <- validate_time_claims(claims),
         :ok <- validate_expected_claims(claims) do
      {:ok, claims}
    end
  end

  defp allowed_algs do
    Application.get_env(:cybernetic, :oidc, [])
    |> Keyword.get(:allowed_algs, ["RS256", "HS256"])
  end

  defp jwt_format?(token) do
    case String.split(token, ".", parts: 4) do
      [_h, _p, _s] -> true
      _ -> false
    end
  end

  defp peek_header(token) do
    json = JOSE.JWS.peek_protected(token)
    Jason.decode(json)
  rescue
    e -> {:error, {:decode_error, e}}
  end

  defp fetch_alg(%{"alg" => alg}) when is_binary(alg) and alg != "", do: {:ok, alg}
  defp fetch_alg(_), do: {:error, :missing_alg}

  defp validate_alg_in_list(alg, allowed) do
    if alg in allowed do
      :ok
    else
      {:error, {:unsupported_alg, alg}}
    end
  end

  defp resolve_verification_key("HS256", _header) do
    # Use centralized secret management for consistent validation
    secret = Cybernetic.Security.Secrets.jwt_secret()
    {:ok, JOSE.JWK.from_oct(secret)}
  rescue
    # If secret loading fails (missing/invalid in prod), treat as missing config
    e in RuntimeError ->
      Logger.warning("JWT secret not available: #{Exception.message(e)}")
      {:error, :missing_jwks_config}
  end

  defp resolve_verification_key("RS256", header) do
    kid = Map.get(header, "kid")

    if is_binary(kid) and kid != "" do
      with {:ok, jwks_url} <- resolve_jwks_url(),
           {:ok, keys} <- get_jwks_keys(jwks_url),
           {:ok, jwk} <- fetch_jwk(keys, kid) do
        {:ok, jwk}
      end
    else
      {:error, :missing_kid}
    end
  end

  defp resolve_verification_key(alg, _header), do: {:error, {:unsupported_alg, alg}}

  defp resolve_jwks_url do
    oidc = Application.get_env(:cybernetic, :oidc, [])

    cond do
      jwks_url = Keyword.get(oidc, :jwks_url) ->
        {:ok, jwks_url}

      issuer = Keyword.get(oidc, :issuer) ->
        discover_jwks_url(issuer)

      true ->
        {:error, :missing_jwks_config}
    end
  end

  # Delegate JWKS discovery and caching to JWKSCache GenServer
  defp discover_jwks_url(issuer) when is_binary(issuer) and issuer != "" do
    JWKSCache.discover_jwks_url(issuer)
  end

  defp discover_jwks_url(_), do: {:error, :missing_jwks_config}

  # Delegate JWKS key fetching to JWKSCache GenServer
  defp get_jwks_keys(jwks_url) when is_binary(jwks_url) do
    JWKSCache.get_keys(jwks_url)
  end

  defp fetch_jwk(keys, kid) when is_map(keys) and is_binary(kid) do
    case Map.fetch(keys, kid) do
      {:ok, jwk} -> {:ok, jwk}
      :error -> {:error, {:jwks_fetch_failed, {:kid_not_found, kid}}}
    end
  end

  defp verify_and_extract_claims(jwk, alg, token) do
    case JOSE.JWT.verify_strict(jwk, [alg], token) do
      {true, %JOSE.JWT{fields: claims}, _jws} when is_map(claims) ->
        {:ok, claims}

      _ ->
        {:error, :invalid_signature}
    end
  end

  defp validate_time_claims(claims) when is_map(claims) do
    now = System.system_time(:second)
    skew = clock_skew_sec()

    exp = normalize_int(claims["exp"])
    nbf = normalize_int(claims["nbf"])

    cond do
      is_integer(exp) and now - skew >= exp ->
        {:error, :token_expired}

      is_integer(nbf) and now + skew < nbf ->
        {:error, :token_not_yet_valid}

      true ->
        :ok
    end
  end

  defp validate_expected_claims(claims) when is_map(claims) do
    oidc = Application.get_env(:cybernetic, :oidc, [])

    with :ok <- validate_issuer(claims, Keyword.get(oidc, :issuer)),
         :ok <- validate_audience(claims, Keyword.get(oidc, :audience)) do
      :ok
    end
  end

  defp validate_issuer(_claims, nil), do: :ok
  defp validate_issuer(_claims, ""), do: :ok

  defp validate_issuer(%{"iss" => iss}, expected) when is_binary(iss) and iss == expected, do: :ok

  defp validate_issuer(_claims, expected), do: {:error, {:invalid_issuer, expected}}

  defp validate_audience(_claims, nil), do: :ok
  defp validate_audience(_claims, ""), do: :ok

  defp validate_audience(claims, expected) when is_binary(expected) and expected != "" do
    case claims do
      %{"aud" => aud} when is_binary(aud) ->
        if aud == expected, do: :ok, else: {:error, {:invalid_audience, aud}}

      %{"aud" => auds} when is_list(auds) ->
        if expected in auds, do: :ok, else: {:error, {:invalid_audience, auds}}

      _ ->
        {:error, {:invalid_audience, :missing}}
    end
  end

  defp validate_audience(_claims, _expected), do: :ok

  defp clock_skew_sec do
    Application.get_env(:cybernetic, :oidc, [])
    |> Keyword.get(:clock_skew_sec, @default_clock_skew_sec)
  end

  defp normalize_int(value) when is_integer(value), do: value
  defp normalize_int(value) when is_float(value), do: trunc(value)

  defp normalize_int(value) when is_binary(value) do
    case Integer.parse(value) do
      {i, ""} -> i
      _ -> nil
    end
  end

  defp normalize_int(_), do: nil
end
