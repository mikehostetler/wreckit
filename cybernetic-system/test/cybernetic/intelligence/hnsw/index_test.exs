defmodule Cybernetic.Intelligence.HNSW.IndexTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Intelligence.HNSW.Index

  setup do
    {:ok, pid} = start_supervised({Index, [name: :test_hnsw, dimensions: 4, m: 4]})
    %{pid: pid}
  end

  describe "insert/3" do
    test "inserts vector" do
      assert :ok = Index.insert("doc1", [0.1, 0.2, 0.3, 0.4], server: :test_hnsw)
    end

    test "validates vector dimensions" do
      assert {:error, :invalid_dimensions} = Index.insert("doc", [0.1, 0.2], server: :test_hnsw)
    end

    test "validates vector values are numbers" do
      assert {:error, :invalid_vector_values} =
               Index.insert("doc", ["a", "b", "c", "d"], server: :test_hnsw)
    end

    test "validates vector is a list" do
      assert {:error, :invalid_vector_type} =
               Index.insert("doc", "not_a_list", server: :test_hnsw)
    end
  end

  describe "insert_batch/2" do
    test "inserts multiple vectors" do
      items = [
        {"doc1", [0.1, 0.2, 0.3, 0.4]},
        {"doc2", [0.5, 0.6, 0.7, 0.8]},
        {"doc3", [0.9, 1.0, 1.1, 1.2]}
      ]

      assert :ok = Index.insert_batch(items, server: :test_hnsw)

      assert Index.exists?("doc1", server: :test_hnsw)
      assert Index.exists?("doc2", server: :test_hnsw)
      assert Index.exists?("doc3", server: :test_hnsw)
    end

    test "filters invalid vectors" do
      items = [
        {"valid", [0.1, 0.2, 0.3, 0.4]},
        # Wrong dimensions
        {"invalid", [0.1, 0.2]}
      ]

      assert :ok = Index.insert_batch(items, server: :test_hnsw)

      assert Index.exists?("valid", server: :test_hnsw)
      assert Index.exists?("invalid", server: :test_hnsw) == false
    end
  end

  describe "search/2" do
    test "returns empty for empty index" do
      {:ok, results} = Index.search([0.1, 0.2, 0.3, 0.4], server: :test_hnsw)
      assert results == []
    end

    test "finds nearest neighbors" do
      # Insert test vectors
      :ok = Index.insert("a", [0.0, 0.0, 0.0, 0.0], server: :test_hnsw)
      :ok = Index.insert("b", [1.0, 1.0, 1.0, 1.0], server: :test_hnsw)
      :ok = Index.insert("c", [0.1, 0.1, 0.1, 0.1], server: :test_hnsw)

      # Search near origin
      {:ok, results} = Index.search([0.0, 0.0, 0.0, 0.0], k: 2, server: :test_hnsw)

      assert length(results) == 2
      # Exact match
      assert hd(results).id == "a"
      assert hd(results).distance == 0.0
    end

    test "respects k parameter" do
      for i <- 1..5 do
        :ok = Index.insert("doc#{i}", [i * 0.1, i * 0.2, i * 0.3, i * 0.4], server: :test_hnsw)
      end

      {:ok, results} = Index.search([0.1, 0.2, 0.3, 0.4], k: 3, server: :test_hnsw)
      assert length(results) == 3
    end

    test "validates query vector dimensions" do
      :ok = Index.insert("doc", [0.1, 0.2, 0.3, 0.4], server: :test_hnsw)
      assert {:error, :invalid_dimensions} = Index.search([0.1, 0.2], server: :test_hnsw)
    end
  end

  describe "get/2" do
    test "retrieves inserted vector" do
      vector = [0.1, 0.2, 0.3, 0.4]
      :ok = Index.insert("myid", vector, server: :test_hnsw)

      {:ok, retrieved} = Index.get("myid", server: :test_hnsw)
      assert retrieved == vector
    end

    test "returns error for non-existent id" do
      assert {:error, :not_found} = Index.get("missing", server: :test_hnsw)
    end
  end

  describe "exists?/2" do
    test "returns true for existing id" do
      :ok = Index.insert("exists", [0.1, 0.2, 0.3, 0.4], server: :test_hnsw)
      assert Index.exists?("exists", server: :test_hnsw) == true
    end

    test "returns false for non-existing id" do
      assert Index.exists?("nope", server: :test_hnsw) == false
    end
  end

  describe "delete/2" do
    test "removes vector" do
      :ok = Index.insert("to_delete", [0.1, 0.2, 0.3, 0.4], server: :test_hnsw)
      assert :ok = Index.delete("to_delete", server: :test_hnsw)
      assert Index.exists?("to_delete", server: :test_hnsw) == false
    end

    test "returns error for non-existent id" do
      assert {:error, :not_found} = Index.delete("missing", server: :test_hnsw)
    end

    test "deleted vectors not in search results" do
      :ok = Index.insert("keep", [0.0, 0.0, 0.0, 0.0], server: :test_hnsw)
      :ok = Index.insert("delete", [0.1, 0.1, 0.1, 0.1], server: :test_hnsw)
      :ok = Index.delete("delete", server: :test_hnsw)

      {:ok, results} = Index.search([0.0, 0.0, 0.0, 0.0], k: 10, server: :test_hnsw)

      ids = Enum.map(results, & &1.id)
      assert "keep" in ids
      refute "delete" in ids
    end
  end

  describe "clear/1" do
    test "removes all vectors" do
      :ok = Index.insert("a", [0.1, 0.2, 0.3, 0.4], server: :test_hnsw)
      :ok = Index.insert("b", [0.5, 0.6, 0.7, 0.8], server: :test_hnsw)

      :ok = Index.clear(server: :test_hnsw)

      assert Index.exists?("a", server: :test_hnsw) == false
      assert Index.exists?("b", server: :test_hnsw) == false

      stats = Index.stats(server: :test_hnsw)
      assert stats.node_count == 0
    end
  end

  describe "stats/1" do
    test "returns statistics" do
      :ok = Index.insert("s1", [0.1, 0.2, 0.3, 0.4], server: :test_hnsw)
      :ok = Index.insert("s2", [0.5, 0.6, 0.7, 0.8], server: :test_hnsw)
      Index.search([0.1, 0.2, 0.3, 0.4], server: :test_hnsw)

      stats = Index.stats(server: :test_hnsw)

      assert stats.node_count == 2
      assert stats.dimensions == 4
      assert stats.m == 4
      assert stats.inserts == 2
      assert stats.searches == 1
    end
  end

  describe "persistence" do
    @tag :tmp_dir
    test "saves and loads index", %{tmp_dir: tmp_dir} do
      path = Path.join(tmp_dir, "index.bin")

      :ok = Index.insert("p1", [0.1, 0.2, 0.3, 0.4], server: :test_hnsw)
      :ok = Index.insert("p2", [0.5, 0.6, 0.7, 0.8], server: :test_hnsw)

      # Save
      assert :ok = Index.save(path, server: :test_hnsw)
      assert File.exists?(path)

      # Clear and reload
      :ok = Index.clear(server: :test_hnsw)
      assert Index.exists?("p1", server: :test_hnsw) == false

      # Load
      assert :ok = Index.load(path, server: :test_hnsw)
      assert Index.exists?("p1", server: :test_hnsw)
      assert Index.exists?("p2", server: :test_hnsw)
    end

    @tag :tmp_dir
    test "load fails for non-existent file", %{tmp_dir: tmp_dir} do
      path = Path.join(tmp_dir, "missing.bin")
      assert {:error, _} = Index.load(path, server: :test_hnsw)
    end

    @tag :tmp_dir
    test "load fails for dimension mismatch", %{tmp_dir: tmp_dir} do
      path = Path.join(tmp_dir, "wrong_dims.bin")

      # Create index with different dimensions
      {:ok, _pid} =
        start_supervised(
          {Index, [name: :other_hnsw, dimensions: 8]},
          id: :other_hnsw
        )

      :ok = Index.insert("o1", [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], server: :other_hnsw)
      :ok = Index.save(path, server: :other_hnsw)

      # Try to load into index with 4 dimensions
      assert {:error, :dimension_mismatch} = Index.load(path, server: :test_hnsw)
    end
  end
end
