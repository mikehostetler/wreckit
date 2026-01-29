defmodule Cybernetic.Core.Goldrush.Plugins.LatencyToAlgedonic do
  @moduledoc """
  Converts latency measurements into algedonic signals (pain/pleasure).
  High latency triggers pain signals, low latency triggers pleasure signals.
  """

  @behaviour Cybernetic.Core.Goldrush.Plugins.Behaviour

  # ms - triggers pain signal
  @pain_threshold 250
  # ms - triggers pleasure signal
  @pleasure_threshold 40

  @impl true
  def capabilities do
    %{
      consumes: [:telemetry],
      produces: [:algedonic]
    }
  end

  @impl true
  def process(%{event: [:cybernetic, :work, :finished], meas: %{duration: dur}} = msg)
      when is_number(dur) do
    cond do
      dur >= @pain_threshold ->
        {:halt, Map.put(msg, :severity, :pain)}

      dur <= @pleasure_threshold ->
        {:halt, Map.put(msg, :severity, :pleasure)}

      true ->
        {:ok, msg}
    end
  end

  def process(msg), do: {:ok, msg}
end
