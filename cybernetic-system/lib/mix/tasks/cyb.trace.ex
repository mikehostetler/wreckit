defmodule Mix.Tasks.Cyb.Trace do
  use Mix.Task

  @shortdoc "Run dynamic tracing to capture runtime execution flow"

  @moduledoc """
  Captures dynamic execution traces using :telemetry instrumentation.

  This task starts the DynamicCollector, generates synthetic traffic to trigger
  various code paths, and exports the collected traces to JSON for analysis.

  ## Usage

      mix cyb.trace                           # Use defaults (5s duration, output to dynamic-traces.json)
      mix cyb.trace --duration 10             # Collect for 10 seconds
      mix cyb.trace --output my-traces.json   # Write to custom file
      mix cyb.trace --duration 15 --output traces.json

  ## Examples

      # Quick 5-second trace collection
      mix cyb.trace

      # Longer collection with custom output
      mix cyb.trace --duration 20 --output production-traces.json

  ## Output

  Generates a JSON file with traces grouped by trace_id:

      {
        "summary": {
          "trace_count": 10,
          "total_spans": 75,
          "entry_points_covered": ["amqp", "http"]
        },
        "traces": [
          {
            "trace_id": "abc123...",
            "entry_point": {
              "type": "amqp",
              "module": "Elixir.Cybernetic.VSM.System1.MessageHandler",
              "function": "handle_message",
              "arity": 3
            },
            "spans": [
              {
                "trace_id": "abc123...",
                "span_id": "def456...",
                "parent_span_id": null,
                "module": "Elixir.Cybernetic.VSM.System1.MessageHandler",
                "function": "handle_message",
                "arity": 3,
                "file": "lib/cybernetic/vsm/system1/message_handler.ex",
                "line": 11,
                "timestamp": 1234567890,
                "duration_us": 1234,
                "metadata": {
                  "system": "s1",
                  "operation": "operation"
                }
              }
            ],
            "span_count": 8
          }
        ]
      }

  """

  alias Cybernetic.Archeology.DynamicCollector
  alias Cybernetic.Archeology.TrafficGenerator
  alias Cybernetic.Archeology.MockPublisher

  @default_duration 5
  @default_output "dynamic-traces.json"

  def run(args) do
    # Parse arguments
    {opts, _remaining, _invalid} =
      OptionParser.parse(args,
        switches: [duration: :integer, output: :string],
        aliases: [d: :duration, o: :output]
      )

    duration = Keyword.get(opts, :duration, @default_duration)
    output = Keyword.get(opts, :output, @default_output)

    # Start the application
    Mix.Task.run("app.start")

    IO.puts("\n🔍 Starting Dynamic System Tracing...")
    IO.puts("   Duration: #{duration}s")
    IO.puts("   Output: #{output}")
    IO.puts("")

    # Start MockPublisher if real AMQP publisher is not running
    case Process.whereis(Cybernetic.Core.Transport.AMQP.Publisher) do
      nil ->
        IO.write("   Starting MockPublisher... ")
        case MockPublisher.start_link() do
          {:ok, _pid} ->
            IO.puts("✓")

          {:error, reason} ->
            IO.puts("✗")
            IO.puts("   Warning: Failed to start MockPublisher: #{inspect(reason)}")
        end

      _pid ->
        IO.puts("   ✓ Real AMQP Publisher detected - using existing publisher")
    end

    # Start the collector
    {:ok, _collector_pid} = DynamicCollector.start_link(max_traces: 1000)
    IO.puts("✓ DynamicCollector started")

    # Generate synthetic traffic
    IO.puts("\n📦 Generating synthetic traffic...")

    # Generate HTTP traffic
    IO.write("   HTTP requests... ")
    TrafficGenerator.generate_http_requests()
    IO.puts("✓")

    # Generate AMQP traffic for each VSM system
    IO.write("   AMQP messages (VSM S1-S5)... ")
    TrafficGenerator.generate_amqp_messages()
    IO.puts("✓")

    # Wait for traces to be collected
    IO.puts("\n⏱️  Collecting traces for #{duration}s...")
    Process.sleep(duration * 1000)

    # Export traces
    IO.write("\n💾 Exporting traces... ")
    case DynamicCollector.stop_and_export(output) do
      :ok ->
        IO.puts("✓")

        # Print summary
        case File.read(output) do
          {:ok, json} ->
            case Jason.decode(json) do
              {:ok, data} ->
                summary = Map.get(data, "summary", %{})
                trace_count = Map.get(summary, "trace_count", 0)
                total_spans = Map.get(summary, "total_spans", 0)
                entry_points = Map.get(summary, "entry_points_covered", [])

                IO.puts("\n📊 Trace Summary:")
                IO.puts("   Traces collected: #{trace_count}")
                IO.puts("   Total spans: #{total_spans}")
                IO.puts("   Entry points: #{inspect(entry_points)}")
                IO.puts("\n✅ Tracing complete: #{output}")

              {:error, _reason} ->
                IO.puts("\n✓ Tracing complete: #{output}")
            end

          {:error, _reason} ->
            IO.puts("\n✓ Tracing complete: #{output}")
        end

      {:error, reason} ->
        IO.puts("✗")
        IO.puts("\n❌ Failed to export traces: #{inspect(reason)}")
        System.halt(1)
    end
  end
end
