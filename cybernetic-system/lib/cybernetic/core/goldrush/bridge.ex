defmodule Cybernetic.Core.Goldrush.Bridge do
  @moduledoc """
  Bridge between Elixir telemetry and Goldrush reactive streams.
  Integrates develop-elixir branch features (GreEx/GoldrushEx).
  """
  use GenServer
  require Logger

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(_opts) do
    # Attach telemetry handlers
    attach_telemetry_handlers()

    # Setup Goldrush patterns after init completes
    Process.send_after(self(), :setup_patterns, 100)

    {:ok,
     %{
       patterns: %{},
       handlers: %{},
       stats: %{events: 0, patterns_matched: 0}
     }}
  end

  defp attach_telemetry_handlers do
    events = [
      [:cybernetic, :agent, :event],
      [:cybernetic, :bus, :pressure],
      [:cybernetic, :vsm, :signal],
      [:cybernetic, :mcp, :tool, :invocation]
    ]

    :telemetry.attach_many(
      "cybernetic-goldrush-bridge",
      events,
      &__MODULE__.handle_telemetry_event/4,
      %{}
    )

    Logger.info("Goldrush bridge attached to #{length(events)} telemetry events")
  end

  def handle_telemetry_event(event_name, measurements, metadata, _config) do
    GenServer.cast(__MODULE__, {:telemetry_event, event_name, measurements, metadata})
  end

  def handle_info(:setup_patterns, state) do
    patterns = setup_goldrush_patterns()
    {:noreply, %{state | patterns: patterns}}
  end

  def handle_cast({:telemetry_event, event_name, measurements, metadata}, state) do
    # Convert to Goldrush event format
    event = build_goldrush_event(event_name, measurements, metadata)

    # Process through patterns
    matched = process_event(event, state.patterns)

    new_state =
      state
      |> update_in([:stats, :events], &(&1 + 1))
      |> update_in([:stats, :patterns_matched], &(&1 + matched))

    {:noreply, new_state}
  end

  defp build_goldrush_event(event_name, measurements, metadata) do
    %{
      event: event_name,
      measurements: measurements,
      metadata: metadata,
      timestamp: System.system_time(:millisecond),
      node: node()
    }
  end

  defp process_event(event, patterns) do
    # Count how many patterns matched
    patterns
    |> Enum.filter(fn {_name, pattern} ->
      match_pattern?(event, pattern)
    end)
    |> length()
  end

  defp match_pattern?(event, pattern) do
    # Simple pattern matching - enhance with GreEx when available
    case pattern do
      %{event: event_pattern} ->
        event_pattern == event.event

      %{match_all: conditions} ->
        Enum.all?(conditions, fn condition ->
          check_condition(event, condition)
        end)

      _ ->
        false
    end
  end

  defp check_condition(event, {:eq, field, value}) do
    get_in(event, [field]) == value
  end

  defp check_condition(event, {:gt, field, value}) do
    case get_in(event, [field]) do
      nil -> false
      field_value -> field_value > value
    end
  end

  defp check_condition(_, _), do: false

  defp setup_goldrush_patterns do
    patterns = %{
      "security_anomaly" => %{
        match_all: [
          {:eq, :event, [:cybernetic, :agent, :event]},
          {:gt, [:metadata, :failures], 3}
        ],
        action: fn event ->
          # Emit algedonic pain signal to S3
          emit_algedonic_signal(:pain, :security, event)
        end
      },
      "high_latency" => %{
        match_all: [
          {:gt, [:measurements, :latency], 1000}
        ],
        action: fn event ->
          emit_algedonic_signal(:pain, :performance, event)
        end
      },
      "success_flow" => %{
        match_all: [
          {:eq, [:metadata, :status], :success}
        ],
        action: fn event ->
          emit_algedonic_signal(:pleasure, :achievement, event)
        end
      }
    }

    Logger.info("Registered #{map_size(patterns)} Goldrush patterns")
    patterns
  end

  def register_pattern(name, pattern) do
    GenServer.call(__MODULE__, {:register_pattern, name, pattern})
  end

  def handle_call({:register_pattern, name, pattern}, _from, state) do
    new_state = put_in(state.patterns[name], pattern)
    {:reply, :ok, new_state}
  end

  defp emit_algedonic_signal(type, category, event) do
    # Forward to S3/S4 for processing
    signal = %{
      type: type,
      category: category,
      intensity: calculate_intensity(type, event),
      source: event,
      timestamp: System.system_time(:millisecond)
    }

    # Send to Goldrush Telemetry Algedonic plugin
    GenServer.cast(
      Cybernetic.Core.Goldrush.Plugins.TelemetryAlgedonic,
      {:algedonic_signal, signal}
    )

    Logger.debug("Emitted #{type} signal for #{category}")
  end

  defp calculate_intensity(:pain, event) do
    # Calculate pain intensity based on severity
    case event do
      %{metadata: %{failures: f}} when f > 10 -> 1.0
      %{metadata: %{failures: f}} when f > 5 -> 0.7
      %{measurements: %{latency: l}} when l > 5000 -> 0.9
      %{measurements: %{latency: l}} when l > 2000 -> 0.6
      _ -> 0.3
    end
  end

  defp calculate_intensity(:pleasure, _event) do
    # Pleasure is generally lower intensity
    0.4
  end
end
