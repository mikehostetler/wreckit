defmodule Cybernetic.Transport.MessageTest do
  use ExUnit.Case
  alias Cybernetic.Transport.Message

  describe "normalize/1" do
    test "preserves messages with flat security headers" do
      message = %{
        "_nonce" => "test-nonce",
        "_timestamp" => 123_456_789,
        "_site" => "node@host",
        "_signature" => "abc123",
        "payload" => %{"data" => "test"}
      }

      assert Message.normalize(message) == message
    end

    test "flattens security headers from headers.security" do
      message = %{
        "headers" => %{
          "security" => %{
            "_nonce" => "nested-nonce",
            "_timestamp" => 987_654_321,
            "_site" => "node2@host",
            "_signature" => "xyz789"
          }
        },
        "payload" => %{"data" => "test"}
      }

      normalized = Message.normalize(message)
      assert normalized["_nonce"] == "nested-nonce"
      assert normalized["_timestamp"] == 987_654_321
      assert normalized["_site"] == "node2@host"
      assert normalized["_signature"] == "xyz789"
    end

    test "flattens security headers from security root" do
      message = %{
        "security" => %{
          "_nonce" => "sec-nonce",
          "_timestamp" => 555_555_555,
          "_site" => "node3@host",
          "_signature" => "def456"
        },
        "payload" => %{"data" => "test"}
      }

      normalized = Message.normalize(message)
      assert normalized["_nonce"] == "sec-nonce"
      assert normalized["_timestamp"] == 555_555_555
      assert normalized["_site"] == "node3@host"
      assert normalized["_signature"] == "def456"
    end

    test "flattens security headers directly from headers" do
      message = %{
        "headers" => %{
          "_nonce" => "header-nonce",
          "_timestamp" => 111_111_111,
          "_site" => "node4@host",
          "_signature" => "ghi789",
          "other" => "data"
        },
        "payload" => %{"data" => "test"}
      }

      normalized = Message.normalize(message)
      assert normalized["_nonce"] == "header-nonce"
      assert normalized["_timestamp"] == 111_111_111
      assert normalized["_site"] == "node4@host"
      assert normalized["_signature"] == "ghi789"
    end

    test "prioritizes headers.security over security over headers" do
      message = %{
        "headers" => %{
          "_nonce" => "header-nonce",
          "_timestamp" => 111,
          "security" => %{
            "_nonce" => "nested-nonce",
            "_timestamp" => 222
          }
        },
        "security" => %{
          "_nonce" => "sec-nonce",
          "_timestamp" => 333
        },
        "payload" => %{"data" => "test"}
      }

      normalized = Message.normalize(message)
      # headers.security should win
      assert normalized["_nonce"] == "nested-nonce"
      assert normalized["_timestamp"] == 222
    end

    test "handles partial security headers" do
      message = %{
        "headers" => %{
          "_nonce" => "partial-nonce"
        },
        "security" => %{
          "_timestamp" => 999_999_999,
          "_signature" => "partial-sig"
        },
        "payload" => %{"data" => "test"}
      }

      normalized = Message.normalize(message)
      assert normalized["_nonce"] == "partial-nonce"
      assert normalized["_timestamp"] == 999_999_999
      assert normalized["_signature"] == "partial-sig"
    end

    test "normalizes binary payloads" do
      binary = Jason.encode!(%{"data" => "test"})
      normalized = Message.normalize(binary)
      assert normalized["data"] == "test"
    end

    test "handles invalid JSON binary" do
      normalized = Message.normalize("not-json")
      assert normalized == %{"payload" => "not-json"}
    end
  end

  describe "has_security_envelope?/1" do
    test "returns true for complete security envelope" do
      message = %{
        "_nonce" => "test",
        "_timestamp" => 123,
        "_signature" => "sig"
      }

      assert Message.has_security_envelope?(message)
    end

    test "returns false for incomplete security envelope" do
      message = %{
        "_nonce" => "test",
        "_timestamp" => 123
        # missing _signature
      }

      refute Message.has_security_envelope?(message)
    end

    test "returns false for empty message" do
      refute Message.has_security_envelope?(%{})
    end
  end

  describe "get_type/1" do
    test "gets type from root level" do
      assert Message.get_type(%{"type" => "test"}) == "test"
    end

    test "gets type from payload" do
      assert Message.get_type(%{"payload" => %{"type" => "nested"}}) == "nested"
    end

    test "gets type from headers" do
      assert Message.get_type(%{"headers" => %{"type" => "header-type"}}) == "header-type"
    end

    test "returns nil for missing type" do
      assert Message.get_type(%{}) == nil
    end
  end

  describe "extract_payload/1" do
    test "extracts payload field if present" do
      message = %{"payload" => %{"data" => "test"}, "other" => "field"}
      assert Message.extract_payload(message) == %{"data" => "test"}
    end

    test "returns entire message if no payload field" do
      message = %{"data" => "test", "other" => "field"}
      assert Message.extract_payload(message) == message
    end
  end
end
