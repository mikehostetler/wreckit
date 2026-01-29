defmodule Cybernetic.Security.JWKSCacheTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Security.JWKSCache

  setup_all do
    case Process.whereis(JWKSCache) do
      nil -> {:ok, _pid} = start_supervised(JWKSCache)
      _ -> :ok
    end

    :ok
  end

  setup do
    original_env = Application.get_env(:cybernetic, :environment)
    Application.put_env(:cybernetic, :environment, :prod)

    on_exit(fn ->
      if is_nil(original_env) do
        Application.delete_env(:cybernetic, :environment)
      else
        Application.put_env(:cybernetic, :environment, original_env)
      end
    end)

    :ok
  end

  test "blocks link-local IPv6 in production (fe80::/10)" do
    assert {:error, :internal_host_blocked} = JWKSCache.get_keys("https://[fe81::1]/jwks")
  end

  test "blocks unique-local IPv6 in production (fc00::/7)" do
    assert {:error, :internal_host_blocked} = JWKSCache.get_keys("https://[fd12::1]/jwks")
  end

  test "blocks IPv4-mapped IPv6 loopback in production (::ffff:127.0.0.1)" do
    assert {:error, :internal_host_blocked} =
             JWKSCache.get_keys("https://[::ffff:127.0.0.1]/jwks")
  end
end
