defmodule Cybernetic.StorageTest do
  use ExUnit.Case

  alias Cybernetic.Storage
  alias Cybernetic.Storage.Adapters.Memory

  @test_tenant "test-tenant"
  @test_content "test content for storage"

  setup do
    # Start Memory adapter for testing
    {:ok, _pid} = start_supervised(Memory)

    # Configure to use Memory adapter
    Application.put_env(:cybernetic, :storage, adapter: Memory)

    # Clear any existing data
    Memory.clear()

    on_exit(fn ->
      Application.delete_env(:cybernetic, :storage)
    end)

    :ok
  end

  describe "put/4" do
    test "stores content via configured adapter" do
      assert {:ok, artifact} = Storage.put(@test_tenant, "file.txt", @test_content)
      assert artifact.path == "file.txt"
      assert artifact.size == byte_size(@test_content)
    end

    test "accepts content type option" do
      assert {:ok, artifact} =
               Storage.put(@test_tenant, "data", @test_content, content_type: "application/json")

      assert artifact.content_type == "application/json"
    end

    test "accepts metadata option" do
      metadata = %{"author" => "test", "version" => "1.0"}

      assert {:ok, artifact} =
               Storage.put(@test_tenant, "file.txt", @test_content, metadata: metadata)

      assert artifact.metadata == metadata
    end
  end

  describe "get/2" do
    test "retrieves stored content" do
      {:ok, _} = Storage.put(@test_tenant, "file.txt", @test_content)
      assert {:ok, @test_content} = Storage.get(@test_tenant, "file.txt")
    end

    test "returns error for missing content" do
      assert {:error, _} = Storage.get(@test_tenant, "nonexistent.txt")
    end
  end

  describe "delete/2" do
    test "removes stored content" do
      {:ok, _} = Storage.put(@test_tenant, "file.txt", @test_content)
      assert :ok = Storage.delete(@test_tenant, "file.txt")
      assert {:ok, false} = Storage.exists?(@test_tenant, "file.txt")
    end

    test "succeeds for nonexistent content (idempotent)" do
      assert :ok = Storage.delete(@test_tenant, "nonexistent.txt")
    end
  end

  describe "exists?/2" do
    test "returns true for existing content" do
      {:ok, _} = Storage.put(@test_tenant, "file.txt", @test_content)
      assert {:ok, true} = Storage.exists?(@test_tenant, "file.txt")
    end

    test "returns false for missing content" do
      assert {:ok, false} = Storage.exists?(@test_tenant, "missing.txt")
    end
  end

  describe "list/3" do
    test "lists files in directory" do
      {:ok, _} = Storage.put(@test_tenant, "dir/file1.txt", "content1")
      {:ok, _} = Storage.put(@test_tenant, "dir/file2.txt", "content2")

      {:ok, files} = Storage.list(@test_tenant, "dir/")
      paths = Enum.map(files, & &1.path)

      assert "dir/file1.txt" in paths
      assert "dir/file2.txt" in paths
    end

    test "respects limit option" do
      for i <- 1..5, do: Storage.put(@test_tenant, "limited/file#{i}.txt", "content")

      {:ok, files} = Storage.list(@test_tenant, "limited/", limit: 2)
      assert length(files) == 2
    end
  end

  describe "stat/2" do
    test "returns file metadata" do
      {:ok, _} = Storage.put(@test_tenant, "file.txt", @test_content)
      {:ok, stat} = Storage.stat(@test_tenant, "file.txt")

      assert stat.path == "file.txt"
      assert stat.size == byte_size(@test_content)
      assert %DateTime{} = stat.last_modified
    end

    test "returns error for missing file" do
      assert {:error, _} = Storage.stat(@test_tenant, "missing.txt")
    end
  end

  describe "stream/3" do
    test "returns stream for file content" do
      large_content = String.duplicate("x", 10_000)
      {:ok, _} = Storage.put(@test_tenant, "large.txt", large_content)

      {:ok, stream} = Storage.stream(@test_tenant, "large.txt")
      content = stream |> Enum.to_list() |> IO.iodata_to_binary()

      assert content == large_content
    end

    test "returns error for missing file" do
      assert {:error, _} = Storage.stream(@test_tenant, "missing.txt")
    end
  end

  describe "copy/3" do
    test "copies file to new location" do
      {:ok, _} = Storage.put(@test_tenant, "source.txt", @test_content)
      assert {:ok, _} = Storage.copy(@test_tenant, "source.txt", "dest.txt")

      assert {:ok, @test_content} = Storage.get(@test_tenant, "dest.txt")
      assert {:ok, @test_content} = Storage.get(@test_tenant, "source.txt")
    end
  end

  describe "move/3" do
    test "moves file to new location" do
      {:ok, _} = Storage.put(@test_tenant, "source.txt", @test_content)
      assert {:ok, _} = Storage.move(@test_tenant, "source.txt", "dest.txt")

      assert {:ok, @test_content} = Storage.get(@test_tenant, "dest.txt")
      assert {:ok, false} = Storage.exists?(@test_tenant, "source.txt")
    end
  end

  describe "put_stream/4" do
    test "stores content from stream" do
      stream = Stream.repeatedly(fn -> "chunk" end) |> Stream.take(10)

      assert {:ok, artifact} = Storage.put_stream(@test_tenant, "streamed.txt", stream)
      assert artifact.size == 50

      {:ok, content} = Storage.get(@test_tenant, "streamed.txt")
      assert content == String.duplicate("chunk", 10)
    end
  end
end
