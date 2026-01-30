defmodule Cybernetic.VSM.System5.SOPEngine do
  @moduledoc """
  Append-only SOP registry + executor.

  Data model (ETS):
    :sop_store      -> {sop_id, current_version, meta}
    :sop_versions   -> {sop_id, version, sop_map, inserted_at}
    :sop_exec_log   -> {exec_id, sop_id, version, input, result, ts}
  """
  use GenServer
  require Logger

  @telemetry [:cybernetic, :s5, :sop]

  # Public API
  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  def create(attrs), do: GenServer.call(__MODULE__, {:create, attrs})
  def update(sop_id, patch), do: GenServer.call(__MODULE__, {:update, sop_id, patch})
  def get(sop_id), do: GenServer.call(__MODULE__, {:get, sop_id})
  def history(sop_id), do: GenServer.call(__MODULE__, {:history, sop_id})
  def execute(sop_id, input), do: GenServer.call(__MODULE__, {:execute, sop_id, input})

  @impl true
  def init(_opts) do
    # P1 Security: ETS tables are private to the SOPEngine process.
    # All access goes through the GenServer API.
    :ets.new(:sop_store, [:named_table, :private, read_concurrency: true])
    :ets.new(:sop_versions, [:named_table, :private, read_concurrency: true])
    :ets.new(:sop_exec_log, [:named_table, :private, read_concurrency: true])
    {:ok, %{}}
  end

  # Input from S4 bridge
  @impl true
  def handle_info({:s4_suggestions, %{sop_suggestions: list} = payload}, state) do
    Enum.each(list, fn sop_attrs ->
      _ = create(Map.merge(%{"source" => "s4"}, sop_attrs))
    end)

    :telemetry.execute(@telemetry ++ [:create], %{count: length(list)}, %{
      source: :s4,
      episode: payload.episode
    })

    {:noreply, state}
  end

  @impl true
  def handle_call({:create, attrs}, _from, state) do
    sop_id = attrs["id"] || generate_id()
    version = 1
    now = System.system_time(:millisecond)
    :ets.insert(:sop_store, {sop_id, version, Map.drop(attrs, ["steps"])})
    :ets.insert(:sop_versions, {sop_id, version, attrs, now})
    {:reply, {:ok, %{id: sop_id, version: version}}, state}
  end

  def handle_call({:update, sop_id, patch}, _from, state) do
    case :ets.lookup(:sop_store, sop_id) do
      [{^sop_id, cur, meta}] ->
        newv = cur + 1
        now = System.system_time(:millisecond)
        merged = Map.merge(load_version!(sop_id, cur), patch)
        :ets.insert(:sop_versions, {sop_id, newv, merged, now})
        :ets.insert(:sop_store, {sop_id, newv, meta})
        :telemetry.execute(@telemetry ++ [:create], %{count: 1}, %{op: :update, id: sop_id})
        {:reply, {:ok, %{id: sop_id, version: newv}}, state}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  def handle_call({:get, sop_id}, _from, state) do
    reply =
      case :ets.lookup(:sop_store, sop_id) do
        [{^sop_id, v, _}] -> {:ok, load_version!(sop_id, v)}
        [] -> {:error, :not_found}
      end

    {:reply, reply, state}
  end

  def handle_call({:history, sop_id}, _from, state) do
    rows =
      :ets.match_object(:sop_versions, {sop_id, :_, :_, :_})
      |> Enum.sort_by(fn {_, v, _, _} -> v end)

    {:reply, {:ok, rows}, state}
  end

  def handle_call({:execute, sop_id, input}, _from, state) do
    with [{^sop_id, v, _}] <- :ets.lookup(:sop_store, sop_id),
         sop <- load_version!(sop_id, v),
         {:ok, result} <- run_steps(sop["steps"] || [], input) do
      exec_id = generate_id()

      :ets.insert(
        :sop_exec_log,
        {exec_id, sop_id, v, input, result, System.system_time(:millisecond)}
      )

      :telemetry.execute(@telemetry ++ [:execute], %{count: 1}, %{id: sop_id, version: v})
      {:reply, {:ok, %{exec_id: exec_id, result: result}}, state}
    else
      [] ->
        {:reply, {:error, :not_found}, state}

      {:error, reason} ->
        :telemetry.execute(@telemetry ++ [:error], %{count: 1}, %{
          reason: inspect(reason),
          id: sop_id
        })

        {:reply, {:error, reason}, state}
    end
  end

  defp load_version!(sop_id, v) do
    case :ets.match_object(:sop_versions, {sop_id, v, :_, :_}) do
      [{^sop_id, ^v, sop, _}] -> sop
      [] -> raise "Version not found: #{sop_id}@#{v}"
    end
  end

  # naive, replace with proper action runners (AMQP, HTTP, function, etc.)
  defp run_steps([], input), do: {:ok, input}

  defp run_steps([%{"action" => "tag", "key" => k, "value" => val} | rest], input),
    do: run_steps(rest, Map.put(input, k, val))

  defp run_steps([unknown | _], _), do: {:error, {:unknown_step, unknown}}

  defp generate_id do
    :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
  end
end
