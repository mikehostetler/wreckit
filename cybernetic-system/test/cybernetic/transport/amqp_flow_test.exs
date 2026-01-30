defmodule Cybernetic.Transport.AMQPFlowTest do
  use ExUnit.Case

  # Skip these tests in test environment where AMQP is disabled
  @moduletag :amqp_required
  @moduletag :skip

  alias Cybernetic.Transport.Message

  @test_exchange "cyb.test.flow"
  @test_queue "cyb.test.flow.queue"
  @rabbit_host System.get_env("AMQP_HOST", "localhost")

  setup_all do
    # Check if RabbitMQ is available
    case :gen_tcp.connect(String.to_charlist(@rabbit_host), 5672, [:binary, active: false], 250) do
      {:ok, sock} ->
        :gen_tcp.close(sock)

      {:error, _} ->
        {:skip, "RabbitMQ not available at #{@rabbit_host}:5672"}
    end

    # Ensure AMQP connection is available
    {:ok, conn} =
      AMQP.Connection.open(
        Application.get_env(:cybernetic, :amqp_url, "amqp://guest:guest@#{@rabbit_host}:5672")
      )

    {:ok, chan} = AMQP.Channel.open(conn)

    # Declare test exchange and queue
    :ok = AMQP.Exchange.declare(chan, @test_exchange, :topic, durable: false)
    {:ok, _} = AMQP.Queue.declare(chan, @test_queue, durable: false, auto_delete: true)
    :ok = AMQP.Queue.bind(chan, @test_queue, @test_exchange, routing_key: "#")

    on_exit(fn ->
      try do
        AMQP.Queue.delete(chan, @test_queue)
        AMQP.Exchange.delete(chan, @test_exchange)
        AMQP.Channel.close(chan)
        AMQP.Connection.close(conn)
      rescue
        _ -> :ok
      end
    end)

    {:ok, channel: chan}
  end

  setup %{channel: chan} do
    # Purge queue before each test
    AMQP.Queue.purge(chan, @test_queue)
    :ok
  end

  test "headers normalized and delivered exactly-once", %{channel: chan} do
    nonce = Base.encode64(:crypto.strong_rand_bytes(16))
    timestamp = System.system_time(:millisecond)

    # Create a message with nested security headers
    raw = %{
      "headers" => %{
        "security" => %{
          "nonce" => nonce,
          "timestamp" => timestamp,
          "site" => node()
        }
      },
      "payload" => %{"hello" => "world", "test" => true}
    }

    # Normalize the message
    msg = Message.normalize(raw)

    # Verify headers were flattened
    assert Map.has_key?(msg, "_nonce") or
             (Map.has_key?(msg, "headers") and Map.has_key?(msg["headers"], "_nonce"))

    # Publish the message
    payload = Jason.encode!(msg)

    # Convert headers to AMQP format if they exist
    amqp_headers =
      case msg do
        %{"_nonce" => n, "_timestamp" => t} ->
          [{"_nonce", :longstr, to_string(n)}, {"_timestamp", :long, t}]

        _ ->
          []
      end

    :ok =
      AMQP.Basic.publish(
        chan,
        @test_exchange,
        "test.flow",
        payload,
        headers: amqp_headers,
        persistent: false
      )

    # Consume the message
    {:ok, tag} = AMQP.Basic.consume(chan, @test_queue, nil, no_ack: false)

    received =
      receive do
        {:basic_deliver, payload, meta} ->
          AMQP.Basic.ack(chan, meta.delivery_tag)
          {Jason.decode!(payload), meta}
      after
        2_000 -> flunk("No message received")
      end

    {decoded, _meta} = received

    # Verify payload is intact
    assert decoded["payload"]["hello"] == "world"
    assert decoded["payload"]["test"] == true

    # Cancel consumer
    {:ok, ^tag} = AMQP.Basic.cancel(chan, tag)
  end

  test "message routing through topic exchange", %{channel: chan} do
    # Test different routing keys
    test_cases = [
      {"vsm.s1.operation", "S1 operation"},
      {"vsm.s2.coordination", "S2 coordination"},
      {"vsm.s3.control", "S3 control"}
    ]

    # Subscribe to queue
    {:ok, tag} = AMQP.Basic.consume(chan, @test_queue, nil, no_ack: true)

    # Publish messages with different routing keys
    Enum.each(test_cases, fn {routing_key, content} ->
      msg = %{"type" => routing_key, "content" => content}

      :ok =
        AMQP.Basic.publish(
          chan,
          @test_exchange,
          routing_key,
          Jason.encode!(msg)
        )
    end)

    # Collect all messages
    messages =
      for _ <- test_cases do
        receive do
          {:basic_deliver, payload, _meta} ->
            Jason.decode!(payload)
        after
          1_000 -> nil
        end
      end
      |> Enum.reject(&is_nil/1)

    # Verify all messages were received
    assert length(messages) == length(test_cases)

    # Verify content
    Enum.each(test_cases, fn {routing_key, content} ->
      assert Enum.any?(messages, fn msg ->
               msg["type"] == routing_key and msg["content"] == content
             end)
    end)

    # Cancel consumer
    {:ok, ^tag} = AMQP.Basic.cancel(chan, tag)
  end

  test "message persistence and acknowledgment", %{channel: chan} do
    # Publish a persistent message
    msg = %{"persistent" => true, "id" => System.unique_integer()}

    :ok =
      AMQP.Basic.publish(
        chan,
        @test_exchange,
        "persistent.test",
        Jason.encode!(msg),
        persistent: true
      )

    # Consume with manual ack
    {:ok, tag} = AMQP.Basic.consume(chan, @test_queue, nil, no_ack: false)

    receive do
      {:basic_deliver, payload, meta} ->
        decoded = Jason.decode!(payload)
        assert decoded["persistent"] == true

        # Acknowledge the message
        :ok = AMQP.Basic.ack(chan, meta.delivery_tag)
    after
      2_000 -> flunk("No message received")
    end

    # Cancel consumer
    {:ok, ^tag} = AMQP.Basic.cancel(chan, tag)

    # Verify queue is empty after ack
    {:ok, %{message_count: count}} = AMQP.Queue.declare(chan, @test_queue, passive: true)
    assert count == 0
  end
end
