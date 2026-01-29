defmodule Mix.Tasks.Cyb.Probe do
  use Mix.Task

  @shortdoc "Deterministic probe of AMQP + Security + Goldrush"

  @moduledoc """
  Runs a comprehensive probe of the Cybernetic system components:
  - MCP Registry readiness
  - AMQP round-trip messaging
  - Goldrush telemetry pipeline

  Usage:
    mix cyb.probe
  """

  alias Cybernetic.Core.MCP.Hermes.Registry
  alias Cybernetic.Transport.Message

  def run(_args) do
    Mix.Task.run("app.start")

    IO.puts("\n🔍 Starting Cybernetic System Probe...\n")

    results = [
      probe_registry(),
      probe_amqp_roundtrip(),
      probe_goldrush()
    ]

    print_summary(results)

    if Enum.all?(results, &match?({:ok, _}, &1)) do
      IO.puts("\n✅ CYB PROBE: All checks passed")
      System.halt(0)
    else
      IO.puts("\n❌ CYB PROBE: Failures detected")
      System.halt(1)
    end
  end

  defp probe_registry do
    IO.write("  Checking MCP Registry... ")

    case Registry.await_ready(2_000) do
      :ok ->
        case Registry.list_tools() do
          {:ok, tools} when length(tools) >= 1 ->
            IO.puts("✓ (#{length(tools)} tools)")
            {:ok, :registry}

          {:ok, []} ->
            IO.puts("✗ (no tools registered)")
            {:error, :empty_registry}

          {:error, reason} ->
            IO.puts("✗ (#{inspect(reason)})")
            {:error, {:registry_error, reason}}
        end

      {:error, :timeout} ->
        IO.puts("✗ (timeout)")
        {:error, :registry_timeout}
    end
  end

  defp probe_amqp_roundtrip do
    IO.write("  Checking AMQP connectivity... ")

    # Try to connect and declare a test queue
    case AMQP.Connection.open(
           Application.get_env(:cybernetic, :amqp_url, "amqp://guest:guest@localhost:5672")
         ) do
      {:ok, conn} ->
        case AMQP.Channel.open(conn) do
          {:ok, chan} ->
            result = test_amqp_flow(chan)
            AMQP.Channel.close(chan)
            AMQP.Connection.close(conn)

            case result do
              :ok ->
                IO.puts("✓")
                {:ok, :amqp}

              error ->
                IO.puts("✗ (#{inspect(error)})")
                {:error, {:amqp_flow, error}}
            end

          {:error, reason} ->
            AMQP.Connection.close(conn)
            IO.puts("✗ (channel: #{inspect(reason)})")
            {:error, {:channel_error, reason}}
        end

      {:error, reason} ->
        IO.puts("✗ (connection: #{inspect(reason)})")
        {:error, {:connection_error, reason}}
    end
  end

  defp test_amqp_flow(chan) do
    test_exchange = "cyb.probe.test"
    test_queue = "cyb.probe.test.queue"

    try do
      # Declare test topology
      :ok = AMQP.Exchange.declare(chan, test_exchange, :topic, auto_delete: true)
      {:ok, _} = AMQP.Queue.declare(chan, test_queue, auto_delete: true)
      :ok = AMQP.Queue.bind(chan, test_queue, test_exchange, routing_key: "#")

      # Create and normalize a test message
      nonce = Base.encode64(:crypto.strong_rand_bytes(16))

      raw = %{
        "headers" => %{
          "security" => %{
            "nonce" => nonce,
            "timestamp" => System.system_time(:millisecond)
          }
        },
        "payload" => %{"probe" => true, "timestamp" => System.system_time()}
      }

      msg = Message.normalize(raw)

      # Publish
      :ok =
        AMQP.Basic.publish(
          chan,
          test_exchange,
          "probe.test",
          Jason.encode!(msg)
        )

      # Try to consume
      {:ok, tag} = AMQP.Basic.consume(chan, test_queue, nil, no_ack: true)

      result =
        receive do
          {:basic_deliver, payload, _meta} ->
            case Jason.decode(payload) do
              {:ok, decoded} ->
                if decoded["payload"]["probe"] == true do
                  :ok
                else
                  :decode_error
                end

              _ ->
                :decode_error
            end
        after
          1_000 -> :timeout
        end

      # Cancel consumer
      AMQP.Basic.cancel(chan, tag)

      # Cleanup
      AMQP.Queue.delete(chan, test_queue)
      AMQP.Exchange.delete(chan, test_exchange)

      result
    rescue
      e -> {:exception, e}
    end
  end

  defp probe_goldrush do
    IO.write("  Checking Goldrush pipeline... ")

    # Start Pipeline if needed
    case GenServer.whereis(Cybernetic.Core.Goldrush.Pipeline) do
      nil ->
        {:ok, _} = Cybernetic.Core.Goldrush.Pipeline.start_link([])

      _ ->
        :ok
    end

    ref = make_ref()
    parent = self()

    :telemetry.attach(
      {:probe_alg, ref},
      [:cybernetic, :algedonic],
      fn _e, meas, _meta, _ -> send(parent, {:alg, meas.severity}) end,
      nil
    )

    # Emit a slow event that should trigger pain
    :telemetry.execute(
      [:cybernetic, :work, :finished],
      %{duration: 300},
      %{source: "probe"}
    )

    result =
      receive do
        {:alg, :pain} ->
          IO.puts("✓")
          {:ok, :goldrush}
      after
        800 ->
          IO.puts("✗ (no algedonic signal)")
          {:error, :no_algedonic}
      end

    :telemetry.detach({:probe_alg, ref})
    result
  end

  defp print_summary(results) do
    IO.puts("\n📊 Probe Summary:")
    IO.puts("  ├─ MCP Registry: #{format_result(Enum.at(results, 0))}")
    IO.puts("  ├─ AMQP Transport: #{format_result(Enum.at(results, 1))}")
    IO.puts("  └─ Goldrush Pipeline: #{format_result(Enum.at(results, 2))}")
  end

  defp format_result({:ok, _}), do: "✅ Operational"
  defp format_result({:error, reason}), do: "❌ Failed (#{inspect(reason)})"
end
