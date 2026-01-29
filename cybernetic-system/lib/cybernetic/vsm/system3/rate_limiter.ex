defmodule Cybernetic.VSM.System3.RateLimiter do
  @moduledoc """
  S3 Rate Limiter for controlling resource consumption across the VSM framework.

  Provides budget management and rate limiting capabilities to prevent
  system overload and manage costs across different services.

  ## Budget Isolation

  Rate limits are enforced per `budget_key` (e.g., `:s4_llm`, `:api_gateway`).
  All requests to the same budget_key share the same counter within a time window.

  **Important**: For tenant isolation, use distinct budget_keys per tenant:
  - `{:s4_llm, tenant_id}` for per-tenant LLM budgets
  - `{:api_gateway, tenant_id}` for per-tenant API rate limits

  The `resource_type` parameter is for telemetry/logging only and does NOT
  create separate rate limit counters.

  ## Tuple Budget Keys

  Tuple budget keys (e.g. `{:mcp_tools, client_id}`) are supported and inherit
  their limits from the base atom budget (`:mcp_tools`). Budgets for tuple keys
  are created on-demand and cleaned up after an idle TTL to avoid unbounded
  memory growth.

  ## Priority Multipliers

  Requests consume tokens based on priority:
  - `:critical` / `:high` - 1 token
  - `:normal` - 2 tokens
  - `:low` - 4 tokens

  This allows high-priority requests to succeed when budgets are near limits.
  """

  use GenServer
  require Logger

  @telemetry [:cybernetic, :s3, :rate_limiter]

  defstruct [
    :budgets,
    :windows,
    :config
  ]

  @type budget_key :: atom() | {atom(), term()}
  @type priority :: :low | :normal | :high | :critical

  # Public API

  @doc """
  Start the RateLimiter.
  """
  def start_link(opts \\ []) do
    case Keyword.get(opts, :name, __MODULE__) do
      nil ->
        GenServer.start_link(__MODULE__, opts)

      name ->
        GenServer.start_link(__MODULE__, opts, name: name)
    end
  end

  @doc """
  Request tokens from a budget.

  ## Parameters

  - budget_key: Budget identifier (e.g., :s4_llm, :s5_policy)
  - resource_type: Type of resource being consumed
  - priority: Request priority

  ## Returns

  :ok | {:error, :rate_limited}
  """
  def request_tokens(budget_key, resource_type, priority \\ :normal) do
    request_tokens(__MODULE__, budget_key, resource_type, priority)
  end

  @doc """
  Request tokens from a budget on a specific RateLimiter instance.

  Budget keys can be atoms (`:s4_llm`) or tuples (`{:s4_llm, tenant_id}`)
  for tenant-isolated rate limiting.
  """
  @spec request_tokens(GenServer.server(), budget_key(), term(), priority()) ::
          :ok | {:error, term()}
  def request_tokens(server, budget_key, resource_type, priority)
      when is_atom(budget_key) or is_tuple(budget_key) do
    GenServer.call(server, {:request_tokens, budget_key, resource_type, priority}, 5_000)
  end

  @doc """
  Get current budget status.
  """
  def budget_status(budget_key) do
    budget_status(__MODULE__, budget_key)
  end

  @doc """
  Get current budget status from a specific RateLimiter instance.
  """
  @spec budget_status(GenServer.server(), budget_key()) :: map()
  def budget_status(server, budget_key) when is_atom(budget_key) or is_tuple(budget_key) do
    GenServer.call(server, {:budget_status, budget_key}, 5_000)
  end

  @doc """
  Get all budget statuses.
  """
  def all_budgets do
    all_budgets(__MODULE__)
  end

  @doc """
  Get all budget statuses from a specific RateLimiter instance.
  """
  @spec all_budgets(GenServer.server()) :: map()
  def all_budgets(server) do
    GenServer.call(server, :all_budgets, 5_000)
  end

  @doc """
  Reset a budget (for testing or emergency situations).
  """
  def reset_budget(budget_key) do
    reset_budget(__MODULE__, budget_key)
  end

  @doc """
  Reset a budget on a specific RateLimiter instance.
  """
  @spec reset_budget(GenServer.server(), budget_key()) :: :ok
  def reset_budget(server, budget_key) when is_atom(budget_key) or is_tuple(budget_key) do
    GenServer.call(server, {:reset_budget, budget_key}, 5_000)
  end

  # GenServer callbacks

  @impl GenServer
  def init(opts) do
    config = load_config(opts)

    state = %__MODULE__{
      budgets: initialize_budgets(config),
      windows: %{},
      config: config
    }

    Logger.info("S3 RateLimiter initialized with budgets: #{inspect(Map.keys(state.budgets))}")

    # Schedule periodic cleanup
    schedule_cleanup()

    {:ok, state}
  end

  @impl GenServer
  def handle_call({:request_tokens, budget_key, resource_type, priority}, _from, state) do
    {result, new_state} = do_request_tokens(budget_key, resource_type, priority, state)

    emit_telemetry(budget_key, resource_type, priority, result)

    {:reply, result, new_state}
  end

  @impl GenServer
  def handle_call({:budget_status, budget_key}, _from, state) do
    status = get_budget_status(budget_key, state)
    {:reply, status, state}
  end

  @impl GenServer
  def handle_call(:all_budgets, _from, state) do
    all_status =
      Enum.map(state.budgets, fn {key, _} ->
        {key, get_budget_status(key, state)}
      end)
      |> Enum.into(%{})

    {:reply, all_status, state}
  end

  @impl GenServer
  def handle_call({:reset_budget, budget_key}, _from, state) do
    new_budgets =
      case Map.get(state.budgets, budget_key) do
        nil ->
          state.budgets

        budget ->
          reset_budget = %{budget | consumed: 0, last_reset: current_time()}
          Map.put(state.budgets, budget_key, reset_budget)
      end

    new_state = %{state | budgets: new_budgets}

    Logger.info("Reset budget #{budget_key}")
    {:reply, :ok, new_state}
  end

  @impl GenServer
  def handle_info(:cleanup_windows, state) do
    new_state = cleanup_expired_windows(state)
    schedule_cleanup()
    {:noreply, new_state}
  end

  @impl GenServer
  def handle_info(_msg, state) do
    {:noreply, state}
  end

  # Private functions

  defp do_request_tokens(budget_key, resource_type, priority, state) do
    case get_or_create_budget(budget_key, state) do
      {:error, :unknown_budget} ->
        # P1 Fix: Deny by default when no budget configured (fail-closed)
        Logger.warning("Rate limiter: Unknown budget #{inspect(budget_key)}, denying request")
        {{:error, :unknown_budget}, state}

      {:ok, budget, state} ->
        budget = normalize_budget_window(budget)

        case check_budget_limits(budget, resource_type, priority) do
          :ok ->
            new_budget = consume_tokens(budget, resource_type, priority)
            new_state = put_in(state.budgets[budget_key], new_budget)
            {:ok, new_state}

          {:error, reason} ->
            # Persist any window reset even when denying the request.
            new_state = put_in(state.budgets[budget_key], budget)
            {{:error, reason}, new_state}
        end
    end
  end

  defp get_or_create_budget(budget_key, state) do
    case Map.get(state.budgets, budget_key) do
      nil -> maybe_create_dynamic_budget(budget_key, state)
      budget -> {:ok, budget, state}
    end
  end

  defp maybe_create_dynamic_budget({base_key, _id} = budget_key, %{config: config} = state)
       when is_atom(base_key) do
    case config.default_budgets do
      %{^base_key => budget_config} ->
        budget = build_budget(budget_config)
        {:ok, budget, put_in(state.budgets[budget_key], budget)}

      _ ->
        {:error, :unknown_budget}
    end
  end

  defp maybe_create_dynamic_budget(_budget_key, _state), do: {:error, :unknown_budget}

  defp build_budget(budget_config) do
    now = current_time()

    %{
      limit: budget_config.limit,
      window_ms: budget_config.window_ms,
      consumed: 0,
      last_reset: now,
      last_request: nil
    }
  end

  defp normalize_budget_window(budget) do
    current_time = current_time()
    window_start = current_time - budget.window_ms

    if budget.last_reset < window_start do
      %{budget | consumed: 0, last_reset: current_time}
    else
      budget
    end
  end

  defp check_budget_limits(budget, _resource_type, priority) do
    # Calculate priority multiplier
    multiplier =
      case priority do
        :critical -> 1
        :high -> 1
        :normal -> 2
        :low -> 4
      end

    tokens_needed = multiplier

    if budget.consumed + tokens_needed <= budget.limit do
      :ok
    else
      {:error, :rate_limited}
    end
  end

  defp consume_tokens(budget, _resource_type, priority) do
    multiplier =
      case priority do
        :critical -> 1
        :high -> 1
        :normal -> 2
        :low -> 4
      end

    %{budget | consumed: budget.consumed + multiplier, last_request: current_time()}
  end

  defp get_budget_status(budget_key, state) do
    case Map.get(state.budgets, budget_key) do
      nil ->
        %{status: :not_configured}

      budget ->
        current_time = current_time()
        window_start = current_time - budget.window_ms

        # Reset consumed if window has passed
        consumed = if budget.last_reset < window_start, do: 0, else: budget.consumed

        %{
          status: :active,
          limit: budget.limit,
          consumed: consumed,
          remaining: max(0, budget.limit - consumed),
          utilization: consumed / budget.limit,
          window_ms: budget.window_ms,
          last_reset: budget.last_reset,
          last_request: budget.last_request
        }
    end
  end

  defp load_config(opts) do
    default_config = %{
      # 1 minute
      cleanup_interval: 60_000,
      # 5 minutes
      default_window: 300_000,
      # Dynamic (tuple) budgets are removed after this idle TTL.
      # Keep this >= the largest window to avoid churn.
      dynamic_budget_ttl_ms: 600_000,
      default_budgets: %{
        # 100 requests per 5 minutes
        s4_llm: %{limit: 100, window_ms: 300_000},
        # 50 requests per 10 minutes
        s5_policy: %{limit: 50, window_ms: 600_000},
        # 200 requests per minute
        mcp_tools: %{limit: 200, window_ms: 60_000},
        # P1 Fix: Add api_gateway budget (used by edge gateway plugs)
        # 1000 requests per minute per client
        api_gateway: %{limit: 1000, window_ms: 60_000}
      }
    }

    app_config =
      Application.get_env(:cybernetic, :s3_rate_limiter, [])
      |> Enum.into(%{})

    opts_config =
      Keyword.take(opts, [
        :cleanup_interval,
        :default_window,
        :dynamic_budget_ttl_ms,
        :default_budgets
      ])
      |> Enum.into(%{})

    Map.merge(default_config, Map.merge(app_config, opts_config))
  end

  defp initialize_budgets(config) do
    config.default_budgets
    |> Enum.map(fn {key, budget_config} ->
      budget = build_budget(budget_config)

      {key, budget}
    end)
    |> Enum.into(%{})
  end

  defp cleanup_expired_windows(state) do
    now = current_time()
    ttl_ms = state.config.dynamic_budget_ttl_ms

    {budgets, removed} =
      Enum.reduce(state.budgets, {%{}, 0}, fn
        {budget_key, budget}, {acc, removed} when is_tuple(budget_key) ->
          last_request = budget.last_request || budget.last_reset
          budget_ttl_ms = max(ttl_ms, budget.window_ms * 2)

          if is_integer(last_request) and now - last_request > budget_ttl_ms do
            {acc, removed + 1}
          else
            {Map.put(acc, budget_key, budget), removed}
          end

        {budget_key, budget}, {acc, removed} ->
          {Map.put(acc, budget_key, budget), removed}
      end)

    if removed > 0 do
      Logger.debug("Rate limiter cleaned up #{removed} dynamic budgets")
    end

    %{state | budgets: budgets}
  end

  defp schedule_cleanup do
    Process.send_after(self(), :cleanup_windows, 60_000)
  end

  defp current_time do
    System.monotonic_time(:millisecond)
  end

  defp emit_telemetry(budget_key, resource_type, priority, result) do
    measurements = %{count: 1}

    metadata = %{
      budget_key: budget_key,
      resource_type: resource_type,
      priority: priority,
      result:
        case result do
          :ok -> :allowed
          {:error, reason} -> reason
        end
    }

    :telemetry.execute(@telemetry, measurements, metadata)
  end
end
