defmodule Cybernetic.Workers.PolicyEvaluator do
  @moduledoc """
  Oban worker for evaluating policies against events.

  Processes incoming events against registered policies and triggers
  appropriate actions when conditions are met.

  ## VSM Integration

  This worker operates as part of S5 (Policy) in the VSM framework,
  evaluating policies that govern system behavior.

  ## Configuration

      config :cybernetic, Oban,
        queues: [policy: 10]

  ## Job Arguments

      %{
        event_type: "episode.created",
        event_data: %{...},
        tenant_id: "tenant-1",
        policy_ids: ["policy-1", "policy-2"]  # Optional: specific policies
      }
  """
  use Oban.Worker,
    queue: :policy,
    max_attempts: 3,
    priority: 1

  require Logger

  @telemetry [:cybernetic, :worker, :policy_evaluator]

  @type policy :: %{
          id: String.t(),
          name: String.t(),
          conditions: [map()],
          actions: [map()],
          enabled: boolean()
        }

  @impl Oban.Worker
  @spec perform(Oban.Job.t()) :: :ok | {:error, term()}
  def perform(%Oban.Job{args: args}) do
    event_type = args["event_type"]
    event_data = args["event_data"] || %{}
    tenant_id = args["tenant_id"]
    policy_ids = args["policy_ids"]

    Logger.debug("Evaluating policies",
      event_type: event_type,
      tenant_id: tenant_id
    )

    start_time = System.monotonic_time(:millisecond)

    result =
      with {:ok, policies} <- fetch_policies(tenant_id, event_type, policy_ids),
           {:ok, results} <- evaluate_policies(policies, event_type, event_data, tenant_id) do
        emit_telemetry(:success, start_time, length(policies))
        process_results(results, tenant_id)
        :ok
      else
        {:error, reason} ->
          Logger.error("Policy evaluation failed",
            event_type: event_type,
            reason: reason
          )

          emit_telemetry(:error, start_time, 0)
          {:error, reason}
      end

    result
  end

  # Fetch applicable policies

  @spec fetch_policies(String.t(), String.t(), [String.t()] | nil) ::
          {:ok, [policy()]} | {:error, term()}
  defp fetch_policies(tenant_id, event_type, nil) do
    # Fetch all policies matching the event type
    policies = get_policies_for_event(tenant_id, event_type)
    {:ok, policies}
  end

  defp fetch_policies(tenant_id, _event_type, policy_ids) do
    # Fetch specific policies by ID
    policies =
      policy_ids
      |> Enum.map(&get_policy(tenant_id, &1))
      |> Enum.filter(&(&1 != nil))

    {:ok, policies}
  end

  defp get_policies_for_event(tenant_id, event_type) do
    # Query policies from storage or database
    path = "policies/index.json"

    case Cybernetic.Storage.get(tenant_id, path) do
      {:ok, content} ->
        content
        |> Jason.decode!()
        |> Enum.filter(&policy_matches_event?(&1, event_type))
        |> Enum.filter(& &1["enabled"])

      {:error, :not_found} ->
        # Return default policies
        get_default_policies(event_type)

      _ ->
        []
    end
  end

  defp get_policy(tenant_id, policy_id) do
    path = "policies/#{policy_id}.json"

    case Cybernetic.Storage.get(tenant_id, path) do
      {:ok, content} -> Jason.decode!(content)
      _ -> nil
    end
  end

  defp policy_matches_event?(policy, event_type) do
    triggers = policy["triggers"] || []

    Enum.any?(triggers, fn trigger ->
      pattern = trigger["event_pattern"] || "*"
      event_matches_pattern?(event_type, pattern)
    end)
  end

  defp event_matches_pattern?(event_type, pattern) do
    cond do
      pattern == "*" ->
        true

      String.ends_with?(pattern, ".*") ->
        prefix = String.trim_trailing(pattern, ".*")
        String.starts_with?(event_type, prefix)

      true ->
        event_type == pattern
    end
  end

  defp get_default_policies(event_type) do
    # Default policies for common events
    case event_type do
      "episode.created" ->
        [
          %{
            "id" => "default-analysis",
            "name" => "Auto-analyze new episodes",
            "enabled" => true,
            "triggers" => [%{"event_pattern" => "episode.created"}],
            "conditions" => [],
            "actions" => [
              %{"type" => "enqueue_job", "worker" => "EpisodeAnalyzer", "args" => %{}}
            ]
          }
        ]

      _ ->
        []
    end
  end

  # Evaluate policies against event

  @spec evaluate_policies([policy()], String.t(), map(), String.t()) ::
          {:ok, [map()]} | {:error, term()}
  defp evaluate_policies(policies, event_type, event_data, tenant_id) do
    results =
      Enum.map(policies, fn policy ->
        evaluate_single_policy(policy, event_type, event_data, tenant_id)
      end)

    {:ok, results}
  end

  defp evaluate_single_policy(policy, event_type, event_data, tenant_id) do
    policy_id = policy["id"]
    conditions = policy["conditions"] || []
    actions = policy["actions"] || []

    Logger.debug("Evaluating policy",
      policy_id: policy_id,
      conditions_count: length(conditions)
    )

    # Evaluate all conditions
    context = %{
      event_type: event_type,
      event_data: event_data,
      tenant_id: tenant_id,
      timestamp: DateTime.utc_now()
    }

    conditions_met = evaluate_conditions(conditions, context)

    %{
      policy_id: policy_id,
      policy_name: policy["name"],
      conditions_met: conditions_met,
      actions: if(conditions_met, do: actions, else: []),
      evaluated_at: DateTime.utc_now()
    }
  end

  defp evaluate_conditions([], _context), do: true

  defp evaluate_conditions(conditions, context) do
    Enum.all?(conditions, &evaluate_condition(&1, context))
  end

  defp evaluate_condition(
         %{"type" => "field_equals", "field" => field, "value" => value},
         context
       ) do
    actual = get_in(context.event_data, String.split(field, "."))
    actual == value
  end

  defp evaluate_condition(
         %{"type" => "field_contains", "field" => field, "value" => value},
         context
       ) do
    actual = get_in(context.event_data, String.split(field, "."))
    is_binary(actual) and String.contains?(actual, value)
  end

  defp evaluate_condition(
         %{"type" => "field_matches", "field" => field, "pattern" => pattern},
         context
       ) do
    actual = get_in(context.event_data, String.split(field, "."))
    is_binary(actual) and Regex.match?(~r/#{pattern}/, actual)
  end

  defp evaluate_condition(%{"type" => "field_exists", "field" => field}, context) do
    get_in(context.event_data, String.split(field, ".")) != nil
  end

  defp evaluate_condition(
         %{"type" => "time_window", "start" => start_hour, "end" => end_hour},
         _context
       ) do
    current_hour = DateTime.utc_now().hour
    current_hour >= start_hour and current_hour < end_hour
  end

  defp evaluate_condition(condition, _context) do
    Logger.warning("Unknown condition type", condition: condition)
    true
  end

  # Process evaluation results

  defp process_results(results, tenant_id) do
    Enum.each(results, fn result ->
      if result.conditions_met do
        Logger.info("Policy triggered",
          policy_id: result.policy_id,
          policy_name: result.policy_name
        )

        execute_actions(result.actions, tenant_id, result)
      end
    end)
  end

  defp execute_actions(actions, tenant_id, result) do
    Enum.each(actions, &execute_action(&1, tenant_id, result))
  end

  defp execute_action(
         %{"type" => "enqueue_job", "worker" => worker_name, "args" => args},
         tenant_id,
         _result
       ) do
    worker_module = get_worker_module(worker_name)

    job_args =
      args
      |> Map.put("tenant_id", tenant_id)

    case worker_module do
      nil ->
        Logger.warning("Unknown worker", worker: worker_name)

      module ->
        job = apply(module, :new, [job_args])
        Oban.insert(job)
    end
  end

  defp execute_action(
         %{"type" => "send_notification", "channel" => channel, "message" => message},
         tenant_id,
         _result
       ) do
    Cybernetic.Workers.NotificationSender.new(%{
      tenant_id: tenant_id,
      channel: channel,
      message: message
    })
    |> Oban.insert()
  end

  defp execute_action(%{"type" => "publish_event", "event_type" => event_type}, tenant_id, result) do
    Phoenix.PubSub.broadcast(
      Cybernetic.PubSub,
      "events:policy",
      {:event, event_type,
       %{
         tenant_id: tenant_id,
         policy_id: result.policy_id,
         timestamp: DateTime.utc_now()
       }}
    )
  end

  defp execute_action(action, _tenant_id, _result) do
    Logger.warning("Unknown action type", action: action)
  end

  defp get_worker_module("EpisodeAnalyzer"), do: Cybernetic.Workers.EpisodeAnalyzer
  defp get_worker_module("NotificationSender"), do: Cybernetic.Workers.NotificationSender
  defp get_worker_module("TelegramDispatcher"), do: Cybernetic.Workers.TelegramDispatcher
  defp get_worker_module(_), do: nil

  # Telemetry

  defp emit_telemetry(status, start_time, policy_count) do
    duration = System.monotonic_time(:millisecond) - start_time

    :telemetry.execute(
      @telemetry,
      %{duration: duration, count: 1, policies_evaluated: policy_count},
      %{status: status}
    )
  end
end
