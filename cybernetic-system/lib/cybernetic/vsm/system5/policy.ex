defmodule Cybernetic.VSM.System5.Policy do
  use GenServer

  @moduledoc """
  S5: Identity/goal setting + meta-system spawning.
  """

  def start_link(_opts \\ []), do: GenServer.start_link(__MODULE__, %{}, name: __MODULE__)

  def init(state) do
    {:ok,
     state
     |> Map.put(:identity, %{name: "Cybernetic"})
     |> Map.put(:policies, %{})
     |> Map.put(:policy_history, %{})}
  end

  @doc "Store a policy with versioning"
  def put_policy(id, policy), do: GenServer.call(__MODULE__, {:put_policy, id, policy})

  @doc "Get current policy version"
  def get_policy(id), do: GenServer.call(__MODULE__, {:get_policy, id})

  @doc "Get diff between two policy versions"
  def diff_policy(id, v1, v2), do: GenServer.call(__MODULE__, {:diff_policy, id, v1, v2})

  # Handle transport messages from in-memory transport
  def handle_cast({:transport_message, message, opts}, state) do
    # Route message to the appropriate message handler
    operation = Map.get(message, "operation", "unknown")
    meta = Keyword.get(opts, :meta, %{})

    # Process the message through the message handler
    Cybernetic.VSM.System5.MessageHandler.handle_message(operation, message, meta)

    {:noreply, state}
  end

  # Test interface - routes messages through the message handler
  def handle_message(message, meta \\ %{}) do
    operation = Map.get(message, :operation, "unknown")
    Cybernetic.VSM.System5.MessageHandler.handle_message(operation, message, meta)
  end

  def handle_call({:put_policy, id, policy}, _from, state) do
    version = get_in(state.policies, [id, :version]) || 0
    new_version = version + 1

    versioned_policy =
      Map.merge(policy, %{
        version: new_version,
        timestamp: System.system_time(:millisecond),
        id: id
      })

    state =
      state
      |> put_in([:policies, id], versioned_policy)
      |> update_in([:policy_history, id], fn history ->
        # Keep last 10 versions
        [versioned_policy | history || []] |> Enum.take(10)
      end)

    {:reply, {:ok, versioned_policy}, state}
  end

  def handle_call({:get_policy, id}, _from, state) do
    {:reply, Map.get(state.policies, id), state}
  end

  def handle_call({:diff_policy, id, v1, v2}, _from, state) do
    history = Map.get(state.policy_history, id, [])
    p1 = Enum.find(history, &(&1[:version] == v1))
    p2 = Enum.find(history, &(&1[:version] == v2))

    diff =
      case {p1, p2} do
        {nil, _} -> {:error, "Version #{v1} not found"}
        {_, nil} -> {:error, "Version #{v2} not found"}
        {policy1, policy2} -> compute_diff(policy1, policy2)
      end

    {:reply, diff, state}
  end

  defp compute_diff(p1, p2) do
    keys = (Map.keys(p1) ++ Map.keys(p2)) |> Enum.uniq()

    Enum.reduce(keys, %{added: %{}, removed: %{}, changed: %{}}, fn key, acc ->
      case {Map.get(p1, key), Map.get(p2, key)} do
        {nil, value} -> put_in(acc.added[key], value)
        {value, nil} -> put_in(acc.removed[key], value)
        {v1, v2} when v1 != v2 -> put_in(acc.changed[key], {v1, v2})
        _ -> acc
      end
    end)
  end
end
