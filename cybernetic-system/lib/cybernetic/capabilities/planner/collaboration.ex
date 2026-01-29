defmodule Cybernetic.Capabilities.Planner.Collaboration do
  @moduledoc """
  Collaborative planning system using AMQP topic routing.

  Enables multiple systems (S1-S5) to contribute to a shared plan
  through publish/subscribe messaging patterns.

  ## Topics

  - `planner.request` - New plan requests
  - `planner.response` - Contributions from systems
  - `planner.update` - Plan updates/revisions
  - `planner.complete` - Plan finalization

  ## Example

      # Request a new plan
      {:ok, plan_id} = Collaboration.request_plan(
        "Analyze episode for policy violations",
        %{episode_id: "...", tenant_id: "..."}
      )

      # Systems subscribe and contribute
      Collaboration.submit_contribution(plan_id, %{
        system: :s4,
        steps: [...],
        resources: [...]
      })

      # Finalize when ready
      {:ok, plan} = Collaboration.finalize_plan(plan_id)
  """
  use GenServer

  require Logger

  alias Phoenix.PubSub

  @topics %{
    plan_request: "planner.request",
    plan_response: "planner.response",
    plan_update: "planner.update",
    plan_complete: "planner.complete"
  }

  @type plan_state ::
          :pending | :planning | :ready | :executing | :complete | :failed | :cancelled

  @type plan :: %{
          id: String.t(),
          goal: String.t(),
          context: map(),
          state: plan_state(),
          contributions: [contribution()],
          steps: [step()],
          created_at: DateTime.t(),
          updated_at: DateTime.t(),
          timeout_at: DateTime.t() | nil
        }

  @type contribution :: %{
          system: atom(),
          steps: [step()],
          resources: [String.t()],
          priority: integer(),
          submitted_at: DateTime.t()
        }

  @type step :: %{
          id: String.t(),
          action: String.t(),
          system: atom(),
          inputs: map(),
          outputs: [atom()],
          dependencies: [String.t()],
          status: :pending | :running | :complete | :failed
        }

  @telemetry [:cybernetic, :capabilities, :planner]

  # Client API

  @doc "Start the planner collaboration server"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Request a new plan for a goal"
  @spec request_plan(String.t(), map(), keyword()) :: {:ok, String.t()} | {:error, term()}
  def request_plan(goal, context, opts \\ []) do
    GenServer.call(__MODULE__, {:request_plan, goal, context, opts})
  end

  @doc "Submit a contribution to an existing plan"
  @spec submit_contribution(String.t(), map()) :: :ok | {:error, term()}
  def submit_contribution(plan_id, contribution) do
    GenServer.call(__MODULE__, {:submit_contribution, plan_id, contribution})
  end

  @doc "Finalize a plan and prepare for execution"
  @spec finalize_plan(String.t()) :: {:ok, plan()} | {:error, term()}
  def finalize_plan(plan_id) do
    GenServer.call(__MODULE__, {:finalize_plan, plan_id})
  end

  @doc "Cancel a plan"
  @spec cancel_plan(String.t(), String.t()) :: :ok | {:error, term()}
  def cancel_plan(plan_id, reason \\ "cancelled") do
    GenServer.call(__MODULE__, {:cancel_plan, plan_id, reason})
  end

  @doc "Get plan status"
  @spec get_plan(String.t()) :: {:ok, plan()} | {:error, :not_found}
  def get_plan(plan_id) do
    GenServer.call(__MODULE__, {:get_plan, plan_id})
  end

  @doc "List active plans"
  @spec list_plans(keyword()) :: [plan()]
  def list_plans(opts \\ []) do
    GenServer.call(__MODULE__, {:list_plans, opts})
  end

  @doc "Subscribe to plan events"
  @spec subscribe(String.t() | :all) :: :ok
  def subscribe(plan_id_or_all) do
    topic = plan_topic(plan_id_or_all)
    PubSub.subscribe(pubsub_module(), topic)
  end

  @doc "Get topic names"
  @spec topics() :: map()
  def topics, do: @topics

  # Server Callbacks

  @impl true
  def init(opts) do
    Logger.info("Planner Collaboration starting")

    state = %{
      plans: %{},
      timeout_ms: Keyword.get(opts, :timeout_ms, :timer.minutes(5)),
      max_contributions: Keyword.get(opts, :max_contributions, 10)
    }

    # Schedule periodic cleanup
    schedule_cleanup()

    {:ok, state}
  end

  @impl true
  def handle_call({:request_plan, goal, context, opts}, _from, state) do
    start_time = System.monotonic_time(:millisecond)
    timeout_ms = Keyword.get(opts, :timeout_ms, state.timeout_ms)

    plan = %{
      id: UUID.uuid4(),
      goal: goal,
      context: context,
      state: :pending,
      contributions: [],
      steps: [],
      created_at: DateTime.utc_now(),
      updated_at: DateTime.utc_now(),
      timeout_at: DateTime.add(DateTime.utc_now(), timeout_ms, :millisecond)
    }

    new_state = put_in(state, [:plans, plan.id], plan)

    # Broadcast plan request
    broadcast_event(@topics.plan_request, %{
      plan_id: plan.id,
      goal: goal,
      context: context
    })

    emit_telemetry(:request, start_time, %{plan_id: plan.id})
    Logger.info("Plan requested", plan_id: plan.id, goal: goal)

    {:reply, {:ok, plan.id}, new_state}
  end

  @impl true
  def handle_call({:submit_contribution, plan_id, contrib_attrs}, _from, state) do
    start_time = System.monotonic_time(:millisecond)

    case Map.get(state.plans, plan_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      plan when plan.state not in [:pending, :planning] ->
        {:reply, {:error, {:invalid_state, plan.state}}, state}

      plan ->
        contribution = build_contribution(contrib_attrs)

        if length(plan.contributions) >= state.max_contributions do
          {:reply, {:error, :max_contributions_reached}, state}
        else
          updated_plan = %{
            plan
            | contributions: plan.contributions ++ [contribution],
              state: :planning,
              updated_at: DateTime.utc_now()
          }

          new_state = put_in(state, [:plans, plan_id], updated_plan)

          # Broadcast update
          broadcast_event(@topics.plan_update, %{
            plan_id: plan_id,
            contribution: contribution
          })

          emit_telemetry(:contribution, start_time, %{
            plan_id: plan_id,
            system: contribution.system
          })

          Logger.debug("Contribution submitted",
            plan_id: plan_id,
            system: contribution.system
          )

          {:reply, :ok, new_state}
        end
    end
  end

  @impl true
  def handle_call({:finalize_plan, plan_id}, _from, state) do
    start_time = System.monotonic_time(:millisecond)

    case Map.get(state.plans, plan_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      plan when plan.state not in [:pending, :planning] ->
        {:reply, {:error, {:invalid_state, plan.state}}, state}

      plan when plan.contributions == [] ->
        {:reply, {:error, :no_contributions}, state}

      plan ->
        # Merge contributions into final plan
        steps = merge_contributions(plan.contributions)

        finalized_plan = %{
          plan
          | state: :ready,
            steps: steps,
            updated_at: DateTime.utc_now()
        }

        new_state = put_in(state, [:plans, plan_id], finalized_plan)

        # Broadcast completion
        broadcast_event(@topics.plan_complete, %{
          plan_id: plan_id,
          steps: steps
        })

        emit_telemetry(:finalize, start_time, %{
          plan_id: plan_id,
          step_count: length(steps)
        })

        Logger.info("Plan finalized",
          plan_id: plan_id,
          step_count: length(steps)
        )

        {:reply, {:ok, finalized_plan}, new_state}
    end
  end

  @impl true
  def handle_call({:cancel_plan, plan_id, reason}, _from, state) do
    case Map.get(state.plans, plan_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      plan when plan.state in [:complete, :cancelled] ->
        {:reply, {:error, {:invalid_state, plan.state}}, state}

      plan ->
        cancelled_plan = %{
          plan
          | state: :cancelled,
            updated_at: DateTime.utc_now()
        }

        new_state = put_in(state, [:plans, plan_id], cancelled_plan)

        broadcast_event(@topics.plan_complete, %{
          plan_id: plan_id,
          status: :cancelled,
          reason: reason
        })

        Logger.info("Plan cancelled", plan_id: plan_id, reason: reason)

        {:reply, :ok, new_state}
    end
  end

  @impl true
  def handle_call({:get_plan, plan_id}, _from, state) do
    case Map.get(state.plans, plan_id) do
      nil -> {:reply, {:error, :not_found}, state}
      plan -> {:reply, {:ok, plan}, state}
    end
  end

  @impl true
  def handle_call({:list_plans, opts}, _from, state) do
    state_filter = Keyword.get(opts, :state)

    plans =
      state.plans
      |> Map.values()
      |> Enum.filter(fn plan ->
        is_nil(state_filter) or plan.state == state_filter
      end)
      |> Enum.sort_by(& &1.created_at, {:desc, DateTime})

    {:reply, plans, state}
  end

  @impl true
  def handle_info(:cleanup, state) do
    now = DateTime.utc_now()
    retention_period = :timer.hours(24)
    retention_threshold = DateTime.add(now, -retention_period, :millisecond)

    # Mark timed-out pending/planning plans as failed
    expired_ids =
      state.plans
      |> Enum.filter(fn {_id, plan} ->
        plan.timeout_at && DateTime.compare(now, plan.timeout_at) == :gt &&
          plan.state in [:pending, :planning]
      end)
      |> Enum.map(fn {id, _plan} -> id end)

    plans_after_timeout =
      Enum.reduce(expired_ids, state.plans, fn id, acc ->
        plan = Map.get(acc, id)
        Map.put(acc, id, %{plan | state: :failed})
      end)

    # Actually delete old completed/failed/cancelled plans (>24h)
    deletable_ids =
      plans_after_timeout
      |> Enum.filter(fn {_id, plan} ->
        plan.state in [:complete, :failed, :cancelled] &&
          DateTime.compare(plan.updated_at, retention_threshold) == :lt
      end)
      |> Enum.map(fn {id, _plan} -> id end)

    new_plans = Map.drop(plans_after_timeout, deletable_ids)

    if length(expired_ids) > 0 or length(deletable_ids) > 0 do
      Logger.info("Plan cleanup",
        expired: length(expired_ids),
        deleted: length(deletable_ids),
        remaining: map_size(new_plans)
      )
    end

    schedule_cleanup()

    {:noreply, %{state | plans: new_plans}}
  end

  # Private Functions

  @spec build_contribution(map()) :: contribution()
  defp build_contribution(attrs) do
    %{
      system: attrs[:system] || :unknown,
      steps: attrs[:steps] || [],
      resources: attrs[:resources] || [],
      priority: attrs[:priority] || 0,
      submitted_at: DateTime.utc_now()
    }
  end

  @spec merge_contributions([contribution()]) :: [step()]
  defp merge_contributions(contributions) do
    contributions
    |> Enum.sort_by(& &1.priority, :desc)
    |> Enum.flat_map(& &1.steps)
    |> Enum.with_index()
    |> Enum.map(fn {step, idx} ->
      Map.merge(
        %{
          id: "step-#{idx}",
          status: :pending,
          dependencies: []
        },
        step
      )
    end)
  end

  @spec broadcast_event(String.t(), map()) :: :ok
  defp broadcast_event(topic, payload) do
    # Check if PubSub is available before attempting broadcast
    case Process.whereis(pubsub_module()) do
      nil ->
        # PubSub not running - silently skip in test, debug log otherwise
        if Application.get_env(:cybernetic, :environment, :prod) != :test do
          Logger.debug("PubSub not available, skipping broadcast", topic: topic)
        end

        :ok

      _pid ->
        try do
          PubSub.broadcast(pubsub_module(), topic, {:planner_event, topic, payload})
        rescue
          e ->
            Logger.warning("PubSub broadcast failed",
              topic: topic,
              error: Exception.message(e)
            )

            :telemetry.execute(
              @telemetry ++ [:broadcast_failed],
              %{count: 1},
              %{topic: topic, error: :exception}
            )

            :ok
        catch
          :exit, reason ->
            Logger.debug("PubSub broadcast exited",
              topic: topic,
              reason: inspect(reason)
            )

            :telemetry.execute(
              @telemetry ++ [:broadcast_failed],
              %{count: 1},
              %{topic: topic, error: :exit}
            )

            :ok
        end
    end
  end

  @spec plan_topic(String.t() | :all) :: String.t()
  defp plan_topic(:all), do: "planner.*"
  defp plan_topic(plan_id), do: "planner.plan.#{plan_id}"

  @spec pubsub_module() :: module()
  defp pubsub_module do
    Application.get_env(:cybernetic, :pubsub_module, Cybernetic.PubSub)
  end

  @spec schedule_cleanup() :: reference()
  defp schedule_cleanup do
    Process.send_after(self(), :cleanup, :timer.seconds(60))
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
