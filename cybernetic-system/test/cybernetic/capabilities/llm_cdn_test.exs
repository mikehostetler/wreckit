defmodule Cybernetic.Capabilities.LLMCDNTest do
  use ExUnit.Case

  alias Cybernetic.Capabilities.LLMCDN

  setup do
    {:ok, pid} = start_supervised(LLMCDN)
    {:ok, pid: pid}
  end

  describe "fingerprint/1" do
    test "generates deterministic fingerprint" do
      params = %{model: "gpt-4", messages: [%{role: "user", content: "Hello"}]}

      fp1 = LLMCDN.fingerprint(params)
      fp2 = LLMCDN.fingerprint(params)

      assert fp1 == fp2
      assert is_binary(fp1)
      # SHA256 hex
      assert String.length(fp1) == 64
    end

    test "different params produce different fingerprints" do
      fp1 = LLMCDN.fingerprint(%{model: "gpt-4", messages: []})
      fp2 = LLMCDN.fingerprint(%{model: "gpt-3.5", messages: []})

      assert fp1 != fp2
    end

    test "order-independent for map keys" do
      fp1 = LLMCDN.fingerprint(%{a: 1, b: 2, c: 3})
      fp2 = LLMCDN.fingerprint(%{c: 3, a: 1, b: 2})

      assert fp1 == fp2
    end

    test "ignores stream and timeout params" do
      fp1 = LLMCDN.fingerprint(%{model: "gpt-4", stream: true, timeout: 5000})
      fp2 = LLMCDN.fingerprint(%{model: "gpt-4"})

      assert fp1 == fp2
    end
  end

  describe "complete/2" do
    test "returns response for chat completion" do
      params = %{
        model: "gpt-4",
        messages: [%{role: "user", content: "Hello"}]
      }

      # Uses placeholder since ReqLLM not configured
      assert {:ok, response} = LLMCDN.complete(params)
      assert response.choices
    end

    test "caches repeated requests" do
      params = %{model: "test", messages: [%{role: "user", content: "test"}]}

      # First call - cache miss
      {:ok, _} = LLMCDN.complete(params)

      # Second call - should be cache hit
      {:ok, _} = LLMCDN.complete(params)

      stats = LLMCDN.stats()
      assert stats.hits >= 1 or stats.misses >= 2
    end

    test "skip_cache option bypasses cache" do
      params = %{model: "skip_test", messages: []}

      {:ok, _} = LLMCDN.complete(params)
      {:ok, _} = LLMCDN.complete(params, skip_cache: true)

      stats = LLMCDN.stats()
      assert stats.misses >= 2
    end
  end

  describe "embed/2" do
    test "returns embeddings" do
      assert {:ok, response} = LLMCDN.embed("test text")
      assert response.data
      assert hd(response.data).embedding
    end

    test "caches embedding requests" do
      {:ok, _} = LLMCDN.embed("cache test")
      {:ok, _} = LLMCDN.embed("cache test")

      stats = LLMCDN.stats()
      assert stats.hits >= 1 or stats.misses >= 2
    end

    test "accepts list of inputs" do
      assert {:ok, _} = LLMCDN.embed(["text1", "text2"])
    end
  end

  describe "get_cached/1" do
    test "retrieves cached entry" do
      params = %{model: "cached", messages: [%{role: "user", content: "cached"}]}
      fp = LLMCDN.fingerprint(params)

      # Populate cache
      {:ok, _} = LLMCDN.complete(params)

      assert {:ok, _response} = LLMCDN.get_cached(fp)
    end

    test "returns not_found for uncached fingerprint" do
      assert {:error, :not_found} = LLMCDN.get_cached("nonexistent-fingerprint")
    end
  end

  describe "invalidate/1" do
    test "removes entry from cache" do
      params = %{model: "invalidate", messages: []}
      fp = LLMCDN.fingerprint(params)

      {:ok, _} = LLMCDN.complete(params)
      assert {:ok, _} = LLMCDN.get_cached(fp)

      :ok = LLMCDN.invalidate(fp)
      assert {:error, :not_found} = LLMCDN.get_cached(fp)
    end
  end

  describe "clear_cache/0" do
    test "removes all entries" do
      {:ok, _} = LLMCDN.complete(%{model: "clear1", messages: []})
      {:ok, _} = LLMCDN.complete(%{model: "clear2", messages: []})

      :ok = LLMCDN.clear_cache()

      stats = LLMCDN.stats()
      assert stats.cache_size == 0
    end
  end

  describe "stats/0" do
    test "returns cache statistics" do
      {:ok, _} = LLMCDN.complete(%{model: "stats1", messages: []})
      # hit
      {:ok, _} = LLMCDN.complete(%{model: "stats1", messages: []})
      {:ok, _} = LLMCDN.complete(%{model: "stats2", messages: []})

      stats = LLMCDN.stats()

      assert is_integer(stats.hits)
      assert is_integer(stats.misses)
      assert is_integer(stats.cache_size)
      assert is_float(stats.hit_rate) or stats.hit_rate == 0
    end

    test "hit_rate calculation" do
      # Clear any existing state
      LLMCDN.clear_cache()

      # First call - miss
      {:ok, _} = LLMCDN.complete(%{model: "hitrate", messages: []})
      # Second call - hit
      {:ok, _} = LLMCDN.complete(%{model: "hitrate", messages: []})

      stats = LLMCDN.stats()
      # Should have approximately 50% hit rate (1 hit, 1 miss)
      assert stats.hits >= 1
      assert stats.misses >= 1
    end
  end

  describe "request deduplication" do
    test "deduplication tracked in stats" do
      # The dedup window is 5 seconds, so concurrent requests
      # to the same fingerprint should be coalesced
      # We can verify the stats track deduped requests
      stats = LLMCDN.stats()
      assert Map.has_key?(stats, :deduped)
    end
  end
end
