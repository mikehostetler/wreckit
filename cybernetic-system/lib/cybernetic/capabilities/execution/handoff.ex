defmodule Cybernetic.Capabilities.Execution.Handoff do
  @moduledoc """
  Execution handoff protocol for transferring work between VSM systems.

  Provides reliable handoff with context propagation, OpenTelemetry traces,
  and rollback capabilities for failed executions.

  ## Handoff Flow

  1. **Initiate** - Source system creates handoff with context
  2. **Accept** - Target system accepts the handoff
  3. **Execute** - Target system processes the work
  4. **Complete/Rollback** - Finalize or revert the handoff

  ## Example

      # S4 hands off to S2 for coordination
      {:ok, handoff} = Handoff.initiate(:s4, :s2, %{
        episode_id: "...",
        analysis: %{...}
      })

      # S2 accepts and begins work
      :ok = Handoff.accept(handoff.id)

      # On success
      {:ok, _} = Handoff.complete(handoff.id, %{result: "..."})

      # On failure
      {:ok, _} = Handoff.rollback(handoff.id, "Processing failed")
  """
  use GenServer

  require Logger

  alias Cybernetic.Capabilities.Validation

  @type handoff_state ::
          :initiated | :accepted | :executing | :completed | :rolled_back | :failed

  @type handoff :: %{
          id: String.t(),
          from_system: atom(),
          to_system: atom(),
          context: map(),
          state: handoff_state(),
          trace_id: String.t(),
          span_id: String.t(),
          result: term(),
          error: term(),
          initiated_at: DateTime.t(),
          accepted_at: DateTime.t() | nil,
          completed_at: DateTime.t() | nil
        }

  @valid_systems [:s1, :s2, :s3, :s4, :s5]
  @telemetry [:cybernetic, :capabilities, :execution]

  # Client API

  @doc "Start the handoff server"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Initiate a handoff from one system to another"
  @spec initiate(atom(), atom(), map()) :: {:ok, handoff()} | {:error, term()}
  def initiate(from_system, to_system, context) do
    GenServer.call(__MODULE__, {:initiate, from_system, to_system, context})
  end

  @doc "Accept an initiated handoff"
  @spec accept(String.t()) :: :ok | {:error, term()}
  def accept(handoff_id) do
    GenServer.call(__MODULE__, {:accept, handoff_id})
  end

  @doc "Mark handoff execution as started"
  @spec start_execution(String.t()) :: :ok | {:error, term()}
  def start_execution(handoff_id) do
    GenServer.call(__MODULE__, {:start_execution, handoff_id})
  end

  @doc "Complete a handoff with a result"
  @spec complete(String.t(), term()) :: {:ok, handoff()} | {:error, term()}
  def complete(handoff_id, result) do
    GenServer.call(__MODULE__, {:complete, handoff_id, result})
  end

  @doc "Rollback a handoff due to failure"
  @spec rollback(String.t(), term()) :: {:ok, handoff()} | {:error, term()}
  def rollback(handoff_id, reason) do
    GenServer.call(__MODULE__, {:rollback, handoff_id, reason})
  end

  @doc "Get handoff by ID"
  @spec get(String.t()) :: {:ok, handoff()} | {:error, :not_found}
  def get(handoff_id) do
    GenServer.call(__MODULE__, {:get, handoff_id})
  end

  @doc "List handoffs with optional filters"
  @spec list(keyword()) :: [handoff()]
  def list(opts \\ []) do
    GenServer.call(__MODULE__, {:list, opts})
  end

  @doc "Get handoff statistics"
  @spec stats() :: map()
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    Logger.info("Handoff execution server starting")

    state = %{
      handoffs: %{},
      timeout_ms: Keyword.get(opts, :timeout_ms, :timer.minutes(5)),
      stats: %{
        initiated: 0,
        completed: 0,
        rolled_back: 0,
        failed: 0
      }
    }

    schedule_timeout_check()

    {:ok, state}
  end

  @impl true
  def handle_call({:initiate, from, to, context}, _from, state) do
    start_time = System.monotonic_time(:millisecond)

    with :ok <- validate_system(from),
         :ok <- validate_system(to),
         :ok <- Validation.validate_context_size(context) do
      {trace_id, span_id} = generate_trace_ids()

      handoff = %{
        id: UUID.uuid4(),
        from_system: from,
        to_system: to,
        context: context,
        state: :initiated,
        trace_id: trace_id,
        span_id: span_id,
        result: nil,
        error: nil,
        initiated_at: DateTime.utc_now(),
        accepted_at: nil,
        completed_at: nil
      }

      new_state = %{
        state
        | handoffs: Map.put(state.handoffs, handoff.id, handoff),
          stats: Map.update!(state.stats, :initiated, &(&1 + 1))
      }

      emit_telemetry(:initiate, start_time, %{
        handoff_id: handoff.id,
        from: from,
        to: to
      })

      Logger.info("Handoff initiated",
        handoff_id: handoff.id,
        from: from,
        to: to,
        trace_id: trace_id
      )

      {:reply, {:ok, handoff}, new_state}
    else
      {:error, _} = error -> {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:accept, handoff_id}, _from, state) do
    start_time = System.monotonic_time(:millisecond)

    case Map.get(state.handoffs, handoff_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      %{state: :initiated} = handoff ->
        updated = %{
          handoff
          | state: :accepted,
            accepted_at: DateTime.utc_now()
        }

        new_state = put_in(state, [:handoffs, handoff_id], updated)

        emit_telemetry(:accept, start_time, %{handoff_id: handoff_id})
        Logger.debug("Handoff accepted", handoff_id: handoff_id)

        {:reply, :ok, new_state}

      %{state: current_state} ->
        {:reply, {:error, {:invalid_state, current_state}}, state}
    end
  end

  @impl true
  def handle_call({:start_execution, handoff_id}, _from, state) do
    case Map.get(state.handoffs, handoff_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      %{state: :accepted} = handoff ->
        updated = %{handoff | state: :executing}
        new_state = put_in(state, [:handoffs, handoff_id], updated)

        Logger.debug("Handoff executing", handoff_id: handoff_id)
        {:reply, :ok, new_state}

      %{state: current_state} ->
        {:reply, {:error, {:invalid_state, current_state}}, state}
    end
  end

  @impl true
  def handle_call({:complete, handoff_id, result}, _from, state) do
    start_time = System.monotonic_time(:millisecond)

    case Map.get(state.handoffs, handoff_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      %{state: handoff_state} = handoff when handoff_state in [:accepted, :executing] ->
        updated = %{
          handoff
          | state: :completed,
            result: result,
            completed_at: DateTime.utc_now()
        }

        new_state = %{
          state
          | handoffs: Map.put(state.handoffs, handoff_id, updated),
            stats: Map.update!(state.stats, :completed, &(&1 + 1))
        }

        emit_telemetry(:complete, start_time, %{handoff_id: handoff_id})

        Logger.info("Handoff completed",
          handoff_id: handoff_id,
          trace_id: handoff.trace_id
        )

        {:reply, {:ok, updated}, new_state}

      %{state: current_state} ->
        {:reply, {:error, {:invalid_state, current_state}}, state}
    end
  end

  @impl true
  def handle_call({:rollback, handoff_id, reason}, _from, state) do
    start_time = System.monotonic_time(:millisecond)

    case Map.get(state.handoffs, handoff_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      %{state: handoff_state} = handoff
      when handoff_state in [:initiated, :accepted, :executing] ->
        updated = %{
          handoff
          | state: :rolled_back,
            error: reason,
            completed_at: DateTime.utc_now()
        }

        new_state = %{
          state
          | handoffs: Map.put(state.handoffs, handoff_id, updated),
            stats: Map.update!(state.stats, :rolled_back, &(&1 + 1))
        }

        emit_telemetry(:rollback, start_time, %{
          handoff_id: handoff_id,
          reason: reason
        })

        Logger.warning("Handoff rolled back",
          handoff_id: handoff_id,
          reason: reason,
          trace_id: handoff.trace_id
        )

        {:reply, {:ok, updated}, new_state}

      %{state: current_state} ->
        {:reply, {:error, {:invalid_state, current_state}}, state}
    end
  end

  @impl true
  def handle_call({:get, handoff_id}, _from, state) do
    case Map.get(state.handoffs, handoff_id) do
      nil -> {:reply, {:error, :not_found}, state}
      handoff -> {:reply, {:ok, handoff}, state}
    end
  end

  @impl true
  def handle_call({:list, opts}, _from, state) do
    from_filter = Keyword.get(opts, :from)
    to_filter = Keyword.get(opts, :to)
    state_filter = Keyword.get(opts, :state)

    handoffs =
      state.handoffs
      |> Map.values()
      |> Enum.filter(fn h ->
        (is_nil(from_filter) or h.from_system == from_filter) and
          (is_nil(to_filter) or h.to_system == to_filter) and
          (is_nil(state_filter) or h.state == state_filter)
      end)
      |> Enum.sort_by(& &1.initiated_at, {:desc, DateTime})

    {:reply, handoffs, state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      Map.merge(state.stats, %{
        active:
          Enum.count(state.handoffs, fn {_, h} ->
            h.state in [:initiated, :accepted, :executing]
          end),
        total: map_size(state.handoffs)
      })

    {:reply, stats, state}
  end

  @impl true
  def handle_info(:check_timeouts, state) do
    now = DateTime.utc_now()
    timeout_threshold = DateTime.add(now, -state.timeout_ms, :millisecond)
    retention_period = :timer.hours(24)
    retention_threshold = DateTime.add(now, -retention_period, :millisecond)

    # Mark timed-out active handoffs as failed
    timed_out =
      state.handoffs
      |> Enum.filter(fn {_id, h} ->
        h.state in [:initiated, :accepted, :executing] and
          DateTime.compare(h.initiated_at, timeout_threshold) == :lt
      end)
      |> Enum.map(fn {id, _h} -> id end)

    handoffs_after_timeout =
      Enum.reduce(timed_out, state.handoffs, fn id, acc ->
        handoff = Map.get(acc, id)

        Map.put(acc, id, %{
          handoff
          | state: :failed,
            error: :timeout,
            completed_at: now
        })
      end)

    # Actually delete old completed/failed/rolled_back handoffs (>24h)
    deletable_ids =
      handoffs_after_timeout
      |> Enum.filter(fn {_id, h} ->
        h.state in [:completed, :failed, :rolled_back] and
          h.completed_at != nil and
          DateTime.compare(h.completed_at, retention_threshold) == :lt
      end)
      |> Enum.map(fn {id, _h} -> id end)

    new_handoffs = Map.drop(handoffs_after_timeout, deletable_ids)

    new_stats =
      if length(timed_out) > 0 do
        Logger.warning("Handoffs timed out", count: length(timed_out))
        Map.update!(state.stats, :failed, &(&1 + length(timed_out)))
      else
        state.stats
      end

    if length(deletable_ids) > 0 do
      Logger.info("Handoff cleanup",
        deleted: length(deletable_ids),
        remaining: map_size(new_handoffs)
      )
    end

    schedule_timeout_check()

    {:noreply, %{state | handoffs: new_handoffs, stats: new_stats}}
  end

  # Private Functions

  @spec validate_system(atom()) :: :ok | {:error, :invalid_system}
  defp validate_system(system) when system in @valid_systems, do: :ok
  defp validate_system(_), do: {:error, :invalid_system}

  @spec generate_trace_ids() :: {String.t(), String.t()}
  defp generate_trace_ids do
    trace_id = :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
    span_id = :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)
    {trace_id, span_id}
  end

  @spec schedule_timeout_check() :: reference()
  defp schedule_timeout_check do
    Process.send_after(self(), :check_timeouts, :timer.seconds(30))
  end

  @spec emit_telemetry(atom(), integer(), map()) :: :ok
  defp emit_telemetry(event, start_time, metadata) do
    duration = System.monotonic_time(:millisecond) - start_time

    :telemetry.execute(
      @telemetry ++ [event],
      %{duration: duration},
      metadata
    )
  end
end
