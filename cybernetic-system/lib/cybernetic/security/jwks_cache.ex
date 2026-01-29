defmodule Cybernetic.Security.JWKSCache do
  @moduledoc """
  GenServer-owned cache for JWKS keys and OIDC discovery.

  Security: ETS table is :protected (only this GenServer can write).
  Callers read via GenServer.call to ensure consistent cache state.

  Features:
  - TTL-based cache expiration (default 5 minutes)
  - Strict timeouts on HTTP fetches (prevents slow loris)
  - HTTPS enforcement in production for JWKS URLs
  """

  use GenServer
  require Logger

  alias Cybernetic.Security.SSRF

  @cache_table :cybernetic_jwks_cache
  @default_ttl_ms :timer.minutes(5)
  @http_timeout_ms 10_000
  @http_connect_timeout_ms 5_000
  # Disable redirects to prevent SSRF via redirect to internal host
  @max_redirects 0

  # Public API

  @doc "Start the JWKS cache GenServer"
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Get JWKS keys for a URL (cached)"
  @spec get_keys(String.t()) :: {:ok, map()} | {:error, term()}
  def get_keys(jwks_url) when is_binary(jwks_url) do
    GenServer.call(__MODULE__, {:get_keys, jwks_url}, @http_timeout_ms + 5_000)
  end

  @doc "Discover JWKS URL from OIDC issuer (cached)"
  @spec discover_jwks_url(String.t()) :: {:ok, String.t()} | {:error, term()}
  def discover_jwks_url(issuer) when is_binary(issuer) do
    GenServer.call(__MODULE__, {:discover_jwks_url, issuer}, @http_timeout_ms + 5_000)
  end

  @doc "Clear all cached entries"
  @spec clear() :: :ok
  def clear do
    GenServer.call(__MODULE__, :clear)
  end

  @doc "Get cache statistics"
  @spec stats() :: map()
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # GenServer callbacks

  @impl true
  def init(_opts) do
    # Create ETS with :protected access - only this GenServer can write
    :ets.new(@cache_table, [
      :named_table,
      :set,
      :protected,
      {:read_concurrency, true}
    ])

    state = %{
      hits: 0,
      misses: 0,
      fetch_errors: 0
    }

    Logger.info("JWKSCache started with #{@default_ttl_ms}ms TTL")
    {:ok, state}
  end

  @impl true
  def handle_call({:get_keys, jwks_url}, _from, state) do
    now_ms = System.system_time(:millisecond)
    ttl_ms = cache_ttl_ms()

    case :ets.lookup(@cache_table, {:jwks, jwks_url}) do
      [{_, keys, fetched_at}] when now_ms - fetched_at < ttl_ms ->
        {:reply, {:ok, keys}, %{state | hits: state.hits + 1}}

      _ ->
        # Cache miss - fetch JWKS
        case fetch_jwks(jwks_url) do
          {:ok, keys} ->
            :ets.insert(@cache_table, {{:jwks, jwks_url}, keys, now_ms})
            {:reply, {:ok, keys}, %{state | misses: state.misses + 1}}

          {:error, reason} = error ->
            Logger.warning("JWKS fetch failed for #{jwks_url}: #{inspect(reason)}")
            {:reply, error, %{state | fetch_errors: state.fetch_errors + 1}}
        end
    end
  end

  @impl true
  def handle_call({:discover_jwks_url, issuer}, _from, state) do
    now_ms = System.system_time(:millisecond)
    ttl_ms = cache_ttl_ms()

    case :ets.lookup(@cache_table, {:discovery, issuer}) do
      [{_, jwks_url, fetched_at}] when now_ms - fetched_at < ttl_ms ->
        {:reply, {:ok, jwks_url}, %{state | hits: state.hits + 1}}

      _ ->
        # Cache miss - discover JWKS URL
        case discover_from_issuer(issuer) do
          {:ok, jwks_url} ->
            :ets.insert(@cache_table, {{:discovery, issuer}, jwks_url, now_ms})
            {:reply, {:ok, jwks_url}, %{state | misses: state.misses + 1}}

          {:error, reason} = error ->
            Logger.warning("OIDC discovery failed for #{issuer}: #{inspect(reason)}")
            {:reply, error, %{state | fetch_errors: state.fetch_errors + 1}}
        end
    end
  end

  @impl true
  def handle_call(:clear, _from, state) do
    :ets.delete_all_objects(@cache_table)
    {:reply, :ok, state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    cache_size = :ets.info(@cache_table, :size)
    {:reply, Map.put(state, :cache_size, cache_size), state}
  end

  # Private helpers

  defp fetch_jwks(url) do
    with {:ok, %{status: 200, body: body}} <- safe_get(url),
         {:ok, json} <- decode_json(body),
         %{"keys" => keys} when is_list(keys) <- json do
      {:ok, build_keys_map(keys)}
    else
      %{} = json when not is_map_key(json, "keys") ->
        {:error, {:invalid_jwks, :missing_keys}}

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, truncate_body(body)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp discover_from_issuer(issuer) do
    discovery_url = String.trim_trailing(issuer, "/") <> "/.well-known/openid-configuration"

    with {:ok, %{status: 200, body: body}} <- safe_get(discovery_url),
         {:ok, json} <- decode_json(body),
         jwks_url when is_binary(jwks_url) and jwks_url != "" <- json["jwks_uri"] do
      {:ok, jwks_url}
    else
      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, truncate_body(body)}}

      nil ->
        {:error, :missing_jwks_uri}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp safe_get(url) do
    env = Application.get_env(:cybernetic, :environment, :prod)

    with {:ok, %{connect_hostname: hostname, pinned_uris: pinned_uris}} <-
           SSRF.prepare_request(url,
             env: env,
             require_https_in_prod: true,
             # In dev/test allow local JWKS servers; in prod block internal/private hosts.
             block_internal_hosts: env == :prod,
             block_private_ips: env == :prod,
             block_unresolvable_hosts: env == :prod
           ) do
      pinned_get(pinned_uris, hostname)
    end
  rescue
    e -> {:error, {:request_error, Exception.message(e)}}
  end

  defp pinned_get([], _hostname), do: {:error, :dns_resolution_failed}

  # DNS rebinding protection: connect to a resolved IP, keep the original hostname
  # for Host header and TLS SNI/verification (`Mint.HTTP.connect/4` `:hostname`).
  defp pinned_get([%URI{} = pinned_uri | rest], hostname) when is_binary(hostname) do
    case Req.get(URI.to_string(pinned_uri),
           receive_timeout: @http_timeout_ms,
           connect_options: [timeout: @http_connect_timeout_ms, hostname: hostname],
           max_redirects: @max_redirects,
           retry: false
         ) do
      {:ok, _} = ok ->
        ok

      {:error, _reason} = error ->
        if rest == [] do
          error
        else
          pinned_get(rest, hostname)
        end
    end
  end

  defp decode_json(body) when is_binary(body) do
    Jason.decode(body)
  end

  defp decode_json(body) when is_map(body), do: {:ok, body}

  defp build_keys_map(keys) do
    Enum.reduce(keys, %{}, fn key, acc ->
      case key do
        %{"kid" => kid} when is_binary(kid) ->
          Map.put(acc, kid, JOSE.JWK.from_map(key))

        _ ->
          acc
      end
    end)
  end

  defp truncate_body(body) when is_binary(body) and byte_size(body) > 500 do
    String.slice(body, 0, 500) <> "..."
  end

  defp truncate_body(body), do: body

  defp cache_ttl_ms do
    Application.get_env(:cybernetic, :oidc, [])
    |> Keyword.get(:jwk_cache_ttl_ms, @default_ttl_ms)
  end
end
