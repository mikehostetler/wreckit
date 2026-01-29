defmodule Cybernetic.Capabilities.ValidationTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Capabilities.Validation

  describe "validate_required/2" do
    test "passes when all fields present" do
      attrs = %{name: "test", desc: "description", provider: MyMod}
      assert :ok = Validation.validate_required(attrs, [:name, :desc, :provider])
    end

    test "fails when field missing" do
      attrs = %{name: "test"}

      assert {:error, {:missing_field, :desc}} =
               Validation.validate_required(attrs, [:name, :desc])
    end

    test "fails when field is nil" do
      attrs = %{name: "test", desc: nil}

      assert {:error, {:missing_field, :desc}} =
               Validation.validate_required(attrs, [:name, :desc])
    end
  end

  describe "validate_name/1" do
    test "accepts valid names" do
      assert :ok = Validation.validate_name("my_tool")
      assert :ok = Validation.validate_name("tool-name")
      assert :ok = Validation.validate_name("Tool.Name")
      assert :ok = Validation.validate_name("tool123")
    end

    test "rejects path traversal attempts" do
      assert {:error, :invalid_name_chars} = Validation.validate_name("../etc/passwd")
      assert {:error, :invalid_name_chars} = Validation.validate_name("..\\windows\\system32")
    end

    test "rejects special characters" do
      assert {:error, :invalid_name_chars} = Validation.validate_name("tool;rm -rf /")
      assert {:error, :invalid_name_chars} = Validation.validate_name("tool`whoami`")
      assert {:error, :invalid_name_chars} = Validation.validate_name("tool$(id)")
    end

    test "rejects names that are too long" do
      long_name = String.duplicate("a", 200)
      assert {:error, :name_too_long} = Validation.validate_name(long_name)
    end

    test "rejects non-strings" do
      assert {:error, :invalid_name_chars} = Validation.validate_name(123)
      assert {:error, :invalid_name_chars} = Validation.validate_name(:atom)
    end
  end

  describe "validate_description/1" do
    test "accepts valid descriptions" do
      assert :ok = Validation.validate_description("A short description")
      assert :ok = Validation.validate_description(String.duplicate("x", 4000))
    end

    test "rejects descriptions that are too long" do
      long_desc = String.duplicate("x", 5000)
      assert {:error, :description_too_long} = Validation.validate_description(long_desc)
    end

    test "accepts non-string (nil, etc)" do
      assert :ok = Validation.validate_description(nil)
    end
  end

  describe "validate_context_size/1" do
    test "accepts small contexts" do
      context = %{key: "value", nested: %{a: 1, b: 2}}
      assert :ok = Validation.validate_context_size(context)
    end

    test "rejects contexts that are too large" do
      # Create a map that's over 1MB
      large_context = %{data: String.duplicate("x", 1_100_000)}
      assert {:error, :context_too_large} = Validation.validate_context_size(large_context)
    end

    test "accepts non-map" do
      assert :ok = Validation.validate_context_size(nil)
      assert :ok = Validation.validate_context_size("string")
    end
  end

  describe "validate_args_size/1" do
    test "accepts small args" do
      args = %{param1: "value1", param2: "value2"}
      assert :ok = Validation.validate_args_size(args)
    end

    test "rejects args that are too large" do
      large_args = %{data: String.duplicate("x", 70_000)}
      assert {:error, :args_too_large} = Validation.validate_args_size(large_args)
    end
  end

  describe "sanitize_name/1" do
    test "removes dangerous characters" do
      # Dots are allowed, slashes are removed
      assert "..etc_passwd" = Validation.sanitize_name("../etc_passwd")
      assert "toolname" = Validation.sanitize_name("tool;name")
      assert "toolname" = Validation.sanitize_name("tool`name")
      assert "toolname" = Validation.sanitize_name("tool/name")
    end

    test "preserves valid characters" do
      assert "my_tool-name.v2" = Validation.sanitize_name("my_tool-name.v2")
    end

    test "truncates to max length" do
      long_name = String.duplicate("a", 200)
      result = Validation.sanitize_name(long_name)
      assert String.length(result) == 128
    end

    test "handles non-string" do
      assert "" = Validation.sanitize_name(123)
    end
  end

  describe "validate_url/1" do
    test "accepts http and https URLs" do
      assert :ok = Validation.validate_url("http://example.com")
      assert :ok = Validation.validate_url("https://example.com")
      assert :ok = Validation.validate_url("https://api.example.com/v1")
    end

    test "rejects invalid schemes" do
      assert {:error, :invalid_url} = Validation.validate_url("ftp://example.com")
      assert {:error, :invalid_url} = Validation.validate_url("file:///etc/passwd")
    end

    test "rejects URLs without host" do
      assert {:error, :invalid_url} = Validation.validate_url("http://")
      assert {:error, :invalid_url} = Validation.validate_url("not-a-url")
    end

    test "rejects non-strings" do
      assert {:error, :invalid_url} = Validation.validate_url(123)
      assert {:error, :invalid_url} = Validation.validate_url(nil)
    end
  end

  describe "validate_tools/1" do
    test "accepts valid tool list" do
      assert :ok = Validation.validate_tools(["tool1", "tool2"])
      assert :ok = Validation.validate_tools(["single_tool"])
    end

    test "rejects empty list" do
      assert {:error, :invalid_tools} = Validation.validate_tools([])
    end

    test "rejects non-list" do
      assert {:error, :invalid_tools} = Validation.validate_tools("tool")
      assert {:error, :invalid_tools} = Validation.validate_tools(nil)
    end

    test "rejects invalid tool names in list" do
      assert {:error, :invalid_tool_name} = Validation.validate_tools(["valid", "../invalid"])
    end
  end

  describe "validate_provider/1" do
    test "accepts atoms" do
      assert :ok = Validation.validate_provider(MyModule)
      assert :ok = Validation.validate_provider(:some_atom)
    end

    test "rejects nil" do
      assert {:error, :invalid_provider} = Validation.validate_provider(nil)
    end

    test "rejects non-atoms" do
      assert {:error, :invalid_provider} = Validation.validate_provider("string")
      assert {:error, :invalid_provider} = Validation.validate_provider(123)
    end
  end
end
