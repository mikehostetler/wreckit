defmodule Cybernetic.Storage.Adapters.MemoryTest do
  use ExUnit.Case

  alias Cybernetic.Storage.Adapters.Memory

  @test_tenant "test-tenant"
  @test_content "test content"

  setup do
    # Start the Memory adapter GenServer
    {:ok, pid} = start_supervised(Memory)

    # Clear any existing data
    Memory.clear()

    {:ok, pid: pid}
  end

  describe "put/4" do
    test "stores content in memory" do
      assert {:ok, artifact} = Memory.put(@test_tenant, "file.txt", @test_content)
      assert artifact.path == "file.txt"
      assert artifact.size == byte_size(@test_content)
      assert artifact.content_type == "text/plain"
    end

    test "stores with custom content type" do
      assert {:ok, artifact} =
               Memory.put(@test_tenant, "data", @test_content, content_type: "application/json")

      assert artifact.content_type == "application/json"
    end

    test "stores with metadata" do
      metadata = %{"key" => "value"}

      assert {:ok, artifact} =
               Memory.put(@test_tenant, "file.txt", @test_content, metadata: metadata)

      assert artifact.metadata == metadata
    end

    test "overwrites existing content" do
      {:ok, _} = Memory.put(@test_tenant, "file.txt", "original")
      {:ok, _} = Memory.put(@test_tenant, "file.txt", "updated")

      {:ok, content} = Memory.get(@test_tenant, "file.txt")
      assert content == "updated"
    end
  end

  describe "get/2" do
    test "retrieves stored content" do
      {:ok, _} = Memory.put(@test_tenant, "file.txt", @test_content)
      assert {:ok, @test_content} = Memory.get(@test_tenant, "file.txt")
    end

    test "returns not_found for missing content" do
      assert {:error, :not_found} = Memory.get(@test_tenant, "missing.txt")
    end
  end

  describe "delete/2" do
    test "removes stored content" do
      {:ok, _} = Memory.put(@test_tenant, "file.txt", @test_content)
      assert :ok = Memory.delete(@test_tenant, "file.txt")
      assert {:error, :not_found} = Memory.get(@test_tenant, "file.txt")
    end

    test "succeeds for nonexistent content" do
      assert :ok = Memory.delete(@test_tenant, "nonexistent.txt")
    end
  end

  describe "exists?/2" do
    test "returns true for existing content" do
      {:ok, _} = Memory.put(@test_tenant, "file.txt", @test_content)
      assert {:ok, true} = Memory.exists?(@test_tenant, "file.txt")
    end

    test "returns false for missing content" do
      assert {:ok, false} = Memory.exists?(@test_tenant, "missing.txt")
    end
  end

  describe "list/3" do
    test "lists files with prefix" do
      {:ok, _} = Memory.put(@test_tenant, "dir/file1.txt", "content1")
      {:ok, _} = Memory.put(@test_tenant, "dir/file2.txt", "content2")
      {:ok, _} = Memory.put(@test_tenant, "other/file3.txt", "content3")

      {:ok, files} = Memory.list(@test_tenant, "dir/")
      paths = Enum.map(files, & &1.path)

      assert length(files) == 2
      assert "dir/file1.txt" in paths
      assert "dir/file2.txt" in paths
    end

    test "returns empty list for no matches" do
      assert {:ok, []} = Memory.list(@test_tenant, "nonexistent/")
    end

    test "respects limit option" do
      for i <- 1..5 do
        Memory.put(@test_tenant, "limited/file#{i}.txt", "content")
      end

      {:ok, files} = Memory.list(@test_tenant, "limited/", limit: 2)
      assert length(files) == 2
    end
  end

  describe "stat/2" do
    test "returns file metadata" do
      {:ok, _} = Memory.put(@test_tenant, "file.txt", @test_content)
      {:ok, stat} = Memory.stat(@test_tenant, "file.txt")

      assert stat.path == "file.txt"
      assert stat.size == byte_size(@test_content)
      assert stat.content_type == "text/plain"
      assert %DateTime{} = stat.last_modified
    end

    test "returns not_found for missing file" do
      assert {:error, :not_found} = Memory.stat(@test_tenant, "missing.txt")
    end
  end

  describe "stream/3" do
    test "returns stream for content" do
      {:ok, _} = Memory.put(@test_tenant, "file.txt", @test_content)

      {:ok, stream} = Memory.stream(@test_tenant, "file.txt")
      content = stream |> Enum.to_list() |> IO.iodata_to_binary()

      assert content == @test_content
    end

    test "returns not_found for missing file" do
      assert {:error, :not_found} = Memory.stream(@test_tenant, "missing.txt")
    end
  end

  describe "clear/0" do
    test "removes all stored content" do
      {:ok, _} = Memory.put("tenant1", "file1.txt", "content1")
      {:ok, _} = Memory.put("tenant2", "file2.txt", "content2")

      assert :ok = Memory.clear()

      assert {:error, :not_found} = Memory.get("tenant1", "file1.txt")
      assert {:error, :not_found} = Memory.get("tenant2", "file2.txt")
    end
  end

  describe "tenant isolation" do
    test "tenants cannot access each other's content" do
      {:ok, _} = Memory.put("tenant-a", "shared.txt", "content-a")
      {:ok, _} = Memory.put("tenant-b", "shared.txt", "content-b")

      assert {:ok, "content-a"} = Memory.get("tenant-a", "shared.txt")
      assert {:ok, "content-b"} = Memory.get("tenant-b", "shared.txt")
    end
  end
end
