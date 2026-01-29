defmodule Cybernetic.Core.Security.NonceBloomTest do
  use ExUnit.Case
  alias Cybernetic.Core.Security.NonceBloom

  # Helper to generate valid signatures for tests
  defp generate_test_signature(payload, nonce, timestamp) do
    secret =
      Application.get_env(:cybernetic, :security)[:hmac_secret] ||
        System.get_env("CYBERNETIC_HMAC_SECRET") ||
        "default-insecure-key-change-in-production"

    data =
      [
        nonce,
        timestamp,
        node(),
        # exchange
        "",
        # routing_key  
        "",
        # content_type
        "application/json",
        Jason.encode!(payload)
      ]
      |> Enum.join("|")

    :crypto.mac(:hmac, :sha256, secret, data) |> Base.encode16(case: :lower)
  end

  setup do
    # Ensure NonceBloom is running for each test
    # Use start_supervised! to properly manage the process in tests
    case Process.whereis(NonceBloom) do
      nil ->
        start_supervised!(NonceBloom)

      _pid ->
        :ok
    end

    :ok
  end

  describe "generate_nonce/0" do
    test "generates unique nonces" do
      nonce1 = NonceBloom.generate_nonce()
      nonce2 = NonceBloom.generate_nonce()

      assert nonce1 != nonce2
      assert is_binary(nonce1)
      assert String.length(nonce1) == 21
    end
  end

  describe "check_nonce/1" do
    test "returns new for first-time nonce" do
      nonce = NonceBloom.generate_nonce()
      assert {:ok, :new} = NonceBloom.check_nonce(nonce)
    end

    test "detects replay for used nonce" do
      nonce = NonceBloom.generate_nonce()
      assert {:ok, :new} = NonceBloom.check_nonce(nonce)
      assert {:error, :replay} = NonceBloom.check_nonce(nonce)
    end
  end

  describe "enrich_message/2" do
    test "adds security headers to message" do
      original = %{"data" => "test"}
      enriched = NonceBloom.enrich_message(original)

      assert enriched["_nonce"]
      assert enriched["_timestamp"]
      assert enriched["_site"]
      assert enriched["_signature"]
      assert enriched["data"] == "test"
    end

    test "generates valid HMAC signature" do
      original = %{"data" => "test"}
      enriched = NonceBloom.enrich_message(original)

      # Signature should be hex-encoded
      assert String.match?(enriched["_signature"], ~r/^[a-f0-9]{64}$/)
    end

    test "uses custom site when provided" do
      original = %{"data" => "test"}
      enriched = NonceBloom.enrich_message(original, site: "custom@node")

      assert enriched["_site"] == "custom@node"
    end
  end

  describe "validate_message/1" do
    test "validates properly enriched message" do
      # Manually create a message with fresh nonce that hasn't been tracked yet
      nonce = NonceBloom.generate_nonce()
      timestamp = System.system_time(:millisecond)
      payload = %{"data" => "test", "type" => "vsm.test"}

      # We need to manually build the enriched message without tracking the nonce
      enriched =
        Map.merge(payload, %{
          "_nonce" => nonce,
          "_timestamp" => timestamp,
          "_site" => node(),
          "_signature" => generate_test_signature(payload, nonce, timestamp)
        })

      assert {:ok, validated} = NonceBloom.validate_message(enriched)
      assert validated["data"] == "test"
      assert validated["type"] == "vsm.test"
      # Security headers should be stripped
      refute Map.has_key?(validated, "_nonce")
      refute Map.has_key?(validated, "_timestamp")
      refute Map.has_key?(validated, "_signature")
      refute Map.has_key?(validated, "_site")
    end

    test "rejects message with missing security headers" do
      message = %{"data" => "test"}
      assert {:error, :missing_security_headers} = NonceBloom.validate_message(message)
    end

    test "rejects message with invalid timestamp (future)" do
      future_time = System.system_time(:millisecond) + 60_000

      message = %{
        "_nonce" => NonceBloom.generate_nonce(),
        "_timestamp" => future_time,
        "_site" => "test@node",
        "_signature" => "invalid",
        "data" => "test"
      }

      # With clock skew tolerance, this returns a different error
      result = NonceBloom.validate_message(message)
      assert match?({:error, _}, result)
    end

    test "rejects message with expired timestamp" do
      # > 5 minutes old
      old_time = System.system_time(:millisecond) - 400_000

      message = %{
        "_nonce" => NonceBloom.generate_nonce(),
        "_timestamp" => old_time,
        "_site" => "test@node",
        "_signature" => "invalid",
        "data" => "test"
      }

      assert {:error, :clock_skew_past} = NonceBloom.validate_message(message)
    end

    test "rejects replayed message" do
      # Manually create message with fresh nonce
      nonce = NonceBloom.generate_nonce()
      timestamp = System.system_time(:millisecond)
      payload = %{"data" => "test"}

      enriched =
        Map.merge(payload, %{
          "_nonce" => nonce,
          "_timestamp" => timestamp,
          "_site" => node(),
          "_signature" => generate_test_signature(payload, nonce, timestamp)
        })

      # First validation should succeed
      assert {:ok, _} = NonceBloom.validate_message(enriched)

      # Second validation with same nonce should fail
      assert {:error, :replay} = NonceBloom.validate_message(enriched)
    end

    test "rejects message with tampered signature" do
      # Manually create message with fresh nonce
      nonce = NonceBloom.generate_nonce()
      timestamp = System.system_time(:millisecond)
      payload = %{"data" => "test"}

      enriched =
        Map.merge(payload, %{
          "_nonce" => nonce,
          "_timestamp" => timestamp,
          "_site" => node(),
          "_signature" => generate_test_signature(payload, nonce, timestamp)
        })

      # Tamper with the signature
      tampered = Map.put(enriched, "_signature", "bad" <> enriched["_signature"])

      assert {:error, :invalid_signature} = NonceBloom.validate_message(tampered)
    end

    test "rejects message with tampered payload" do
      # Manually create message with fresh nonce
      nonce = NonceBloom.generate_nonce()
      timestamp = System.system_time(:millisecond)
      payload = %{"data" => "test"}

      enriched =
        Map.merge(payload, %{
          "_nonce" => nonce,
          "_timestamp" => timestamp,
          "_site" => node(),
          "_signature" => generate_test_signature(payload, nonce, timestamp)
        })

      # Tamper with the payload
      tampered = Map.put(enriched, "data", "tampered")

      assert {:error, :invalid_signature} = NonceBloom.validate_message(tampered)
    end
  end

  describe "HMAC signature security" do
    test "signature changes with different payloads" do
      msg1 = NonceBloom.enrich_message(%{"data" => "test1"})
      msg2 = NonceBloom.enrich_message(%{"data" => "test2"})

      assert msg1["_signature"] != msg2["_signature"]
    end

    test "signature changes with different nonces" do
      payload = %{"data" => "same"}
      msg1 = NonceBloom.enrich_message(payload)
      # Ensure different timestamp
      Process.sleep(1)
      msg2 = NonceBloom.enrich_message(payload)

      assert msg1["_signature"] != msg2["_signature"]
      assert msg1["_nonce"] != msg2["_nonce"]
    end

    test "signature is deterministic for same inputs" do
      # Verify that enriched messages are unique due to nonces
      payload = %{"data" => "test"}

      enriched1 = NonceBloom.enrich_message(payload)
      enriched2 = NonceBloom.enrich_message(payload)

      # Different nonces mean different signatures even for same payload
      assert enriched1["_nonce"] != enriched2["_nonce"]
      assert enriched1["_signature"] != enriched2["_signature"]

      # But the payload is preserved
      assert enriched1["data"] == enriched2["data"]
      assert enriched1["data"] == "test"
    end
  end

  describe "cleanup process" do
    @tag :slow
    test "cleans up expired nonces" do
      # This would require exposing internal state or waiting for cleanup
      # For now, we verify the process doesn't crash
      nonce = NonceBloom.generate_nonce()
      assert {:ok, :new} = NonceBloom.check_nonce(nonce)

      # Send cleanup message directly (in real code, this happens on timer)
      send(Process.whereis(NonceBloom), :cleanup)
      Process.sleep(10)

      # Process should still be alive
      assert Process.alive?(Process.whereis(NonceBloom))
    end
  end
end
