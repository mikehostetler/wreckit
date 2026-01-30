defmodule Cybernetic.Core.Aggregator.CentralAggregator do
  @moduledoc """
  Central Aggregator - The Fact Bus for the Cybernetic system.

  Collects events from telemetry & Goldrush, maintains a rolling window,
  generates facts, detects episodes, and feeds S4 intelligence.

  Facts: Immutable, timestamped observations
  Episodes: Coherent sequences of facts forming a narrative

  Emits:
  - [:cybernetic, :aggregator, :facts] - Raw facts every 5s
  - [:cybernetic, :aggregator, :episode] - Detected episodes
  """
  use GenServer
  require Logger

  @table :cyb_agg_window
  @counts_table :cyb_agg_counts
  # Rolling totals table for O(labels) summarize instead of O(buckets * labels)
  @totals_table :cyb_agg_totals
  @emit_every_ms 5_000
  @window_ms 60_000
  # Bucket counts by second to avoid scanning the full window table on every emit.
  # Note: Window boundaries are bucketed (≤1s approximation).
  @bucket_ms 1_000

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @impl true
  def init(_opts) do
    # P1 Fix: Use :ordered_set for efficient pruning by timestamp
    # Key is {timestamp, unique_ref} to prevent collision when multiple events arrive in same ms
    case :ets.whereis(@table) do
      :undefined ->
        :ets.new(
          @table,
          [:ordered_set, :public, :named_table, read_concurrency: true, write_concurrency: true]
        )

      _ ->
        # Table already exists, clear it
        :ets.delete_all_objects(@table)
    end

    case :ets.whereis(@counts_table) do
      :undefined ->
        :ets.new(
          @counts_table,
          [:ordered_set, :public, :named_table, read_concurrency: true, write_concurrency: true]
        )

      _ ->
        :ets.delete_all_objects(@counts_table)
    end

    # Rolling totals for O(labels) summarize - keyed by {source, severity, labels}
    case :ets.whereis(@totals_table) do
      :undefined ->
        :ets.new(
          @totals_table,
          [:set, :public, :named_table, read_concurrency: true, write_concurrency: true]
        )

      _ ->
        :ets.delete_all_objects(@totals_table)
    end

    attach_sources()
    Process.send_after(self(), :emit, @emit_every_ms)
    {:ok, %{last_emit: now_ms()}}
  end

  @impl true
  def terminate(_reason, _state) do
    # Telemetry handlers are global and must be detached on shutdown to avoid
    # callbacks firing after ETS tables are gone (e.g., in tests or restarts).
    _ = :telemetry.detach({__MODULE__, :goldrush})
    :ok
  end

  defp attach_sources do
    # Detach any existing handlers first
    _ = :telemetry.detach({__MODULE__, :goldrush})

    # Goldrush matches → [:cybernetic, :goldrush, :match]
    result =
      :telemetry.attach_many(
        {__MODULE__, :goldrush},
        [
          [:cybernetic, :goldrush, :match],
          [:cybernetic, :work, :finished],
          [:cybernetic, :work, :failed]
        ],
        &__MODULE__.handle_source/4,
        %{}
      )

    case result do
      :ok ->
        Logger.info("CentralAggregator telemetry handlers attached")

      {:error, reason} ->
        Logger.warning("Failed to attach CentralAggregator handlers: #{inspect(reason)}")
    end
  end

  @doc false
  def handle_source(event, meas, meta, _cfg) do
    entry = %{
      at: System.system_time(:millisecond),
      source: event,
      severity: meta[:severity] || "info",
      labels: meta[:labels] || %{},
      data: meas
    }

    case {:ets.whereis(@table), :ets.whereis(@counts_table)} do
      {:undefined, _} ->
        Logger.warning("CentralAggregator: ETS table #{@table} not found during handle_source")

      {_, :undefined} ->
        Logger.warning(
          "CentralAggregator: ETS table #{@counts_table} not found during handle_source"
        )

        :ets.insert(@table, {{entry.at, make_ref()}, entry})

      {_, _} ->
        # P1 Fix: Use compound key {timestamp, unique_ref} to prevent collision
        :ets.insert(@table, {{entry.at, make_ref()}, entry})

        bucket = div(entry.at, @bucket_ms)
        count_key = {bucket, entry.source, entry.severity, entry.labels}
        totals_key = {entry.source, entry.severity, entry.labels}

        # Increment bucket count
        :ets.update_counter(
          @counts_table,
          count_key,
          {2, 1},
          {count_key, 0}
        )

        # Increment rolling totals for O(labels) summarize
        :ets.update_counter(
          @totals_table,
          totals_key,
          {2, 1},
          {totals_key, 0}
        )
    end
  end

  @impl true
  def handle_info(:emit, state), do: {:noreply, do_emit(state)}

  @impl true
  def handle_continue(:emit, state), do: {:noreply, do_emit(state)}

  @impl true
  def handle_cast(:tick, state), do: {:noreply, do_emit(state)}

  defp do_emit(state) do
    prune()
    facts = summarize()
    :telemetry.execute([:cybernetic, :aggregator, :facts], %{facts: facts}, %{window: "60s"})
    Process.send_after(self(), :emit, @emit_every_ms)
    %{state | last_emit: now_ms()}
  end

  defp prune do
    case :ets.whereis(@table) do
      :undefined ->
        Logger.warning("CentralAggregator: ETS table #{@table} not found during prune")
        :ok

      _ ->
        cutoff = now_ms() - @window_ms
        # P1 Fix: Use ordered_set efficient range deletion with compound key {timestamp, ref}
        # Match spec: key is {timestamp, ref}, select where timestamp < cutoff
        match_spec = [{{{:"$1", :_}, :_}, [{:<, :"$1", cutoff}], [true]}]
        :ets.select_delete(@table, match_spec)

        prune_counts(cutoff)
    end
  end

  defp prune_counts(cutoff_ms) do
    case :ets.whereis(@counts_table) do
      :undefined ->
        Logger.warning(
          "CentralAggregator: ETS table #{@counts_table} not found during prune_counts"
        )

        :ok

      _ ->
        cutoff_bucket = div(cutoff_ms, @bucket_ms)

        # First, subtract pruned bucket counts from totals
        subtract_pruned_from_totals(cutoff_bucket)

        # Then delete the pruned buckets
        match_spec = [{{{:"$1", :_, :_, :_}, :_}, [{:<, :"$1", cutoff_bucket}], [true]}]
        :ets.select_delete(@counts_table, match_spec)
    end
  end

  # Subtract counts from buckets being pruned from rolling totals
  defp subtract_pruned_from_totals(cutoff_bucket) do
    # Match buckets older than cutoff
    match_spec = [{{{:"$1", :"$2", :"$3", :"$4"}, :"$5"}, [{:<, :"$1", cutoff_bucket}], [{{{{:"$2", :"$3", :"$4"}}, :"$5"}}]}]

    case :ets.whereis(@counts_table) do
      :undefined ->
        :ok

      _ ->
        @counts_table
        |> :ets.select(match_spec)
        |> Enum.each(fn {{totals_key}, count} ->
          # Subtract count from totals, with floor at 0
          case :ets.whereis(@totals_table) do
            :undefined ->
              :ok

            _ ->
              :ets.update_counter(
                @totals_table,
                totals_key,
                {2, -count, 0, 0}
              )
          end
        end)
    end
  end

  defp summarize do
    # O(labels) instead of O(buckets * labels) - read directly from rolling totals
    case :ets.whereis(@totals_table) do
      :undefined ->
        Logger.warning("CentralAggregator: ETS table #{@totals_table} not found during summarize")
        []

      _ ->
        @totals_table
        |> :ets.tab2list()
        |> Enum.filter(fn {_key, count} -> count > 0 end)
        |> Enum.map(fn {{src, sev, labels}, count} ->
          %{
            "source" => Enum.join(Enum.map(src, &inspect/1), "/"),
            "severity" => sev,
            "labels" => labels,
            "count" => count
          }
        end)
    end
  end

  defp now_ms, do: System.system_time(:millisecond)
end
