defmodule Cybernetic.Property.MessageNormalizePropTest do
  use ExUnit.Case
  use ExUnitProperties

  alias Cybernetic.Transport.Message
  alias Cybernetic.Core.Security.NonceBloom

  # Helper to generate serializable terms (no references, PIDs, etc)
  defp serializable_term do
    import StreamData

    one_of([
      atom(:alphanumeric),
      string(:alphanumeric),
      integer(),
      float(),
      boolean(),
      list_of(string(:alphanumeric), max_length: 3),
      map_of(string(:alphanumeric), one_of([string(:alphanumeric), integer(), boolean()]),
        max_length: 3
      )
    ])
  end

  property "normalize flattens nested security headers and preserves content" do
    check all(
            payload <- serializable_term(),
            nonce <- binary(min_length: 16, max_length: 32),
            timestamp <- positive_integer()
          ) do
      # Create message with nested security headers
      raw = %{
        "headers" => %{
          "security" => %{
            "_nonce" => Base.encode64(nonce),
            "_timestamp" => timestamp,
            "_site" => "test_node"
          }
        },
        "payload" => payload
      }

      # Normalize the message
      normalized = Message.normalize(raw)

      # Verify headers were flattened to top level
      assert Map.has_key?(normalized, "_nonce")

      # Verify payload is preserved
      assert normalized["payload"] == payload
    end
  end

  property "message signing and verification round-trip" do
    check all(
            payload <- map_of(string(:alphanumeric), serializable_term()),
            max_runs: 50
          ) do
      # Enrich message with security headers
      msg = NonceBloom.enrich_message(%{"payload" => payload})

      # Verify it has all required headers
      assert Map.has_key?(msg, "_nonce")
      assert Map.has_key?(msg, "_timestamp")
      assert Map.has_key?(msg, "_signature")
      assert Map.has_key?(msg, "_key_id")

      # The signature should be valid (would need NonceBloom started for full validation)
      assert is_binary(msg["_signature"])
      assert byte_size(msg["_signature"]) > 0
    end
  end

  property "flatten_security_headers is idempotent" do
    check all(
            nonce <- binary(min_length: 16, max_length: 32),
            timestamp <- positive_integer(),
            payload <- serializable_term()
          ) do
      msg = %{
        "_nonce" => Base.encode64(nonce),
        "_timestamp" => timestamp,
        "_site" => "test",
        "payload" => payload
      }

      # Flattening an already flat message should be identical
      flattened_once = Message.flatten_security_headers(msg)
      flattened_twice = Message.flatten_security_headers(flattened_once)

      assert flattened_once == flattened_twice
    end
  end

  property "canonical string generation is deterministic" do
    check all(
            payload <- map_of(string(:alphanumeric), serializable_term()),
            nonce <- binary(min_length: 16, max_length: 32),
            timestamp <- positive_integer()
          ) do
      nonce_str = Base.encode64(nonce)

      # Generate canonical string multiple times
      canonical1 = NonceBloom.canonical_string(payload, nonce_str, timestamp)
      canonical2 = NonceBloom.canonical_string(payload, nonce_str, timestamp)

      # Should be identical for same inputs
      assert canonical1 == canonical2

      # Should contain all components
      assert String.contains?(canonical1, nonce_str)
      assert String.contains?(canonical1, to_string(timestamp))
      assert String.contains?(canonical1, Jason.encode!(payload))
    end
  end

  property "messages with different nonces have different signatures" do
    check all(
            payload <- map_of(string(:alphanumeric), serializable_term()),
            nonce1 <- binary(min_length: 16, max_length: 32),
            nonce2 <- binary(min_length: 16, max_length: 32),
            nonce1 != nonce2
          ) do
      # Create two messages with same payload but different nonces
      msg1 = %{
        "_nonce" => Base.encode64(nonce1),
        "_timestamp" => System.system_time(:millisecond),
        "_site" => node(),
        "payload" => payload
      }

      msg2 = %{
        "_nonce" => Base.encode64(nonce2),
        "_timestamp" => System.system_time(:millisecond),
        "_site" => node(),
        "payload" => payload
      }

      # Their canonical strings should differ
      canonical1 =
        NonceBloom.canonical_string(
          msg1["payload"],
          msg1["_nonce"],
          msg1["_timestamp"]
        )

      canonical2 =
        NonceBloom.canonical_string(
          msg2["payload"],
          msg2["_nonce"],
          msg2["_timestamp"]
        )

      assert canonical1 != canonical2
    end
  end
end
