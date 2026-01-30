defmodule Cybernetic.ValidationTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Validation

  describe "valid_uuid?/1" do
    test "accepts valid UUIDs" do
      assert Validation.valid_uuid?("550e8400-e29b-41d4-a716-446655440000")
      assert Validation.valid_uuid?("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
      assert Validation.valid_uuid?("f47ac10b-58cc-4372-a567-0e02b2c3d479")
    end

    test "accepts uppercase UUIDs" do
      assert Validation.valid_uuid?("550E8400-E29B-41D4-A716-446655440000")
    end

    test "rejects invalid UUIDs" do
      refute Validation.valid_uuid?("not-a-uuid")
      refute Validation.valid_uuid?("550e8400-e29b-41d4-a716")
      refute Validation.valid_uuid?("550e8400e29b41d4a716446655440000")
      refute Validation.valid_uuid?("")
      refute Validation.valid_uuid?(nil)
      refute Validation.valid_uuid?(123)
    end
  end

  describe "validate_uuid/1" do
    test "returns ok tuple for valid UUID" do
      uuid = "550e8400-e29b-41d4-a716-446655440000"
      assert {:ok, ^uuid} = Validation.validate_uuid(uuid)
    end

    test "returns error for invalid UUID" do
      assert {:error, :invalid_uuid} = Validation.validate_uuid("not-valid")
    end
  end

  describe "validate_uuid!/1" do
    test "returns UUID for valid input" do
      uuid = "550e8400-e29b-41d4-a716-446655440000"
      assert ^uuid = Validation.validate_uuid!(uuid)
    end

    test "raises for invalid input" do
      assert_raise ArgumentError, fn ->
        Validation.validate_uuid!("not-valid")
      end
    end
  end

  describe "valid_tenant_id?/1" do
    test "accepts valid tenant IDs" do
      assert Validation.valid_tenant_id?("tenant-1")
      assert Validation.valid_tenant_id?("tenant_1")
      assert Validation.valid_tenant_id?("Tenant123")
      assert Validation.valid_tenant_id?("t")
      assert Validation.valid_tenant_id?("A1")
    end

    test "rejects invalid tenant IDs" do
      refute Validation.valid_tenant_id?("-starts-with-dash")
      refute Validation.valid_tenant_id?("_starts_with_underscore")
      refute Validation.valid_tenant_id?("has spaces")
      refute Validation.valid_tenant_id?("has/slash")
      refute Validation.valid_tenant_id?("../traversal")
      refute Validation.valid_tenant_id?("")
      refute Validation.valid_tenant_id?(nil)

      # Too long
      long_tenant = String.duplicate("a", 100)
      refute Validation.valid_tenant_id?(long_tenant)
    end
  end

  describe "validate_tenant_id/1" do
    test "returns ok for valid tenant" do
      assert {:ok, "tenant-1"} = Validation.validate_tenant_id("tenant-1")
    end

    test "returns error for invalid tenant" do
      assert {:error, :invalid_tenant_id} = Validation.validate_tenant_id("../bad")
    end
  end

  describe "valid_ip?/1" do
    test "validates IPv4 addresses" do
      assert Validation.valid_ip?("192.168.1.1")
      assert Validation.valid_ip?("10.0.0.1")
      assert Validation.valid_ip?("255.255.255.255")
      assert Validation.valid_ip?("0.0.0.0")
    end

    test "validates IPv6 addresses" do
      assert Validation.valid_ip?("::1")
      assert Validation.valid_ip?("2001:0db8:85a3:0000:0000:8a2e:0370:7334")
      assert Validation.valid_ip?("fe80::1")
    end

    test "rejects invalid IP addresses" do
      refute Validation.valid_ip?("256.1.1.1")
      refute Validation.valid_ip?("not-an-ip")
      refute Validation.valid_ip?("192.168.1.1.1")
      refute Validation.valid_ip?("abc.def.ghi.jkl")
      refute Validation.valid_ip?("")
      refute Validation.valid_ip?(nil)
    end
  end

  describe "parse_forwarded_ip/1" do
    test "extracts rightmost IP from chain" do
      assert {:ok, "150.172.238.178"} =
               Validation.parse_forwarded_ip("203.0.113.195, 70.41.3.18, 150.172.238.178")
    end

    test "handles single IP" do
      assert {:ok, "192.168.1.1"} = Validation.parse_forwarded_ip("192.168.1.1")
    end

    test "handles whitespace" do
      assert {:ok, "10.0.0.1"} = Validation.parse_forwarded_ip("  10.0.0.1  ")
    end

    test "returns error for invalid IP" do
      assert {:error, :invalid_ip} = Validation.parse_forwarded_ip("not-an-ip")
    end
  end

  describe "truncate_content/3" do
    test "returns content unchanged if under limit" do
      assert "short" = Validation.truncate_content("short", 100)
    end

    test "truncates content exceeding limit" do
      result = Validation.truncate_content("very long content here", 9)
      assert result == "very long\n[TRUNCATED]"
    end

    test "uses custom indicator" do
      result = Validation.truncate_content("long text", 4, "...")
      assert result == "long..."
    end

    test "uses config default when no limit provided" do
      # Should not raise, uses config value
      result = Validation.truncate_content(String.duplicate("x", 50_000))
      # Result should be truncated (default is 10_000)
      assert String.length(result) <= 10_020
    end
  end

  describe "validate_content_length/2" do
    test "returns ok for content within limit" do
      assert {:ok, "short"} = Validation.validate_content_length("short", 100)
    end

    test "returns error for content exceeding limit" do
      assert {:error, :content_too_long} =
               Validation.validate_content_length("too long for limit", 5)
    end
  end

  describe "safe_to_atom/2" do
    test "converts valid string to existing atom" do
      allowed = [:full, :summary, :entities]
      assert {:ok, :full} = Validation.safe_to_atom("full", allowed)
      assert {:ok, :summary} = Validation.safe_to_atom("summary", allowed)
    end

    test "rejects strings not in allowed list" do
      allowed = [:full, :summary]
      assert {:error, :invalid_value} = Validation.safe_to_atom("invalid", allowed)
    end

    test "handles non-binary input" do
      assert {:error, :invalid_value} = Validation.safe_to_atom(123, [:a])
      assert {:error, :invalid_value} = Validation.safe_to_atom(nil, [:a])
    end
  end

  describe "safe_json_decode/1" do
    test "decodes valid JSON" do
      assert {:ok, %{"key" => "value"}} = Validation.safe_json_decode(~s({"key": "value"}))
      assert {:ok, [1, 2, 3]} = Validation.safe_json_decode("[1, 2, 3]")
    end

    test "returns error for invalid JSON" do
      assert {:error, :invalid_json} = Validation.safe_json_decode("not json")
      assert {:error, :invalid_json} = Validation.safe_json_decode("{incomplete")
    end

    test "handles non-binary input" do
      assert {:error, :invalid_json} = Validation.safe_json_decode(nil)
      assert {:error, :invalid_json} = Validation.safe_json_decode(123)
    end
  end

  describe "extract_json/2" do
    test "extracts JSON object from text" do
      content = ~s(Here is the result: {"key": "value"} and more text)
      assert {:ok, %{"key" => "value"}} = Validation.extract_json(content)
    end

    test "extracts JSON array from text" do
      content = ~s(The topics are: ["a", "b", "c"] as shown)
      assert {:ok, ["a", "b", "c"]} = Validation.extract_json(content)
    end

    test "returns default when no JSON found" do
      assert {:ok, []} = Validation.extract_json("no json here", [])
    end

    test "returns error when no JSON and no default" do
      assert {:error, :no_json_found} = Validation.extract_json("no json here")
    end
  end
end
