defmodule Cybernetic.Storage.ErrorTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Storage.Error

  describe "new/2" do
    test "creates error with reason" do
      error = Error.new(:not_found)
      assert %Error{reason: :not_found} = error
    end

    test "creates error with options" do
      error =
        Error.new(:not_found,
          path: "data/file.json",
          tenant_id: "tenant-1",
          operation: :get,
          message: "Custom message"
        )

      assert error.reason == :not_found
      assert error.path == "data/file.json"
      assert error.tenant_id == "tenant-1"
      assert error.operation == :get
      assert error.message == "Custom message"
    end

    test "creates error with details map" do
      error = Error.new(:storage_error, details: %{raw_reason: :enospc})
      assert error.details == %{raw_reason: :enospc}
    end
  end

  describe "wrap/2" do
    test "wraps :enoent as :not_found" do
      error = Error.wrap(:enoent, path: "file.txt")
      assert error.reason == :not_found
      assert error.path == "file.txt"
    end

    test "wraps :eacces as :permission_denied" do
      error = Error.wrap(:eacces, path: "secret.txt")
      assert error.reason == :permission_denied
    end

    test "wraps :enospc as :quota_exceeded" do
      error = Error.wrap(:enospc, tenant_id: "tenant-1")
      assert error.reason == :quota_exceeded
      assert error.tenant_id == "tenant-1"
    end

    test "wraps :timeout" do
      error = Error.wrap(:timeout, operation: :get)
      assert error.reason == :timeout
      assert error.operation == :get
    end

    test "wraps unknown atoms as :storage_error" do
      error = Error.wrap(:unknown_error, path: "file.txt")
      assert error.reason == :storage_error
      assert error.details == %{raw_reason: :unknown_error}
    end

    test "wraps non-atom reasons" do
      error = Error.wrap({:error, "something"}, path: "file.txt")
      assert error.reason == :storage_error
      assert error.details.raw_reason != nil
    end
  end

  describe "message/1" do
    test "returns custom message when provided" do
      error = Error.new(:not_found, message: "File is missing")
      assert Exception.message(error) == "File is missing"
    end

    test "generates message from reason when no custom message" do
      error = Error.new(:not_found)
      assert Exception.message(error) == "Resource not found"
    end

    test "includes context in generated message" do
      error =
        Error.new(:not_found,
          path: "data/file.json",
          tenant_id: "tenant-1",
          operation: :get
        )

      message = Exception.message(error)
      assert message =~ "Resource not found"
      assert message =~ "path=data/file.json"
      assert message =~ "tenant=tenant-1"
      assert message =~ "operation=get"
    end

    test "maps all reason types to messages" do
      reasons = [
        :not_found,
        :invalid_path,
        :path_traversal,
        :permission_denied,
        :storage_error,
        :quota_exceeded,
        :invalid_tenant,
        :invalid_content,
        :timeout
      ]

      for reason <- reasons do
        error = Error.new(reason)
        message = Exception.message(error)
        assert is_binary(message)
        assert message != ""
      end
    end
  end

  describe "to_log_metadata/1" do
    test "returns keyword list of non-nil fields" do
      error =
        Error.new(:not_found,
          path: "file.json",
          tenant_id: "tenant-1",
          operation: :get
        )

      metadata = Error.to_log_metadata(error)

      assert Keyword.get(metadata, :error_reason) == :not_found
      assert Keyword.get(metadata, :error_path) == "file.json"
      assert Keyword.get(metadata, :error_tenant) == "tenant-1"
      assert Keyword.get(metadata, :error_operation) == :get
    end

    test "excludes nil fields" do
      error = Error.new(:not_found)
      metadata = Error.to_log_metadata(error)

      assert Keyword.get(metadata, :error_reason) == :not_found
      refute Keyword.has_key?(metadata, :error_path)
      refute Keyword.has_key?(metadata, :error_tenant)
      refute Keyword.has_key?(metadata, :error_operation)
    end
  end

  describe "defexception behavior" do
    test "can be raised" do
      assert_raise Error, fn ->
        raise Error.new(:not_found, message: "Test error")
      end
    end

    test "is an exception" do
      error = Error.new(:not_found)
      assert Exception.exception?(error)
    end

    test "works with try/rescue" do
      result =
        try do
          raise Error.new(:permission_denied, path: "secret.txt")
        rescue
          e in Error ->
            {:caught, e.reason}
        end

      assert {:caught, :permission_denied} = result
    end
  end
end
