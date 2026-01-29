defmodule Cybernetic.Security.SSRF do
  @moduledoc """
  Shared SSRF protections for outbound HTTP fetches.

  This module is intentionally pure and focused on:
  - Validating http/https URLs
  - Blocking internal/private destinations in production
  - Resolving and returning pinned IP targets to prevent DNS rebinding (TOCTOU)

  Callers (e.g. JWKS fetch, content ingest) can choose how strict to be via options.
  """

  import Bitwise

  @type ip_address :: :inet.ip_address() | :inet.ip6_address()

  @type prepare_error ::
          :invalid_scheme
          | :https_required_in_prod
          | :missing_host
          | :internal_host_blocked
          | :dns_resolution_failed

  @type prepared_request :: %{
          connect_hostname: String.t(),
          pinned_uris: [URI.t()]
        }

  @default_blocked_hosts [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    # Cloud metadata (also covered by 169.254.0.0/16, but keep as fast-path).
    "169.254.169.254"
  ]

  @default_blocked_suffixes [".local", ".internal", ".localhost"]

  # Private/reserved IPv4 ranges (RFC 1918, loopback, link-local, etc.)
  @private_ipv4_ranges [
    # 10.0.0.0/8 (RFC 1918)
    {{10, 0, 0, 0}, {10, 255, 255, 255}},
    # 172.16.0.0/12 (RFC 1918)
    {{172, 16, 0, 0}, {172, 31, 255, 255}},
    # 192.168.0.0/16 (RFC 1918)
    {{192, 168, 0, 0}, {192, 168, 255, 255}},
    # 127.0.0.0/8 (loopback)
    {{127, 0, 0, 0}, {127, 255, 255, 255}},
    # 169.254.0.0/16 (link-local, includes metadata 169.254.169.254)
    {{169, 254, 0, 0}, {169, 254, 255, 255}},
    # 0.0.0.0/8 (current network)
    {{0, 0, 0, 0}, {0, 255, 255, 255}},
    # 100.64.0.0/10 (carrier-grade NAT, RFC 6598)
    {{100, 64, 0, 0}, {100, 127, 255, 255}},
    # 198.18.0.0/15 (benchmarking, RFC 2544)
    {{198, 18, 0, 0}, {198, 19, 255, 255}},
    # 224.0.0.0/4 (multicast)
    {{224, 0, 0, 0}, {239, 255, 255, 255}},
    # 240.0.0.0/4 (reserved/experimental)
    {{240, 0, 0, 0}, {255, 255, 255, 255}}
  ]

  @doc """
  Prepare a URL for safe fetching.

  Returns pinned URI targets (host replaced with resolved IPs) and the original
  hostname to use as Mint `:hostname` (Host header + TLS SNI/verification).

  ## Options

  - `:env` - runtime environment atom (defaults to `Application.get_env(:cybernetic, :environment, :prod)`)
  - `:require_https_in_prod` - when true, blocks non-https URLs in `:prod`
  - `:block_internal_hosts` - when true, blocks localhost + `*.local` etc (fast path)
  - `:block_private_ips` - when true, resolves DNS and blocks private/reserved IPs
  - `:block_unresolvable_hosts` - when true, blocks hosts that don't resolve (fail-closed)
  - `:blocked_hosts` / `:blocked_suffixes` - override defaults
  """
  @spec prepare_request(String.t(), keyword()) ::
          {:ok, prepared_request()} | {:error, prepare_error()}
  def prepare_request(url, opts \\ [])

  def prepare_request(url, opts) when is_binary(url) do
    uri = URI.parse(url)

    env = Keyword.get(opts, :env, Application.get_env(:cybernetic, :environment, :prod))

    require_https_in_prod? = Keyword.get(opts, :require_https_in_prod, false)
    block_internal_hosts? = Keyword.get(opts, :block_internal_hosts, true)
    block_private_ips? = Keyword.get(opts, :block_private_ips, env == :prod)
    block_unresolvable_hosts? = Keyword.get(opts, :block_unresolvable_hosts, env == :prod)

    blocked_hosts = Keyword.get(opts, :blocked_hosts, @default_blocked_hosts)
    blocked_suffixes = Keyword.get(opts, :blocked_suffixes, @default_blocked_suffixes)

    cond do
      uri.scheme not in ["http", "https"] ->
        {:error, :invalid_scheme}

      require_https_in_prod? and env == :prod and uri.scheme != "https" ->
        {:error, :https_required_in_prod}

      uri.host in [nil, ""] ->
        {:error, :missing_host}

      block_internal_hosts? and blocked_host?(uri.host, blocked_hosts, blocked_suffixes) ->
        {:error, :internal_host_blocked}

      true ->
        ips = resolve_all_ips(uri.host)

        cond do
          ips == [] and block_unresolvable_hosts? ->
            {:error, :dns_resolution_failed}

          ips == [] ->
            {:ok, %{connect_hostname: uri.host, pinned_uris: [uri]}}

          block_private_ips? and Enum.any?(ips, &private_ip?/1) ->
            {:error, :internal_host_blocked}

          true ->
            pinned_uris =
              ips
              |> Enum.uniq()
              |> Enum.map(fn ip ->
                %URI{uri | host: ip_to_string(ip)}
              end)

            {:ok, %{connect_hostname: uri.host, pinned_uris: pinned_uris}}
        end
    end
  end

  def prepare_request(_url, _opts), do: {:error, :invalid_scheme}

  defp blocked_host?(host, blocked_hosts, blocked_suffixes) when is_binary(host) do
    normalized = String.downcase(host)

    normalized in blocked_hosts or
      Enum.any?(blocked_suffixes, &String.ends_with?(normalized, &1))
  end

  defp blocked_host?(_host, _blocked_hosts, _blocked_suffixes), do: true

  @spec resolve_all_ips(String.t()) :: [ip_address()]
  defp resolve_all_ips(host) when is_binary(host) do
    host_charlist = String.to_charlist(host)

    case :inet.parse_address(host_charlist) do
      {:ok, ip} ->
        [ip]

      {:error, _} ->
        ipv4_addrs =
          case :inet.getaddrs(host_charlist, :inet) do
            {:ok, addrs} when is_list(addrs) -> addrs
            _ -> []
          end

        ipv6_addrs =
          case :inet.getaddrs(host_charlist, :inet6) do
            {:ok, addrs} when is_list(addrs) -> addrs
            _ -> []
          end

        ipv4_addrs ++ ipv6_addrs
    end
  end

  defp resolve_all_ips(_), do: []

  defp ip_to_string(ip) do
    ip |> :inet.ntoa() |> to_string()
  end

  defp private_ip?({a, b, c, d} = ip) when is_tuple(ip) do
    Enum.any?(@private_ipv4_ranges, fn {{start_a, start_b, start_c, start_d},
                                        {end_a, end_b, end_c, end_d}} ->
      a >= start_a and a <= end_a and
        b >= start_b and b <= end_b and
        c >= start_c and c <= end_c and
        d >= start_d and d <= end_d
    end)
  end

  # ::1 (loopback)
  defp private_ip?({0, 0, 0, 0, 0, 0, 0, 1}), do: true

  # IPv4-mapped IPv6 (::ffff:x.x.x.x)
  defp private_ip?({0, 0, 0, 0, 0, 0xFFFF, hi, lo}) do
    private_ip?({hi >>> 8, hi &&& 0xFF, lo >>> 8, lo &&& 0xFF})
  end

  # fe80::/10 (link-local) = fe80..febf
  defp private_ip?({a, _, _, _, _, _, _, _}) when a >= 0xFE80 and a <= 0xFEBF, do: true
  # fc00::/7 (unique local) = fc00..fdff
  defp private_ip?({a, _, _, _, _, _, _, _}) when a >= 0xFC00 and a <= 0xFDFF, do: true
  defp private_ip?(_), do: false
end
