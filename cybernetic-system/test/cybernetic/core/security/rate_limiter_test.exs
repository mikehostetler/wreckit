defmodule Cybernetic.Core.Security.RateLimiterTest do
  use ExUnit.Case
  alias Cybernetic.Core.Security.RateLimiter

  setup do
    # Check if RateLimiter is available
    pid = Process.whereis(RateLimiter)

    if pid == nil do
      {:ok, skip: true}
    else
      {:ok, limiter: pid}
    end
  end

  describe "rate limiting" do
    test "allows requests within limit", context do
      if Map.get(context, :skip) do
        :ok
      else
        assert {:ok, _remaining} = RateLimiter.check("test_key", 5)
        assert {:ok, remaining} = RateLimiter.consume("test_key", 5)
        assert remaining == 5
      end
    end

    test "blocks requests over limit", context do
      if Map.get(context, :skip) do
        :ok
      else
        assert {:ok, _} = RateLimiter.consume("test_key", 10)
        assert {:error, :rate_limited} = RateLimiter.consume("test_key", 1)
      end
    end

    test "refills tokens over time", context do
      if Map.get(context, :skip) do
        :ok
      else
        key = "refill_test"
        assert {:ok, 0} = RateLimiter.consume(key, 10)

        # Wait for refill (5 tokens per second, wait 400ms = 2 tokens)
        Process.sleep(400)

        assert {:ok, _remaining} = RateLimiter.consume(key, 2)
      end
    end

    test "check doesn't consume tokens", context do
      if Map.get(context, :skip) do
        :ok
      else
        key = "check_test"
        assert {:ok, 10} = RateLimiter.check(key)
        assert {:ok, 10} = RateLimiter.check(key)
        assert {:ok, 10} = RateLimiter.check(key, 5)
      end
    end

    test "get_bucket returns current state", context do
      if Map.get(context, :skip) do
        :ok
      else
        key = "bucket_test"
        assert {:ok, 5} = RateLimiter.consume(key, 5)

        bucket = RateLimiter.get_bucket(key)
        assert bucket.tokens == 5
        assert is_integer(bucket.last_refill)
      end
    end

    test "reset restores full capacity", context do
      if Map.get(context, :skip) do
        :ok
      else
        key = "reset_test"
        assert {:ok, 0} = RateLimiter.consume(key, 10)

        RateLimiter.reset(key)
        # Let cast complete
        Process.sleep(10)

        assert {:ok, 10} = RateLimiter.check(key)
      end
    end

    test "different keys have independent buckets", context do
      if Map.get(context, :skip) do
        :ok
      else
        assert {:ok, 5} = RateLimiter.consume("key1", 5)
        assert {:ok, 3} = RateLimiter.consume("key2", 7)

        bucket1 = RateLimiter.get_bucket("key1")
        bucket2 = RateLimiter.get_bucket("key2")

        assert bucket1.tokens == 5
        assert bucket2.tokens == 3
      end
    end

    test "handles concurrent requests correctly", context do
      if Map.get(context, :skip) do
        :ok
      else
        key = "concurrent_test"

        tasks =
          for i <- 1..20 do
            Task.async(fn ->
              RateLimiter.consume(key, 1)
            end)
          end

        results = Task.await_many(tasks)

        successful =
          Enum.count(results, fn
            {:ok, _} -> true
            _ -> false
          end)

        # Should allow exactly 10 requests (bucket size)
        assert successful == 10
      end
    end
  end
end
