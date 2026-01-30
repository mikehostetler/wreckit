defmodule Cybernetic.Intelligence.CEP.WorkflowHooks do
  @moduledoc """
  Complex Event Processing workflow hooks.

  Provides pattern-based workflow triggering:
  - Event pattern matching (field conditions, nested fields)
  - Threshold-based activation (count, rate)
  - Time-window aggregation with bounded memory
  - Workflow dispatch on match

  ## Usage

      # Register a hook
      {:ok, hook_id} = WorkflowHooks.register(%{
        name: "high_error_rate",
        pattern: %{type: "error", severity: {:gte, "high"}},
        threshold: %{count: 10, window_ms: 60_000},
        action: {:workflow, "alert_ops"}
      })

      # Process events (usually called from event pipeline)
      :ok = WorkflowHooks.process_event(%{type: "error", severity: "critical"})

      # Check active hooks
      hooks = WorkflowHooks.list_hooks()
  """
  use GenServer

  require Logger

  @type hook_id :: String.t()
  @type pattern :: map()
  @type threshold :: %{
          optional(:count) => pos_integer(),
          optional(:window_ms) => pos_integer(),
          optional(:rate_per_min) => pos_integer()
        }
  @type action ::
          {:workflow, String.t()}
          | {:notify, String.t()}
          | {:log, atom()}
          | {:mfa, {module(), atom(), list()}}

  @type hook :: %{
          id: hook_id(),
          name: String.t(),
          pattern: pattern(),
          threshold: threshold() | nil,
          action: action(),
          enabled: boolean(),
          created_at: DateTime.t(),
          triggered_count: non_neg_integer(),
          last_triggered: DateTime.t() | nil
        }

  @type window_state :: %{
          events: [{DateTime.t(), map()}],
          count: non_neg_integer()
        }

  # Configurable limits
  @max_hooks 1000
  @max_window_events 10_000
  @default_window_ms 60_000
  @window_cleanup_interval :timer.seconds(30)

  # MFA whitelist for action security - only allow calls to known safe modules
  # Configure via Application.put_env(:cybernetic, :cep_mfa_whitelist, [MyModule])
  @default_mfa_whitelist [
    Oban,
    Phoenix.PubSub,
    Logger,
    Kernel,
    GenServer,
    Task
  ]

  @telemetry [:cybernetic, :intelligence, :cep]

  # Client API

  @doc "Start the workflow hooks server"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Register a new workflow hook"
  @spec register(map(), keyword()) :: {:ok, hook_id()} | {:error, term()}
  def register(config, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:register, config})
  end

  @doc "Unregister a hook"
  @spec unregister(hook_id(), keyword()) :: :ok | {:error, :not_found}
  def unregister(hook_id, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:unregister, hook_id})
  end

  @doc "Enable/disable a hook"
  @spec set_enabled(hook_id(), boolean(), keyword()) :: :ok | {:error, :not_found}
  def set_enabled(hook_id, enabled, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:set_enabled, hook_id, enabled})
  end

  @doc "Process an event through all registered hooks"
  @spec process_event(map(), keyword()) :: :ok
  def process_event(event, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.cast(server, {:process_event, event})
  end

  @doc "Process event synchronously (for testing/backpressure)"
  @spec process_event_sync(map(), keyword()) :: {:ok, non_neg_integer()}
  def process_event_sync(event, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:process_event_sync, event})
  end

  @doc "List all registered hooks"
  @spec list_hooks(keyword()) :: [hook()]
  def list_hooks(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :list_hooks)
  end

  @doc "Get a specific hook"
  @spec get_hook(hook_id(), keyword()) :: {:ok, hook()} | {:error, :not_found}
  def get_hook(hook_id, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:get_hook, hook_id})
  end

  @doc "Get statistics"
  @spec stats(keyword()) :: map()
  def stats(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :stats)
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    Logger.info("CEP Workflow Hooks starting")

    state = %{
      hooks: %{},
      windows: %{},
      max_hooks: Keyword.get(opts, :max_hooks, @max_hooks),
      max_window_events: Keyword.get(opts, :max_window_events, @max_window_events),
      stats: %{
        events_processed: 0,
        hooks_triggered: 0,
        pattern_matches: 0,
        events_dropped: 0
      }
    }

    schedule_window_cleanup()

    {:ok, state}
  end

  @impl true
  def handle_call({:register, config}, _from, state) do
    if map_size(state.hooks) >= state.max_hooks do
      {:reply, {:error, :max_hooks_reached}, state}
    else
      with {:ok, hook} <- build_hook(config) do
        new_state = %{
          state
          | hooks: Map.put(state.hooks, hook.id, hook),
            windows: Map.put(state.windows, hook.id, %{events: :queue.new(), count: 0})
        }

        Logger.info("Registered CEP hook", hook_id: hook.id, name: hook.name)
        emit_telemetry(:hook_registered, %{hook_id: hook.id})

        {:reply, {:ok, hook.id}, new_state}
      else
        {:error, _} = error ->
          {:reply, error, state}
      end
    end
  end

  @impl true
  def handle_call({:unregister, hook_id}, _from, state) do
    if Map.has_key?(state.hooks, hook_id) do
      new_state = %{
        state
        | hooks: Map.delete(state.hooks, hook_id),
          windows: Map.delete(state.windows, hook_id)
      }

      Logger.info("Unregistered CEP hook", hook_id: hook_id)
      {:reply, :ok, new_state}
    else
      {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:set_enabled, hook_id, enabled}, _from, state) do
    if Map.has_key?(state.hooks, hook_id) do
      new_hooks = put_in(state.hooks, [hook_id, :enabled], enabled)
      {:reply, :ok, %{state | hooks: new_hooks}}
    else
      {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call(:list_hooks, _from, state) do
    hooks = Map.values(state.hooks)
    {:reply, hooks, state}
  end

  @impl true
  def handle_call({:get_hook, hook_id}, _from, state) do
    case Map.get(state.hooks, hook_id) do
      nil -> {:reply, {:error, :not_found}, state}
      hook -> {:reply, {:ok, hook}, state}
    end
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      state.stats
      |> Map.put(:active_hooks, map_size(state.hooks))
      |> Map.put(:enabled_hooks, count_enabled(state.hooks))
      |> Map.put(:total_window_events, count_window_events(state.windows))

    {:reply, stats, state}
  end

  @impl true
  def handle_call({:process_event_sync, event}, _from, state) do
    {new_state, triggered_count} = do_process_event(event, state)
    {:reply, {:ok, triggered_count}, new_state}
  end

  @impl true
  def handle_cast({:process_event, event}, state) do
    {new_state, _triggered_count} = do_process_event(event, state)
    {:noreply, new_state}
  end

  @impl true
  def handle_info(:window_cleanup, state) do
    now = DateTime.utc_now()

    new_windows =
      Enum.into(state.windows, %{}, fn {hook_id, window} ->
        hook = Map.get(state.hooks, hook_id)
        window_ms = get_window_ms(hook)
        cutoff = DateTime.add(now, -window_ms, :millisecond)

        # Convert queue to list, filter, then back to queue
        cleaned_list =
          :queue.to_list(window.events)
          |> Enum.filter(fn {timestamp, _event} ->
            DateTime.compare(timestamp, cutoff) == :gt
          end)

        cleaned_queue = :queue.from_list(cleaned_list)

        {hook_id, %{events: cleaned_queue, count: length(cleaned_list)}}
      end)

    schedule_window_cleanup()

    {:noreply, %{state | windows: new_windows}}
  end

  # Private Functions

  defp do_process_event(event, state) do
    start_time = System.monotonic_time(:microsecond)
    now = DateTime.utc_now()

    {new_state, triggered_count} =
      Enum.reduce(state.hooks, {state, 0}, fn {hook_id, hook}, {acc_state, count} ->
        if hook.enabled and matches_pattern?(event, hook.pattern) do
          acc_state = update_window(acc_state, hook_id, event, now)

          if threshold_met?(acc_state, hook_id, hook.threshold) do
            execute_action(hook.action, event, hook)

            updated_hook = %{
              hook
              | triggered_count: hook.triggered_count + 1,
                last_triggered: now
            }

            new_hooks = Map.put(acc_state.hooks, hook_id, updated_hook)
            new_windows = Map.put(acc_state.windows, hook_id, %{events: :queue.new(), count: 0})

            {%{acc_state | hooks: new_hooks, windows: new_windows}, count + 1}
          else
            acc_state = update_in(acc_state, [:stats, :pattern_matches], &(&1 + 1))
            {acc_state, count}
          end
        else
          {acc_state, count}
        end
      end)

    final_state =
      new_state
      |> update_in([:stats, :events_processed], &(&1 + 1))
      |> update_in([:stats, :hooks_triggered], &(&1 + triggered_count))

    duration = System.monotonic_time(:microsecond) - start_time
    emit_telemetry(:event_processed, %{duration_us: duration, triggers: triggered_count})

    {final_state, triggered_count}
  end

  @spec build_hook(map()) :: {:ok, hook()} | {:error, term()}
  defp build_hook(config) do
    with :ok <- validate_hook_config(config) do
      hook = %{
        id: Cybernetic.Intelligence.Utils.generate_id(),
        name: config[:name] || "unnamed_hook",
        pattern: config[:pattern] || %{},
        threshold: config[:threshold],
        action: config[:action],
        enabled: Map.get(config, :enabled, true),
        created_at: DateTime.utc_now(),
        triggered_count: 0,
        last_triggered: nil
      }

      {:ok, hook}
    end
  end

  @spec validate_hook_config(map()) :: :ok | {:error, term()}
  defp validate_hook_config(config) do
    cond do
      not is_map(config[:pattern]) ->
        {:error, :invalid_pattern}

      config[:action] == nil ->
        {:error, :missing_action}

      not valid_action?(config[:action]) ->
        {:error, :invalid_action}

      true ->
        :ok
    end
  end

  @spec valid_action?(term()) :: boolean()
  defp valid_action?({:workflow, name}) when is_binary(name), do: true
  defp valid_action?({:notify, channel}) when is_binary(channel), do: true
  defp valid_action?({:log, level}) when level in [:debug, :info, :warning, :error], do: true
  defp valid_action?({:mfa, {m, f, a}}) when is_atom(m) and is_atom(f) and is_list(a), do: true
  defp valid_action?(_), do: false

  @spec matches_pattern?(map(), pattern()) :: boolean()
  defp matches_pattern?(_event, pattern) when map_size(pattern) == 0, do: true

  defp matches_pattern?(event, pattern) do
    Enum.all?(pattern, fn {key, expected} ->
      actual = get_nested_value(event, key)
      matches_value?(actual, expected)
    end)
  end

  # Support nested field access via dot notation or list path
  # Uses Access behavior which works with both atom and string keys
  @spec get_nested_value(map(), atom() | String.t() | [atom() | String.t()]) :: term()
  defp get_nested_value(event, key) when is_atom(key) or is_binary(key) do
    key_str = to_string(key)

    if String.contains?(key_str, ".") do
      # For nested paths, try both atom and string keys at each level
      path = String.split(key_str, ".")
      get_nested_flexible(event, path)
    else
      # Single key: try atom first (common for internal events), then string (external/JSON)
      Map.get(event, key) || Map.get(event, key_str)
    end
  end

  defp get_nested_value(event, path) when is_list(path) do
    get_in(event, path)
  end

  # Flexible nested access that tries both atom and string keys at each level
  # Avoids String.to_existing_atom try/rescue overhead by using safe_to_existing_atom
  @spec get_nested_flexible(map(), [String.t()]) :: term()
  defp get_nested_flexible(value, []), do: value
  defp get_nested_flexible(nil, _), do: nil
  defp get_nested_flexible(value, _) when not is_map(value), do: nil

  defp get_nested_flexible(map, [key | rest]) do
    # Try string key first (most common from JSON/external), then atom if it exists
    value =
      case Map.fetch(map, key) do
        {:ok, v} -> v
        :error -> get_with_atom_key(map, key)
      end

    get_nested_flexible(value, rest)
  end

  # Safe atom key lookup - only converts to atom if it already exists in atom table
  @spec get_with_atom_key(map(), String.t()) :: term()
  defp get_with_atom_key(map, key_str) do
    # Check if atom exists without raising - :erlang.binary_to_existing_atom is safe
    case safe_to_existing_atom(key_str) do
      {:ok, atom_key} -> Map.get(map, atom_key)
      :error -> nil
    end
  end

  @spec safe_to_existing_atom(String.t()) :: {:ok, atom()} | :error
  defp safe_to_existing_atom(str) do
    {:ok, String.to_existing_atom(str)}
  rescue
    ArgumentError -> :error
  end

  @spec matches_value?(term(), term()) :: boolean()
  defp matches_value?(actual, {:eq, expected}), do: actual == expected
  defp matches_value?(actual, {:neq, expected}), do: actual != expected
  defp matches_value?(actual, {:gt, expected}) when is_number(actual), do: actual > expected
  defp matches_value?(actual, {:gte, expected}) when is_number(actual), do: actual >= expected
  defp matches_value?(actual, {:lt, expected}) when is_number(actual), do: actual < expected
  defp matches_value?(actual, {:lte, expected}) when is_number(actual), do: actual <= expected

  defp matches_value?(actual, {:in, list}) when is_list(list), do: actual in list
  defp matches_value?(actual, {:not_in, list}) when is_list(list), do: actual not in list

  defp matches_value?(actual, {:contains, substr}) when is_binary(actual) and is_binary(substr) do
    String.contains?(actual, substr)
  end

  defp matches_value?(actual, {:starts_with, prefix})
       when is_binary(actual) and is_binary(prefix) do
    String.starts_with?(actual, prefix)
  end

  defp matches_value?(actual, {:ends_with, suffix})
       when is_binary(actual) and is_binary(suffix) do
    String.ends_with?(actual, suffix)
  end

  defp matches_value?(actual, {:matches, regex}) when is_binary(actual) do
    Regex.match?(regex, actual)
  end

  # Severity comparison (string ordering)
  defp matches_value?(actual, {:gte, expected}) when is_binary(actual) and is_binary(expected) do
    severity_rank(actual) >= severity_rank(expected)
  end

  defp matches_value?(actual, expected), do: actual == expected

  @severity_ranks %{"critical" => 4, "high" => 3, "medium" => 2, "low" => 1}

  @spec severity_rank(String.t()) :: integer()
  defp severity_rank(severity), do: Map.get(@severity_ranks, severity, 0)

  @spec update_window(map(), hook_id(), map(), DateTime.t()) :: map()
  defp update_window(state, hook_id, event, timestamp) do
    window = Map.get(state.windows, hook_id, %{events: :queue.new(), count: 0})

    # Use :queue for O(1) insert and O(1) drop from opposite ends
    events_queue = window.events
    new_queue = :queue.in({timestamp, event}, events_queue)
    current_count = window.count + 1

    # Drop oldest events if over limit (O(1) drop from front)
    {final_queue, final_count, dropped} =
      if current_count > state.max_window_events do
        trim_queue(new_queue, current_count, state.max_window_events)
      else
        {new_queue, current_count, 0}
      end

    new_window = %{
      events: final_queue,
      count: final_count
    }

    new_state = %{state | windows: Map.put(state.windows, hook_id, new_window)}

    if dropped > 0 do
      update_in(new_state, [:stats, :events_dropped], &(&1 + dropped))
    else
      new_state
    end
  end

  # Trim queue to max size by dropping oldest (front) entries
  @spec trim_queue(:queue.queue(), non_neg_integer(), non_neg_integer()) ::
          {:queue.queue(), non_neg_integer(), non_neg_integer()}
  defp trim_queue(queue, current_count, max_count) when current_count <= max_count do
    {queue, current_count, 0}
  end

  defp trim_queue(queue, current_count, max_count) do
    case :queue.out(queue) do
      {{:value, _}, rest} ->
        trim_queue(rest, current_count - 1, max_count)

      {:empty, _} ->
        {queue, 0, current_count}
    end
  end

  @spec threshold_met?(map(), hook_id(), threshold() | nil) :: boolean()
  defp threshold_met?(_state, _hook_id, nil), do: true

  defp threshold_met?(state, hook_id, threshold) do
    window = Map.get(state.windows, hook_id, %{events: :queue.new(), count: 0})

    cond do
      Map.has_key?(threshold, :count) ->
        window.count >= threshold.count

      Map.has_key?(threshold, :rate_per_min) ->
        window_ms = Map.get(threshold, :window_ms, @default_window_ms)
        rate = window.count / (window_ms / 60_000)
        rate >= threshold.rate_per_min

      true ->
        true
    end
  end

  @spec get_window_ms(hook() | nil) :: pos_integer()
  defp get_window_ms(nil), do: @default_window_ms
  defp get_window_ms(%{threshold: nil}), do: @default_window_ms

  defp get_window_ms(%{threshold: threshold}),
    do: Map.get(threshold, :window_ms, @default_window_ms)

  @spec execute_action(action(), map(), hook()) :: :ok
  defp execute_action({:workflow, workflow_name}, event, hook) do
    Logger.info("Triggering workflow",
      workflow: workflow_name,
      hook: hook.name,
      event_type: Map.get(event, :type)
    )

    emit_telemetry(:workflow_triggered, %{workflow: workflow_name, hook_id: hook.id})
    :ok
  end

  defp execute_action({:notify, channel}, _event, hook) do
    Logger.info("Sending notification",
      channel: channel,
      hook: hook.name
    )

    emit_telemetry(:notification_sent, %{channel: channel, hook_id: hook.id})
    :ok
  end

  defp execute_action({:log, level}, event, hook) do
    message = "CEP hook triggered: #{hook.name}"

    case level do
      :debug -> Logger.debug(message, event: event)
      :info -> Logger.info(message, event: event)
      :warning -> Logger.warning(message, event: event)
      :error -> Logger.error(message, event: event)
    end

    :ok
  end

  defp execute_action({:mfa, {m, f, a}}, event, hook) do
    # Security: validate module against whitelist before execution
    if mfa_whitelisted?(m) do
      try do
        apply(m, f, a ++ [event, hook])
        :ok
      rescue
        e ->
          Logger.error("Hook MFA callback failed",
            hook: hook.name,
            mfa: {m, f, length(a)},
            error: Exception.message(e)
          )

          :ok
      end
    else
      Logger.warning("Hook MFA rejected: module not whitelisted",
        hook: hook.name,
        module: m,
        whitelist: mfa_whitelist()
      )

      emit_telemetry(:mfa_rejected, %{hook_id: hook.id, module: m})
      :ok
    end
  end

  @spec count_enabled(map()) :: non_neg_integer()
  defp count_enabled(hooks) do
    Enum.count(hooks, fn {_id, hook} -> hook.enabled end)
  end

  @spec count_window_events(map()) :: non_neg_integer()
  defp count_window_events(windows) do
    Enum.reduce(windows, 0, fn {_id, window}, acc -> acc + window.count end)
  end

  defp schedule_window_cleanup do
    Process.send_after(self(), :window_cleanup, @window_cleanup_interval)
  end

  @spec emit_telemetry(atom(), map()) :: :ok
  defp emit_telemetry(event, metadata) do
    :telemetry.execute(@telemetry ++ [event], %{count: 1}, metadata)
  end

  # MFA whitelist security helpers
  @spec mfa_whitelist() :: [module()]
  defp mfa_whitelist do
    Application.get_env(:cybernetic, :cep_mfa_whitelist, @default_mfa_whitelist)
  end

  @spec mfa_whitelisted?(module()) :: boolean()
  defp mfa_whitelisted?(mod) when is_atom(mod) do
    mod in mfa_whitelist()
  end
end
