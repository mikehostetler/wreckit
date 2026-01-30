defmodule Cybernetic.Edge.Gateway.Plugs.OIDC do
  @moduledoc """
  Authentication plug for the Edge Gateway.

  Production behavior:
  - Requires either `Authorization: Bearer <token>` or `x-api-key: <key>`
  - Uses `Cybernetic.Security.AuthManager` for validation

  Dev/test behavior:
  - Allows unauthenticated access (assigns a default tenant)
  - Still accepts auth headers if provided
  """
  @behaviour Plug
  import Plug.Conn
  require Logger

  @doc """
  Initialize the OIDC authentication plug.
  """
  @spec init(keyword()) :: keyword()
  def init(opts), do: opts

  @doc """
  Authenticate requests using Bearer token or API key.
  """
  @spec call(Plug.Conn.t(), keyword()) :: Plug.Conn.t()
  def call(conn, _opts) do
    env = Application.get_env(:cybernetic, :environment, :prod)

    case authenticate(conn) do
      {:ok, auth_context} ->
        case tenant_id_from_auth(auth_context) do
          {:ok, tenant_id} ->
            conn
            |> assign(:auth_context, auth_context)
            |> assign(:tenant_id, tenant_id)

          {:error, :missing_tenant_context} ->
            Logger.error("P0 Security: Auth succeeded but missing tenant context in production")
            reject(conn, 401, "missing_tenant", "Authentication requires tenant context")
        end

      {:error, :missing_credentials} when env in [:dev, :test] ->
        Logger.debug("Edge auth: dev/test mode - assigning default tenant")
        assign(conn, :tenant_id, "default-tenant")

      {:error, :missing_credentials} ->
        reject(conn, 401, "unauthorized", "Missing Authorization bearer token or x-api-key")

      {:error, reason} ->
        Logger.warning("Edge auth failed", reason: inspect(reason))
        reject(conn, 401, "unauthorized", "Invalid credentials")
    end
  end

  defp authenticate(conn) do
    cond do
      bearer = bearer_token(conn) ->
        Cybernetic.Security.AuthManager.validate_token(bearer)

      api_key = api_key(conn) ->
        Cybernetic.Security.AuthManager.authenticate_api_key(api_key)

      true ->
        {:error, :missing_credentials}
    end
  rescue
    # Handle specific known exceptions to avoid masking programming errors
    e in [ArgumentError] ->
      Logger.warning("Authentication raised exception", error: inspect(e))
      {:error, {:exception, e}}
  end

  # Tenant isolation: Extract tenant_id from auth context
  # In production, explicit tenant_id is required to prevent cross-tenant access
  # Returns {:ok, tenant_id} or {:error, :missing_tenant_context}
  @spec tenant_id_from_auth(map()) :: {:ok, String.t()} | {:error, :missing_tenant_context}
  defp tenant_id_from_auth(%{metadata: %{tenant_id: tenant_id}}) when is_binary(tenant_id),
    do: {:ok, tenant_id}

  defp tenant_id_from_auth(%{user_id: user_id}) when is_binary(user_id) do
    env = Application.get_env(:cybernetic, :environment, :prod)

    if env == :prod do
      # In production, require explicit tenant_id claim - no fallback to user_id
      # This prevents cross-tenant data access when tenant_id is missing
      Logger.error("Auth context missing tenant_id in production - rejecting",
        user_id: user_id
      )
      {:error, :missing_tenant_context}
    else
      # In dev/test, fall back to user_id for convenience
      {:ok, user_id}
    end
  end

  defp tenant_id_from_auth(_) do
    env = Application.get_env(:cybernetic, :environment, :prod)

    if env == :prod do
      Logger.error("Auth context missing both tenant_id and user_id in production")
      # P0 Security: Reject instead of returning fake tenant
      {:error, :missing_tenant_context}
    else
      {:ok, "unknown"}
    end
  end

  defp bearer_token(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] when token != "" -> token
      ["bearer " <> token] when token != "" -> token
      _ -> nil
    end
  end

  defp api_key(conn) do
    case get_req_header(conn, "x-api-key") do
      [key] when is_binary(key) and key != "" -> key
      _ -> nil
    end
  end

  defp reject(conn, status, error, message) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(%{error: error, message: message}))
    |> halt()
  end
end
