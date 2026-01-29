defmodule Cybernetic.VSM.System4.LLMBridge do
  @moduledoc """
  Bridges aggregated 'episodes' to an LLM provider and emits actionable outputs.

  Input: episodes from Central Aggregator (via PubSub or direct GenServer call).
  Output: telemetry + message to SOP engine with suggestions.
  """
  use GenServer
  require Logger

  @telemetry [:cybernetic, :s4, :llm]

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @impl true
  def init(opts) do
    provider = Keyword.fetch!(opts, :provider)
    sub = Keyword.get(opts, :subscribe, &__MODULE__.default_subscribe/1)
    sub.(self())
    {:ok, %{provider: provider}}
  end

  # Hook for your Aggregator to send episodes to S4
  @impl true
  def handle_cast({:episode, ep}, state) do
    :telemetry.execute(@telemetry ++ [:request], %{count: 1}, %{episode: meta(ep)})

    case state.provider.analyze_episode(ep, []) do
      {:ok, result} ->
        :telemetry.execute(@telemetry ++ [:response], %{count: 1}, %{
          size: byte_size(result.summary)
        })

        notify_sop_engine(result, ep)
        {:noreply, state}

      {:error, reason} ->
        :telemetry.execute(@telemetry ++ [:error], %{count: 1}, %{reason: inspect(reason)})
        {:noreply, state}
    end
  end

  defp notify_sop_engine(res, ep) do
    # Extract sop_suggestions from either atom or string keys
    sop_suggestions =
      Map.get(res, :sop_suggestions) ||
        Map.get(res, "sop_suggestions") ||
        []

    # Extract recommendations from either atom or string keys
    recommendations =
      Map.get(res, :recommendations) ||
        Map.get(res, "recommendations") ||
        []

    # Only send if we have suggestions
    if is_list(sop_suggestions) and length(sop_suggestions) > 0 do
      payload = %{
        episode: ep,
        sop_suggestions: sop_suggestions,
        recommendations: recommendations
      }

      send(Cybernetic.VSM.System5.SOPEngine, {:s4_suggestions, payload})
    end

    :ok
  end

  def handle_episode_event(_event, _measurements, metadata, pid) do
    send(pid, {:episode, metadata.episode})
  end

  def default_subscribe(pid) do
    # Replace with your real aggregator subscription; minimal safe default:
    :ok =
      :telemetry.attach_many(
        {:s4_bridge, make_ref()},
        [[:cybernetic, :aggregator, :episode]],
        &__MODULE__.handle_episode_event/4,
        pid
      )
  end

  defp meta(ep) do
    Map.take(ep, ["id", "type", "severity", "window_start", "window_end"])
  end
end
