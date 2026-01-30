defmodule Cybernetic.Storage.PathValidatorTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Storage.PathValidator

  describe "validate_path/1" do
    test "accepts valid simple paths" do
      assert {:ok, "file.txt"} = PathValidator.validate_path("file.txt")
      assert {:ok, "data/file.json"} = PathValidator.validate_path("data/file.json")

      assert {:ok, "artifacts/2024/01/data.bin"} =
               PathValidator.validate_path("artifacts/2024/01/data.bin")
    end

    test "accepts paths with valid characters" do
      assert {:ok, "file-name.txt"} = PathValidator.validate_path("file-name.txt")
      assert {:ok, "file_name.txt"} = PathValidator.validate_path("file_name.txt")

      assert {:ok, "file.multiple.dots.txt"} =
               PathValidator.validate_path("file.multiple.dots.txt")

      assert {:ok, "UPPERCASE.TXT"} = PathValidator.validate_path("UPPERCASE.TXT")
      assert {:ok, "123numeric.txt"} = PathValidator.validate_path("123numeric.txt")
    end

    test "rejects path traversal attempts" do
      assert {:error, :path_traversal} = PathValidator.validate_path("../secret")
      assert {:error, :path_traversal} = PathValidator.validate_path("foo/../bar")
      assert {:error, :path_traversal} = PathValidator.validate_path("foo/../../etc/passwd")
      assert {:error, :path_traversal} = PathValidator.validate_path("foo/bar/../../../root")
    end

    test "rejects paths with null bytes" do
      assert {:error, :invalid_path} = PathValidator.validate_path("file\x00.txt")
      assert {:error, :invalid_path} = PathValidator.validate_path("foo/\x00bar")
    end

    test "sanitizes absolute paths by removing leading slash" do
      # PathValidator sanitizes leading slashes rather than rejecting
      assert {:ok, "etc/passwd"} = PathValidator.validate_path("/etc/passwd")
      assert {:ok, "var/data/file.txt"} = PathValidator.validate_path("/var/data/file.txt")
    end

    test "rejects reserved Windows names" do
      assert {:error, :reserved_name} = PathValidator.validate_path("CON")
      assert {:error, :reserved_name} = PathValidator.validate_path("PRN")
      assert {:error, :reserved_name} = PathValidator.validate_path("AUX")
      assert {:error, :reserved_name} = PathValidator.validate_path("NUL")
      assert {:error, :reserved_name} = PathValidator.validate_path("COM1")
      assert {:error, :reserved_name} = PathValidator.validate_path("LPT1")
      # With extension
      assert {:error, :reserved_name} = PathValidator.validate_path("CON.txt")
      assert {:error, :reserved_name} = PathValidator.validate_path("data/NUL.json")
    end

    test "rejects empty paths" do
      assert {:error, :invalid_path} = PathValidator.validate_path("")
      assert {:error, :invalid_path} = PathValidator.validate_path(nil)
    end

    test "normalizes backslashes to forward slashes" do
      # Backslashes are normalized to forward slashes during sanitization
      assert {:ok, "foo/bar"} = PathValidator.validate_path("foo\\bar")
    end

    test "catches traversal through backslashes" do
      # Backslash traversal is caught after normalization
      assert {:error, :path_traversal} = PathValidator.validate_path("..\\escape")
    end

    test "handles paths with special characters" do
      # Only alphanumeric, dot, dash, underscore allowed
      assert {:error, :invalid_path} = PathValidator.validate_path("file with spaces.txt")
      assert {:error, :invalid_path} = PathValidator.validate_path("file@symbol.txt")
    end
  end

  describe "validate_tenant/1" do
    test "accepts valid tenant IDs" do
      assert {:ok, "tenant-1"} = PathValidator.validate_tenant("tenant-1")
      assert {:ok, "tenant_1"} = PathValidator.validate_tenant("tenant_1")
      assert {:ok, "TENANT"} = PathValidator.validate_tenant("TENANT")
      assert {:ok, "t"} = PathValidator.validate_tenant("t")
      assert {:ok, "tenant123"} = PathValidator.validate_tenant("tenant123")
    end

    test "rejects invalid tenant IDs" do
      # Path traversal attempts
      assert {:error, :invalid_tenant} = PathValidator.validate_tenant("../escape")
      assert {:error, :invalid_tenant} = PathValidator.validate_tenant("tenant/../other")

      # Invalid characters
      assert {:error, :invalid_tenant} = PathValidator.validate_tenant("tenant/subdir")
      assert {:error, :invalid_tenant} = PathValidator.validate_tenant("tenant with spaces")

      # Too long (max 63 chars)
      long_tenant = String.duplicate("a", 100)
      assert {:error, :invalid_tenant} = PathValidator.validate_tenant(long_tenant)

      # Empty or nil
      assert {:error, :invalid_tenant} = PathValidator.validate_tenant("")
      assert {:error, :invalid_tenant} = PathValidator.validate_tenant(nil)

      # Starting with invalid character
      assert {:error, :invalid_tenant} = PathValidator.validate_tenant("-tenant")
      assert {:error, :invalid_tenant} = PathValidator.validate_tenant("_tenant")
    end
  end

  describe "build_path/3" do
    setup do
      base_path = System.tmp_dir!() |> Path.join("cybernetic_test")
      File.mkdir_p!(base_path)
      on_exit(fn -> File.rm_rf!(base_path) end)
      {:ok, base_path: base_path}
    end

    test "builds valid full path", %{base_path: base_path} do
      assert {:ok, full_path} = PathValidator.build_path(base_path, "tenant-1", "data/file.json")
      assert full_path == Path.join([base_path, "tenant-1", "data/file.json"])
    end

    test "validates tenant ID", %{base_path: base_path} do
      assert {:error, :invalid_tenant} =
               PathValidator.build_path(base_path, "../escape", "file.txt")
    end

    test "validates path", %{base_path: base_path} do
      assert {:error, :path_traversal} =
               PathValidator.build_path(base_path, "tenant-1", "../escape.txt")
    end

    test "handles nested paths", %{base_path: base_path} do
      assert {:ok, full_path} =
               PathValidator.build_path(base_path, "tenant-1", "a/b/c/d/file.txt")

      assert full_path == Path.join([base_path, "tenant-1", "a/b/c/d/file.txt"])
    end
  end

  describe "path_within_base?/2" do
    test "returns true for paths within base" do
      assert PathValidator.path_within_base?("/tmp/storage/tenant/file.txt", "/tmp/storage")
      assert PathValidator.path_within_base?("/tmp/storage/tenant", "/tmp/storage")
    end

    test "returns false for paths outside base" do
      refute PathValidator.path_within_base?("/tmp/other/file.txt", "/tmp/storage")
      refute PathValidator.path_within_base?("/etc/passwd", "/tmp/storage")
    end

    test "handles path traversal attempts" do
      refute PathValidator.path_within_base?("/tmp/storage/../etc/passwd", "/tmp/storage")
    end
  end
end
