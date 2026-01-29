defmodule Cybernetic.Intelligence.Policy.Pipeline do
  @moduledoc """
  Policy lifecycle pipeline: compile → deploy → evaluate.

  Manages policy storage, versioning, and evaluation with support for:
  - Hot policy updates without restart
  - Version rollback
  - A/B testing with policy variants
  - Audit logging

  ## Performance

  Policies are stored in ETS for lock-free concurrent reads. The GenServer
  handles writes (register, delete, set_version) while evaluations read
  directly from ETS without GenServer involvement.

  ETS tables:
  - `:policy_pipeline_policies` - `{policy_id, version}` → policy AST
  - `:policy_pipeline_active` - `policy_id` → active version number
  - `:policy_pipeline_latest` - `policy_id` → latest version number
  - `:policy_pipeline_stats` - atomic counters for metrics
  """

  use GenServer
  require Logger

  alias Cybernetic.Intelligence.Policy.{DSL, Runtime}

  @type policy_id :: String.t()
  @type version :: pos_integer()

  # ETS table names
  @policies_table :policy_pipeline_policies
  @active_table :policy_pipeline_active
  @latest_table :policy_pipeline_latest
  @stats_table :policy_pipeline_stats

  # Public API

  @doc """
  Start the policy pipeline GenServer.
  """
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Register a policy from DSL source.
  """
  @spec register(String.t(), String.t(), keyword()) :: {:ok, version()} | {:error, term()}
  def register(policy_id, source, opts \\ []) when is_binary(policy_id) and is_binary(source) do
    GenServer.call(__MODULE__, {:register, policy_id, source, opts})
  end

  @doc """
  Register a policy from rules list.
  """
  @spec register_rules(String.t(), [tuple()], keyword()) :: {:ok, version()} | {:error, term()}
  def register_rules(policy_id, rules, opts \\ []) when is_binary(policy_id) and is_list(rules) do
    GenServer.call(__MODULE__, {:register_rules, policy_id, rules, opts})
  end

  @doc """
  Evaluate a policy.

  Reads directly from ETS - no GenServer call, fully concurrent.
  """
  @spec evaluate(String.t(), Runtime.eval_context(), keyword()) :: Runtime.result()
  def evaluate(policy_id, eval_context, opts \\ []) when is_binary(policy_id) do
    start_time = System.monotonic_time(:microsecond)

    result =
      case get_policy_from_ets(policy_id) do
        {:ok, policy} ->
          Runtime.evaluate(policy, eval_context, opts)

        {:error, _} = error ->
          error
      end

    elapsed_us = System.monotonic_time(:microsecond) - start_time
    update_stats_atomic(result, elapsed_us)

    result
  end

  @doc """
  Evaluate multiple policies.

  Reads directly from ETS - no GenServer call, fully concurrent.
  """
  @spec evaluate_all([String.t()], Runtime.eval_context(), keyword()) :: Runtime.result()
  def evaluate_all(policy_ids, eval_context, opts \\ []) when is_list(policy_ids) do
    start_time = System.monotonic_time(:microsecond)

    policies =
      Enum.reduce_while(policy_ids, [], fn policy_id, acc ->
        case get_policy_from_ets(policy_id) do
          {:ok, policy} -> {:cont, [policy | acc]}
          {:error, _} = error -> {:halt, error}
        end
      end)

    result =
      case policies do
        {:error, _} = error ->
          error

        policies when is_list(policies) ->
          Runtime.evaluate_all(Enum.reverse(policies), eval_context, opts)
      end

    elapsed_us = System.monotonic_time(:microsecond) - start_time
    update_stats_atomic(result, elapsed_us)

    result
  end

  @doc """
  Get active version of a policy.
  """
  @spec get_active_version(String.t()) :: {:ok, version()} | {:error, :not_found}
  def get_active_version(policy_id) when is_binary(policy_id) do
    case :ets.lookup(@active_table, policy_id) do
      [{^policy_id, version}] -> {:ok, version}
      [] -> {:error, :not_found}
    end
  end

  @doc """
  Set active version (rollback/rollforward).
  """
  @spec set_active_version(String.t(), version()) :: :ok | {:error, term()}
  def set_active_version(policy_id, version) when is_binary(policy_id) and is_integer(version) do
    GenServer.call(__MODULE__, {:set_active_version, policy_id, version})
  end

  @doc """
  List all policy versions.
  """
  @spec list_versions(String.t()) :: [version()]
  def list_versions(policy_id) when is_binary(policy_id) do
    :ets.match_object(@policies_table, {{policy_id, :_}, :_})
    |> Enum.map(fn {{^policy_id, version}, _policy} -> version end)
    |> Enum.sort()
  rescue
    _ -> []
  end

  @doc """
  Delete a policy and all versions.
  """
  @spec delete(String.t()) :: :ok
  def delete(policy_id) when is_binary(policy_id) do
    GenServer.call(__MODULE__, {:delete, policy_id})
  end

  @doc """
  Get pipeline statistics.
  """
  @spec stats() :: map()
  def stats do
    evaluations = get_counter(:evaluations)
    allows = get_counter(:allows)
    denies = get_counter(:denies)
    errors = get_counter(:errors)
    total_time_us = get_counter(:total_time_us)

    avg_time =
      if evaluations > 0 do
        total_time_us / evaluations
      else
        0.0
      end

    %{
      evaluations: evaluations,
      allows: allows,
      denies: denies,
      errors: errors,
      avg_eval_time_us: avg_time,
      wasm_available: Runtime.wasm_available?()
    }
  end

  @doc """
  List all registered policy IDs.
  """
  @spec list_policies() :: [String.t()]
  def list_policies do
    :ets.tab2list(@active_table)
    |> Enum.map(fn {policy_id, _version} -> policy_id end)
  rescue
    _ -> []
  end

  # GenServer callbacks

  @impl true
  def init(_opts) do
    # Create ETS tables for concurrent reads
    # :protected = GenServer writes, anyone reads
    :ets.new(@policies_table, [
      :set,
      :protected,
      :named_table,
      read_concurrency: true
    ])

    :ets.new(@active_table, [
      :set,
      :protected,
      :named_table,
      read_concurrency: true
    ])

    :ets.new(@latest_table, [
      :set,
      :protected,
      :named_table,
      read_concurrency: true
    ])

    # Stats table uses :public + write_concurrency for atomic updates
    :ets.new(@stats_table, [
      :set,
      :public,
      :named_table,
      write_concurrency: true
    ])

    # Initialize stat counters
    :ets.insert(@stats_table, {:evaluations, 0})
    :ets.insert(@stats_table, {:allows, 0})
    :ets.insert(@stats_table, {:denies, 0})
    :ets.insert(@stats_table, {:errors, 0})
    :ets.insert(@stats_table, {:total_time_us, 0})

    Logger.info("Policy pipeline started")
    {:ok, %{}}
  end

  @impl true
  def handle_call({:register, policy_id, source, opts}, _from, state) do
    case DSL.parse(source, Keyword.merge(opts, name: policy_id)) do
      {:ok, policy} ->
        case DSL.validate(policy) do
          :ok ->
            version = add_policy_to_ets(policy_id, policy)
            Logger.info("Policy registered: #{policy_id} v#{version}")
            {:reply, {:ok, version}, state}

          {:error, reason} ->
            {:reply, {:error, {:validation_failed, reason}}, state}
        end

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call({:register_rules, policy_id, rules, opts}, _from, state) do
    case DSL.from_rules(rules, Keyword.merge(opts, name: policy_id)) do
      {:ok, policy} ->
        case DSL.validate(policy) do
          :ok ->
            version = add_policy_to_ets(policy_id, policy)
            Logger.info("Policy registered from rules: #{policy_id} v#{version}")
            {:reply, {:ok, version}, state}

          {:error, reason} ->
            {:reply, {:error, {:validation_failed, reason}}, state}
        end

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call({:set_active_version, policy_id, version}, _from, state) do
    # Check if version exists
    case :ets.lookup(@policies_table, {policy_id, version}) do
      [{_key, _policy}] ->
        :ets.insert(@active_table, {policy_id, version})
        Logger.info("Policy #{policy_id} active version set to v#{version}")
        {:reply, :ok, state}

      [] ->
        {:reply, {:error, :version_not_found}, state}
    end
  end

  @impl true
  def handle_call({:delete, policy_id}, _from, state) do
    # Delete all versions
    :ets.match_delete(@policies_table, {{policy_id, :_}, :_})
    # Delete active version entry
    :ets.delete(@active_table, policy_id)
    # Delete latest version entry
    :ets.delete(@latest_table, policy_id)
    Logger.info("Policy deleted: #{policy_id}")
    {:reply, :ok, state}
  end

  # Private helpers - ETS operations

  defp get_policy_from_ets(policy_id) do
    case :ets.lookup(@active_table, policy_id) do
      [{^policy_id, version}] ->
        case :ets.lookup(@policies_table, {policy_id, version}) do
          [{_key, policy}] -> {:ok, policy}
          [] -> {:error, :version_not_found}
        end

      [] ->
        {:error, :policy_not_found}
    end
  end

  defp add_policy_to_ets(policy_id, policy) do
    latest_version =
      case :ets.lookup(@latest_table, policy_id) do
        [{^policy_id, v}] when is_integer(v) -> v
        [] -> 0
      end

    next_version = latest_version + 1

    # Add policy with version info
    policy_with_version = Map.put(policy, :version, next_version)
    :ets.insert(@policies_table, {{policy_id, next_version}, policy_with_version})

    # Track latest version independently from active version (supports rollback)
    :ets.insert(@latest_table, {policy_id, next_version})

    # Set as active version
    :ets.insert(@active_table, {policy_id, next_version})

    next_version
  end

  defp update_stats_atomic(result, elapsed_us) do
    # Atomic counter updates - no locking needed
    :ets.update_counter(@stats_table, :evaluations, 1)
    :ets.update_counter(@stats_table, :total_time_us, elapsed_us)

    case result do
      :allow -> :ets.update_counter(@stats_table, :allows, 1)
      :deny -> :ets.update_counter(@stats_table, :denies, 1)
      {:error, _} -> :ets.update_counter(@stats_table, :errors, 1)
    end
  rescue
    # ETS table might not exist in tests
    ArgumentError -> :ok
  end

  defp get_counter(key) do
    case :ets.lookup(@stats_table, key) do
      [{^key, value}] -> value
      [] -> 0
    end
  rescue
    ArgumentError -> 0
  end
end
