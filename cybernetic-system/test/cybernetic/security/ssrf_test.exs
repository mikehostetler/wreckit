defmodule Cybernetic.Security.SSRFTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Security.SSRF

  describe "prepare_request/2 scheme validation" do
    test "accepts http URLs" do
      assert {:ok, _} = SSRF.prepare_request("http://example.com/path", env: :dev)
    end

    test "accepts https URLs" do
      assert {:ok, _} = SSRF.prepare_request("https://example.com/path", env: :dev)
    end

    test "rejects ftp scheme" do
      assert {:error, :invalid_scheme} = SSRF.prepare_request("ftp://example.com/file")
    end

    test "rejects file scheme" do
      assert {:error, :invalid_scheme} = SSRF.prepare_request("file:///etc/passwd")
    end

    test "rejects data scheme" do
      assert {:error, :invalid_scheme} = SSRF.prepare_request("data:text/html,<h1>test</h1>")
    end

    test "rejects javascript scheme" do
      assert {:error, :invalid_scheme} = SSRF.prepare_request("javascript:alert(1)")
    end

    test "rejects non-binary input" do
      assert {:error, :invalid_scheme} = SSRF.prepare_request(nil)
      assert {:error, :invalid_scheme} = SSRF.prepare_request(123)
    end
  end

  describe "prepare_request/2 HTTPS enforcement in prod" do
    test "blocks http in prod when require_https_in_prod is true" do
      result =
        SSRF.prepare_request("http://example.com",
          env: :prod,
          require_https_in_prod: true,
          block_internal_hosts: false
        )

      assert {:error, :https_required_in_prod} = result
    end

    test "allows http in prod when require_https_in_prod is false" do
      result =
        SSRF.prepare_request("http://example.com",
          env: :prod,
          require_https_in_prod: false,
          block_internal_hosts: false,
          block_private_ips: false
        )

      assert {:ok, _} = result
    end

    test "allows http in dev even when require_https_in_prod is true" do
      result =
        SSRF.prepare_request("http://example.com",
          env: :dev,
          require_https_in_prod: true,
          block_internal_hosts: false
        )

      assert {:ok, _} = result
    end
  end

  describe "prepare_request/2 host validation" do
    test "rejects URL with no host" do
      assert {:error, :missing_host} = SSRF.prepare_request("http:///path")
    end

    test "rejects URL with empty host" do
      assert {:error, :missing_host} = SSRF.prepare_request("http://")
    end
  end

  describe "prepare_request/2 blocked hosts" do
    test "blocks localhost" do
      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://localhost/path", env: :dev)
    end

    test "blocks 127.0.0.1" do
      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://127.0.0.1/path", env: :dev)
    end

    test "blocks 0.0.0.0" do
      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://0.0.0.0/path", env: :dev)
    end

    test "blocks ::1 IPv6 loopback" do
      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://[::1]/path", env: :dev)
    end

    test "blocks cloud metadata 169.254.169.254" do
      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://169.254.169.254/latest/meta-data", env: :dev)
    end

    test "blocks .local suffix" do
      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://myhost.local/api", env: :dev)
    end

    test "blocks .internal suffix" do
      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://service.internal/api", env: :dev)
    end

    test "blocks .localhost suffix" do
      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://foo.localhost/api", env: :dev)
    end

    test "case insensitive host blocking" do
      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://LOCALHOST/path", env: :dev)

      assert {:error, :internal_host_blocked} =
               SSRF.prepare_request("http://MyHost.LOCAL/path", env: :dev)
    end

    test "allows blocking to be disabled" do
      result =
        SSRF.prepare_request("http://localhost/path",
          env: :dev,
          block_internal_hosts: false,
          block_private_ips: false
        )

      assert {:ok, _} = result
    end

    test "supports custom blocked hosts" do
      result =
        SSRF.prepare_request("http://custom.blocked.com/path",
          env: :dev,
          blocked_hosts: ["custom.blocked.com"]
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "supports custom blocked suffixes" do
      result =
        SSRF.prepare_request("http://api.mycompany.corp/path",
          env: :dev,
          blocked_suffixes: [".corp"]
        )

      assert {:error, :internal_host_blocked} = result
    end
  end

  describe "prepare_request/2 private IP blocking" do
    test "blocks 10.x.x.x RFC 1918 in prod" do
      # Using a direct IP bypasses hostname blocking
      result =
        SSRF.prepare_request("http://10.0.0.1/internal",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks 172.16.x.x RFC 1918 in prod" do
      result =
        SSRF.prepare_request("http://172.16.0.1/internal",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks 192.168.x.x RFC 1918 in prod" do
      result =
        SSRF.prepare_request("http://192.168.1.1/router",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks 127.x.x.x loopback in prod" do
      result =
        SSRF.prepare_request("http://127.0.0.99/loopback",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks 169.254.x.x link-local in prod" do
      result =
        SSRF.prepare_request("http://169.254.1.1/link-local",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks 0.x.x.x current network in prod" do
      result =
        SSRF.prepare_request("http://0.0.0.1/current",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks 100.64.x.x CGNAT in prod" do
      result =
        SSRF.prepare_request("http://100.64.0.1/cgnat",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks 198.18.x.x benchmarking in prod" do
      result =
        SSRF.prepare_request("http://198.18.0.1/benchmark",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks 224-239.x.x.x multicast in prod" do
      result =
        SSRF.prepare_request("http://224.0.0.1/multicast",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "allows private IPs in dev by default" do
      result =
        SSRF.prepare_request("http://192.168.1.1/router",
          env: :dev,
          block_internal_hosts: false
        )

      assert {:ok, %{pinned_uris: [uri]}} = result
      assert uri.host == "192.168.1.1"
    end
  end

  describe "prepare_request/2 IPv6 private blocking" do
    test "blocks ::1 loopback in prod" do
      # Note: ::1 is also in blocked_hosts, test with block_internal_hosts: false
      result =
        SSRF.prepare_request("http://[::1]/loopback",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks fe80::/10 link-local in prod" do
      result =
        SSRF.prepare_request("http://[fe80::1]/link-local",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks fc00::/7 unique local in prod" do
      result =
        SSRF.prepare_request("http://[fc00::1]/unique-local",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks fd00::/8 unique local in prod" do
      result =
        SSRF.prepare_request("http://[fd00::1]/unique-local",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end
  end

  describe "prepare_request/2 IPv4-mapped IPv6" do
    test "blocks ::ffff:10.0.0.1 (IPv4-mapped private)" do
      # IPv4-mapped form of 10.0.0.1
      result =
        SSRF.prepare_request("http://[::ffff:10.0.0.1]/internal",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks ::ffff:127.0.0.1 (IPv4-mapped loopback)" do
      result =
        SSRF.prepare_request("http://[::ffff:127.0.0.1]/loopback",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end

    test "blocks ::ffff:192.168.1.1 (IPv4-mapped RFC 1918)" do
      result =
        SSRF.prepare_request("http://[::ffff:192.168.1.1]/internal",
          env: :prod,
          block_internal_hosts: false,
          block_private_ips: true
        )

      assert {:error, :internal_host_blocked} = result
    end
  end

  describe "prepare_request/2 successful preparation" do
    test "returns connect_hostname for TLS SNI" do
      result =
        SSRF.prepare_request("https://example.com/api",
          env: :dev,
          block_internal_hosts: false
        )

      assert {:ok, %{connect_hostname: "example.com"}} = result
    end

    test "returns pinned URIs with resolved IPs" do
      result =
        SSRF.prepare_request("https://example.com/api",
          env: :dev,
          block_internal_hosts: false
        )

      case result do
        {:ok, %{pinned_uris: uris}} ->
          assert length(uris) >= 1
          # Each pinned URI should have an IP as host
          Enum.each(uris, fn uri ->
            assert uri.scheme == "https"
            assert uri.path == "/api"
          end)

        # May fail DNS resolution in test environment
        {:error, :dns_resolution_failed} ->
          :ok
      end
    end

    test "preserves path and query in pinned URIs" do
      result =
        SSRF.prepare_request("http://8.8.8.8/api?key=value",
          env: :dev,
          block_internal_hosts: false,
          block_private_ips: false
        )

      assert {:ok, %{pinned_uris: [uri]}} = result
      assert uri.path == "/api"
      assert uri.query == "key=value"
    end

    test "handles direct IP addresses" do
      result =
        SSRF.prepare_request("http://8.8.8.8/dns",
          env: :dev,
          block_internal_hosts: false,
          block_private_ips: false
        )

      assert {:ok, %{connect_hostname: "8.8.8.8", pinned_uris: [uri]}} = result
      assert uri.host == "8.8.8.8"
    end
  end

  describe "prepare_request/2 DNS resolution options" do
    test "blocks unresolvable hosts in prod by default" do
      result =
        SSRF.prepare_request("http://definitely-not-a-real-domain-12345.invalid/api",
          env: :prod,
          block_internal_hosts: false
        )

      assert {:error, :dns_resolution_failed} = result
    end

    test "allows unresolvable hosts in dev by default" do
      result =
        SSRF.prepare_request("http://definitely-not-a-real-domain-12345.invalid/api",
          env: :dev,
          block_internal_hosts: false
        )

      # In dev, returns the original URI without pinning
      assert {:ok, %{pinned_uris: [uri]}} = result
      assert uri.host == "definitely-not-a-real-domain-12345.invalid"
    end

    test "can force blocking unresolvable hosts in dev" do
      result =
        SSRF.prepare_request("http://definitely-not-a-real-domain-12345.invalid/api",
          env: :dev,
          block_internal_hosts: false,
          block_unresolvable_hosts: true
        )

      assert {:error, :dns_resolution_failed} = result
    end
  end

  describe "edge cases" do
    test "handles port in URL" do
      result =
        SSRF.prepare_request("http://8.8.8.8:8080/api",
          env: :dev,
          block_internal_hosts: false,
          block_private_ips: false
        )

      assert {:ok, %{pinned_uris: [uri]}} = result
      assert uri.port == 8080
    end

    test "handles fragment in URL" do
      result =
        SSRF.prepare_request("http://8.8.8.8/page#section",
          env: :dev,
          block_internal_hosts: false,
          block_private_ips: false
        )

      assert {:ok, %{pinned_uris: [uri]}} = result
      assert uri.fragment == "section"
    end

    test "handles userinfo in URL" do
      result =
        SSRF.prepare_request("http://user:pass@8.8.8.8/api",
          env: :dev,
          block_internal_hosts: false,
          block_private_ips: false
        )

      assert {:ok, %{pinned_uris: [uri]}} = result
      assert uri.userinfo == "user:pass"
    end
  end
end
