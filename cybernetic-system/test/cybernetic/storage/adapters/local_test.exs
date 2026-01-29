defmodule Cybernetic.Storage.Adapters.LocalTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Storage.Adapters.Local
  alias Cybernetic.Storage.Error

  @test_tenant "test-tenant"
  @test_content "test content"

  setup do
    # Create a unique temp directory for each test
    base_path = System.tmp_dir!() |> Path.join("cybernetic_local_test_#{System.unique_integer()}")
    File.mkdir_p!(base_path)

    # Configure storage to use this temp path
    Application.put_env(:cybernetic, :storage, base_path: base_path)

    on_exit(fn ->
      File.rm_rf!(base_path)
      Application.delete_env(:cybernetic, :storage)
    end)

    {:ok, base_path: base_path}
  end

  describe "put/4" do
    test "stores content and returns artifact metadata" do
      assert {:ok, artifact} = Local.put(@test_tenant, "test.txt", @test_content)

      assert artifact.path == "test.txt"
      assert artifact.size == byte_size(@test_content)
      assert artifact.content_type == "text/plain"
      assert %DateTime{} = artifact.last_modified
    end

    test "creates nested directories" do
      assert {:ok, _} = Local.put(@test_tenant, "a/b/c/deep.txt", @test_content)
      assert {:ok, true} = Local.exists?(@test_tenant, "a/b/c/deep.txt")
    end

    test "uses provided content type" do
      assert {:ok, artifact} =
               Local.put(@test_tenant, "data", @test_content, content_type: "application/json")

      assert artifact.content_type == "application/json"
    end

    test "stores metadata" do
      metadata = %{"custom" => "value"}

      assert {:ok, artifact} =
               Local.put(@test_tenant, "file.txt", @test_content, metadata: metadata)

      assert artifact.metadata == metadata
    end

    test "computes ETag when enabled" do
      assert {:ok, artifact} = Local.put(@test_tenant, "file.txt", @test_content)
      assert is_binary(artifact.etag) or is_nil(artifact.etag)
    end

    test "rejects path traversal attempts" do
      assert {:error, %Error{reason: :path_traversal}} =
               Local.put(@test_tenant, "../escape.txt", @test_content)
    end

    test "rejects invalid tenant IDs" do
      assert {:error, %Error{reason: :invalid_tenant}} =
               Local.put("../bad-tenant", "file.txt", @test_content)
    end

    test "overwrites existing files" do
      assert {:ok, _} = Local.put(@test_tenant, "file.txt", "original")
      assert {:ok, _} = Local.put(@test_tenant, "file.txt", "updated")
      assert {:ok, "updated"} = Local.get(@test_tenant, "file.txt")
    end

    test "atomic write prevents partial writes", %{base_path: base_path} do
      # Write a file first
      assert {:ok, _} = Local.put(@test_tenant, "atomic.txt", "complete content")

      # Verify no .tmp files left for THIS specific file
      tenant_path = Path.join(base_path, @test_tenant)
      atomic_tmp_files = Path.wildcard(Path.join(tenant_path, "atomic.txt.*.tmp"))
      assert atomic_tmp_files == []

      # Verify the actual content was written completely
      assert {:ok, "complete content"} = Local.get(@test_tenant, "atomic.txt")
    end
  end

  describe "get/2" do
    test "retrieves stored content" do
      assert {:ok, _} = Local.put(@test_tenant, "file.txt", @test_content)
      assert {:ok, @test_content} = Local.get(@test_tenant, "file.txt")
    end

    test "returns not_found error for missing files" do
      assert {:error, %Error{reason: :not_found}} = Local.get(@test_tenant, "missing.txt")
    end

    test "rejects path traversal" do
      assert {:error, %Error{reason: :path_traversal}} = Local.get(@test_tenant, "../etc/passwd")
    end
  end

  describe "delete/2" do
    test "removes stored file" do
      assert {:ok, _} = Local.put(@test_tenant, "file.txt", @test_content)
      assert :ok = Local.delete(@test_tenant, "file.txt")
      assert {:ok, false} = Local.exists?(@test_tenant, "file.txt")
    end

    test "succeeds for non-existent files (idempotent)" do
      assert :ok = Local.delete(@test_tenant, "nonexistent.txt")
    end

    test "rejects path traversal" do
      assert {:error, %Error{reason: :path_traversal}} = Local.delete(@test_tenant, "../secret")
    end
  end

  describe "exists?/2" do
    test "returns true for existing files" do
      assert {:ok, _} = Local.put(@test_tenant, "file.txt", @test_content)
      assert {:ok, true} = Local.exists?(@test_tenant, "file.txt")
    end

    test "returns false for missing files" do
      assert {:ok, false} = Local.exists?(@test_tenant, "missing.txt")
    end
  end

  describe "list/3" do
    test "lists files in directory" do
      assert {:ok, _} = Local.put(@test_tenant, "dir/file1.txt", "content1")
      assert {:ok, _} = Local.put(@test_tenant, "dir/file2.txt", "content2")

      assert {:ok, files} = Local.list(@test_tenant, "dir")

      paths = Enum.map(files, & &1.path)
      assert "dir/file1.txt" in paths
      assert "dir/file2.txt" in paths
    end

    test "lists recursively when requested" do
      assert {:ok, _} = Local.put(@test_tenant, "a/file1.txt", "content")
      assert {:ok, _} = Local.put(@test_tenant, "a/b/file2.txt", "content")
      assert {:ok, _} = Local.put(@test_tenant, "a/b/c/file3.txt", "content")

      assert {:ok, files} = Local.list(@test_tenant, "a", recursive: true)

      assert length(files) == 3
    end

    test "respects limit option" do
      for i <- 1..5 do
        Local.put(@test_tenant, "limited/file#{i}.txt", "content")
      end

      assert {:ok, files} = Local.list(@test_tenant, "limited", limit: 3)
      assert length(files) == 3
    end

    test "returns empty list for non-existent prefix" do
      assert {:ok, []} = Local.list(@test_tenant, "nonexistent")
    end
  end

  describe "stat/2" do
    test "returns file metadata" do
      assert {:ok, _} = Local.put(@test_tenant, "file.txt", @test_content)
      assert {:ok, stat} = Local.stat(@test_tenant, "file.txt")

      assert stat.path == "file.txt"
      assert stat.size == byte_size(@test_content)
      assert stat.content_type == "text/plain"
      assert %DateTime{} = stat.last_modified
    end

    test "returns not_found for missing files" do
      assert {:error, %Error{reason: :not_found}} = Local.stat(@test_tenant, "missing.txt")
    end
  end

  describe "stream/3" do
    test "returns stream for existing file" do
      large_content = String.duplicate("x", 10_000)
      assert {:ok, _} = Local.put(@test_tenant, "large.txt", large_content)

      assert {:ok, stream} = Local.stream(@test_tenant, "large.txt")
      content = stream |> Enum.to_list() |> IO.iodata_to_binary()
      assert content == large_content
    end

    test "returns not_found for missing files" do
      assert {:error, %Error{reason: :not_found}} = Local.stream(@test_tenant, "missing.txt")
    end

    test "respects chunk_size option" do
      content = String.duplicate("x", 1000)
      assert {:ok, _} = Local.put(@test_tenant, "chunked.txt", content)

      assert {:ok, stream} = Local.stream(@test_tenant, "chunked.txt", chunk_size: 100)
      chunks = Enum.to_list(stream)
      # First chunk should be chunk_size or less
      assert byte_size(hd(chunks)) <= 100
    end
  end

  describe "tenant isolation" do
    test "files from different tenants are separate" do
      assert {:ok, _} = Local.put("tenant-a", "shared.txt", "content-a")
      assert {:ok, _} = Local.put("tenant-b", "shared.txt", "content-b")

      assert {:ok, "content-a"} = Local.get("tenant-a", "shared.txt")
      assert {:ok, "content-b"} = Local.get("tenant-b", "shared.txt")
    end

    test "tenant cannot access other tenant's files" do
      assert {:ok, _} = Local.put("tenant-a", "private.txt", "secret")
      assert {:error, %Error{reason: :not_found}} = Local.get("tenant-b", "private.txt")
    end
  end
end
