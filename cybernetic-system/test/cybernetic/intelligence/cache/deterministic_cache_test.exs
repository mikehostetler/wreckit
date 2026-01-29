defmodule Cybernetic.Intelligence.Cache.DeterministicCacheTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Intelligence.Cache.DeterministicCache

  setup do
    {:ok, pid} =
      start_supervised(
        {DeterministicCache, [name: :test_cache, max_size: 100, max_memory: 10_000]}
      )

    # start_supervised handles cleanup automatically
    %{pid: pid}
  end

  describe "put/2" do
    test "stores content and returns SHA256 key" do
      {:ok, key} = DeterministicCache.put("hello world", server: :test_cache)
      assert is_binary(key)
      # SHA256 hex = 64 chars
      assert String.length(key) == 64
    end

    test "returns same key for identical content" do
      {:ok, key1} = DeterministicCache.put("identical", server: :test_cache)
      {:ok, key2} = DeterministicCache.put("identical", server: :test_cache)
      assert key1 == key2
    end

    test "returns different keys for different content" do
      {:ok, key1} = DeterministicCache.put("content1", server: :test_cache)
      {:ok, key2} = DeterministicCache.put("content2", server: :test_cache)
      assert key1 != key2
    end

    test "rejects content exceeding max size" do
      {:ok, _pid} =
        start_supervised(
          {DeterministicCache, [name: :small_cache, max_content_size: 10]},
          id: :small_cache
        )

      assert {:error, :content_too_large} =
               DeterministicCache.put("this content is too large", server: :small_cache)
    end

    test "accepts content_type option" do
      {:ok, key} = DeterministicCache.put("data", server: :test_cache, content_type: "text/plain")
      {:ok, entry} = DeterministicCache.get_entry(key, server: :test_cache)
      assert entry.content_type == "text/plain"
    end
  end

  describe "get/2" do
    test "retrieves stored content" do
      content = "test content"
      {:ok, key} = DeterministicCache.put(content, server: :test_cache)
      {:ok, retrieved} = DeterministicCache.get(key, server: :test_cache)
      assert retrieved == content
    end

    test "returns error for non-existent key" do
      assert {:error, :not_found} = DeterministicCache.get("nonexistent", server: :test_cache)
    end

    test "updates access time on get (LRU)" do
      {:ok, key1} = DeterministicCache.put("first", server: :test_cache)
      {:ok, key2} = DeterministicCache.put("second", server: :test_cache)

      # Access first key to make it most recently used
      {:ok, _} = DeterministicCache.get(key1, server: :test_cache)

      {:ok, entry1} = DeterministicCache.get_entry(key1, server: :test_cache)
      {:ok, entry2} = DeterministicCache.get_entry(key2, server: :test_cache)

      # entry1 should have higher access_counter (more recent)
      assert entry1.access_counter > entry2.access_counter
    end
  end

  describe "get_entry/2" do
    test "returns full entry with metadata" do
      {:ok, key} = DeterministicCache.put("metadata test", server: :test_cache)
      {:ok, entry} = DeterministicCache.get_entry(key, server: :test_cache)

      assert entry.key == key
      assert entry.content == "metadata test"
      assert entry.size == byte_size("metadata test")
      assert %DateTime{} = entry.created_at
      assert %DateTime{} = entry.accessed_at
      assert entry.hits >= 0
    end
  end

  describe "exists?/2" do
    test "returns true for existing key" do
      {:ok, key} = DeterministicCache.put("exists", server: :test_cache)
      assert DeterministicCache.exists?(key, server: :test_cache) == true
    end

    test "returns false for non-existent key" do
      assert DeterministicCache.exists?("not_there", server: :test_cache) == false
    end
  end

  describe "probably_exists?/2 (Bloom filter)" do
    test "returns true for definitely stored keys" do
      {:ok, key} = DeterministicCache.put("bloom test", server: :test_cache)
      assert DeterministicCache.probably_exists?(key, server: :test_cache) == true
    end

    test "may return true for non-existent keys (false positive)" do
      # This test just verifies the function works, not the FP rate
      result =
        DeterministicCache.probably_exists?("random_key_#{:rand.uniform(1_000_000)}",
          server: :test_cache
        )

      assert is_boolean(result)
    end
  end

  describe "delete/2" do
    test "removes entry" do
      {:ok, key} = DeterministicCache.put("to delete", server: :test_cache)
      assert :ok = DeterministicCache.delete(key, server: :test_cache)
      assert {:error, :not_found} = DeterministicCache.get(key, server: :test_cache)
    end

    test "succeeds for non-existent key" do
      assert :ok = DeterministicCache.delete("does_not_exist", server: :test_cache)
    end
  end

  describe "clear/1" do
    test "removes all entries" do
      {:ok, key1} = DeterministicCache.put("one", server: :test_cache)
      {:ok, key2} = DeterministicCache.put("two", server: :test_cache)

      :ok = DeterministicCache.clear(server: :test_cache)

      assert {:error, :not_found} = DeterministicCache.get(key1, server: :test_cache)
      assert {:error, :not_found} = DeterministicCache.get(key2, server: :test_cache)
    end

    test "increments bloom generation" do
      stats_before = DeterministicCache.stats(server: :test_cache)
      :ok = DeterministicCache.clear(server: :test_cache)
      stats_after = DeterministicCache.stats(server: :test_cache)

      assert stats_after.bloom_generation > stats_before.bloom_generation
    end

    test "bloom filter properly invalidated after clear" do
      {:ok, key} = DeterministicCache.put("bloom clear test", server: :test_cache)
      assert DeterministicCache.probably_exists?(key, server: :test_cache) == true

      :ok = DeterministicCache.clear(server: :test_cache)

      # After clear with new generation, old key should not be in bloom
      assert DeterministicCache.probably_exists?(key, server: :test_cache) == false
    end
  end

  describe "stats/1" do
    test "returns statistics" do
      {:ok, key} = DeterministicCache.put("stats test", server: :test_cache)
      {:ok, _} = DeterministicCache.get(key, server: :test_cache)
      DeterministicCache.get("miss", server: :test_cache)

      stats = DeterministicCache.stats(server: :test_cache)

      assert stats.entries == 1
      assert stats.hits >= 1
      assert stats.misses >= 1
      assert stats.puts >= 1
      assert is_number(stats.memory_bytes)
      assert is_number(stats.hit_rate)
    end
  end

  describe "LRU eviction" do
    test "evicts least recently used when max_size reached" do
      {:ok, pid} =
        start_supervised(
          {DeterministicCache, [name: :lru_cache, max_size: 3]},
          id: :lru_cache
        )

      {:ok, key1} = DeterministicCache.put("first", server: :lru_cache)
      {:ok, key2} = DeterministicCache.put("second", server: :lru_cache)
      {:ok, key3} = DeterministicCache.put("third", server: :lru_cache)

      # Access key1 to make it recently used
      {:ok, _} = DeterministicCache.get(key1, server: :lru_cache)

      # Add fourth item - should evict key2 (LRU)
      {:ok, _key4} = DeterministicCache.put("fourth", server: :lru_cache)

      # key1 and key3 should still exist, key2 should be evicted
      assert DeterministicCache.exists?(key1, server: :lru_cache)
      assert DeterministicCache.exists?(key3, server: :lru_cache)
      assert DeterministicCache.exists?(key2, server: :lru_cache) == false
    end

    test "evicts by memory limit" do
      {:ok, _pid} =
        start_supervised(
          {DeterministicCache, [name: :mem_cache, max_memory: 100]},
          id: :mem_cache
        )

      {:ok, key1} = DeterministicCache.put(String.duplicate("a", 30), server: :mem_cache)
      {:ok, key2} = DeterministicCache.put(String.duplicate("b", 30), server: :mem_cache)
      {:ok, _key3} = DeterministicCache.put(String.duplicate("c", 50), server: :mem_cache)

      # Should have evicted key1 to make room
      assert DeterministicCache.exists?(key1, server: :mem_cache) == false
      assert DeterministicCache.exists?(key2, server: :mem_cache)
    end
  end

  describe "TTL expiration" do
    test "expired entries return not_found" do
      {:ok, key} = DeterministicCache.put("expires", server: :test_cache, ttl: 1)

      # Wait for expiration
      Process.sleep(50)

      assert {:error, :not_found} = DeterministicCache.get(key, server: :test_cache)
    end
  end
end
