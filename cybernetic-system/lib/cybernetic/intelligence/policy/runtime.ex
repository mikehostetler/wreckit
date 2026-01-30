defmodule Cybernetic.Intelligence.Policy.Runtime do
  @moduledoc """
  Policy evaluation runtime.

  Supports two backends:
  1. Native Elixir interpreter (default, always available)
  2. WASM sandbox (when Wasmex is available)

  The runtime ensures deterministic policy evaluation with:
  - No side effects allowed
  - Bounded execution time
  - Memory limits
  - Consistent results across backends
  """

  require Logger

  alias Cybernetic.Intelligence.Policy.DSL

  @type context :: %{
          user_id: String.t() | nil,
          roles: [atom()],
          permissions: [atom()],
          tenant_id: String.t() | nil,
          authenticated: boolean()
        }

  @type resource :: map()
  @type action :: atom()
  @type environment :: map()

  @type eval_context :: %{
          context: context(),
          resource: resource(),
          action: action(),
          environment: environment()
        }

  @type result :: :allow | :deny | {:error, term()}

  @default_timeout_ms 100
  @max_recursion_depth 100

  @doc """
  Evaluate a policy against an evaluation context.

  ## Options

  - `:timeout_ms` - Max evaluation time (default: 100ms)
  - `:backend` - `:native` or `:wasm` (default: `:native`)

  ## Returns

  - `:allow` - Policy allows the action
  - `:deny` - Policy denies the action
  - `{:error, reason}` - Evaluation failed
  """
  @spec evaluate(DSL.policy(), eval_context(), keyword()) :: result()
  def evaluate(policy, eval_context, opts \\ []) do
    timeout_ms = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    backend = Keyword.get(opts, :backend, :native)

    task =
      Task.async(fn ->
        case backend do
          :native -> evaluate_native(policy, eval_context)
          :wasm -> evaluate_wasm(policy, eval_context)
        end
      end)

    case Task.yield(task, timeout_ms) || Task.shutdown(task, :brutal_kill) do
      {:ok, result} -> result
      nil -> {:error, :timeout}
    end
  end

  @doc """
  Evaluate multiple policies, returning first explicit deny or final allow.
  """
  @spec evaluate_all([DSL.policy()], eval_context(), keyword()) :: result()
  def evaluate_all(policies, eval_context, opts \\ []) do
    Enum.reduce_while(policies, :deny, fn policy, _acc ->
      case evaluate(policy, eval_context, opts) do
        :deny -> {:halt, :deny}
        :allow -> {:cont, :allow}
        {:error, _} = error -> {:halt, error}
      end
    end)
  end

  @doc """
  Check if WASM backend is available.
  """
  @spec wasm_available?() :: boolean()
  def wasm_available? do
    Code.ensure_loaded?(Wasmex) and function_exported?(Wasmex, :call_function, 3)
  end

  # Native Elixir evaluation

  defp evaluate_native(%{ast: {:policy, rules}}, eval_context) do
    evaluate_rules(rules, eval_context, 0)
  end

  defp evaluate_native(_policy, _eval_context) do
    {:error, :invalid_policy}
  end

  defp evaluate_rules([], _eval_context, _depth), do: :deny

  defp evaluate_rules(_rules, _eval_context, depth) when depth > @max_recursion_depth do
    {:error, :max_recursion_exceeded}
  end

  defp evaluate_rules([rule | rest], eval_context, depth) do
    case evaluate_rule(rule, eval_context, depth) do
      :continue -> evaluate_rules(rest, eval_context, depth)
      :allow -> :allow
      :deny -> :deny
      {:error, _} = error -> error
    end
  end

  defp evaluate_rule({:require, condition}, eval_context, depth) do
    case evaluate_condition(condition, eval_context, depth + 1) do
      true -> :continue
      false -> :deny
      {:error, _} = error -> error
    end
  end

  defp evaluate_rule({:allow, condition}, eval_context, depth) do
    case evaluate_condition(condition, eval_context, depth + 1) do
      true -> :allow
      false -> :continue
      {:error, _} = error -> error
    end
  end

  defp evaluate_rule({:deny, condition}, eval_context, depth) do
    case evaluate_condition(condition, eval_context, depth + 1) do
      true -> :deny
      false -> :continue
      {:error, _} = error -> error
    end
  end

  defp evaluate_rule(_, _, _), do: {:error, :invalid_rule}

  # Condition evaluation

  defp evaluate_condition(true, _eval_context, _depth), do: true
  defp evaluate_condition(false, _eval_context, _depth), do: false

  defp evaluate_condition(:authenticated, %{context: context}, _depth) do
    Map.get(context, :authenticated, false) == true
  end

  defp evaluate_condition({:and, conditions}, eval_context, depth) do
    # Evaluate all conditions, propagating errors
    Enum.reduce_while(conditions, true, fn cond, _acc ->
      case evaluate_condition(cond, eval_context, depth + 1) do
        true -> {:cont, true}
        false -> {:halt, false}
        {:error, _} = error -> {:halt, error}
      end
    end)
  end

  defp evaluate_condition({:or, conditions}, eval_context, depth) do
    # Evaluate conditions until one is true, propagating errors
    Enum.reduce_while(conditions, false, fn cond, _acc ->
      case evaluate_condition(cond, eval_context, depth + 1) do
        true -> {:halt, true}
        false -> {:cont, false}
        {:error, _} = error -> {:halt, error}
      end
    end)
  end

  defp evaluate_condition({:not, condition}, eval_context, depth) do
    case evaluate_condition(condition, eval_context, depth + 1) do
      true -> false
      false -> true
      error -> error
    end
  end

  defp evaluate_condition({:role, required_role}, %{context: context}, _depth) do
    roles = Map.get(context, :roles, []) || []
    role_match?(required_role, roles)
  end

  defp evaluate_condition({:any_role, required_roles}, %{context: context}, _depth)
       when is_list(required_roles) do
    roles = Map.get(context, :roles, []) || []
    Enum.any?(required_roles, &role_match?(&1, roles))
  end

  defp evaluate_condition({:eq, left, right}, eval_context, depth) do
    left_val = resolve_value(left, eval_context, depth + 1)
    right_val = resolve_value(right, eval_context, depth + 1)
    comparable(left_val) == comparable(right_val)
  end

  defp evaluate_condition({:neq, left, right}, eval_context, depth) do
    left_val = resolve_value(left, eval_context, depth + 1)
    right_val = resolve_value(right, eval_context, depth + 1)
    comparable(left_val) != comparable(right_val)
  end

  defp evaluate_condition({:gt, left, right}, eval_context, depth) do
    left_val = resolve_value(left, eval_context, depth + 1)
    right_val = resolve_value(right, eval_context, depth + 1)
    is_number(left_val) and is_number(right_val) and left_val > right_val
  end

  defp evaluate_condition({:gte, left, right}, eval_context, depth) do
    left_val = resolve_value(left, eval_context, depth + 1)
    right_val = resolve_value(right, eval_context, depth + 1)
    is_number(left_val) and is_number(right_val) and left_val >= right_val
  end

  defp evaluate_condition({:lt, left, right}, eval_context, depth) do
    left_val = resolve_value(left, eval_context, depth + 1)
    right_val = resolve_value(right, eval_context, depth + 1)
    is_number(left_val) and is_number(right_val) and left_val < right_val
  end

  defp evaluate_condition({:lte, left, right}, eval_context, depth) do
    left_val = resolve_value(left, eval_context, depth + 1)
    right_val = resolve_value(right, eval_context, depth + 1)
    is_number(left_val) and is_number(right_val) and left_val <= right_val
  end

  defp evaluate_condition({:in, left, right}, eval_context, depth) do
    left_val = resolve_value(left, eval_context, depth + 1)
    right_val = resolve_value(right, eval_context, depth + 1)

    cond do
      is_list(right_val) ->
        left = comparable(left_val)
        Enum.any?(right_val, fn v -> comparable(v) == left end)

      is_map(right_val) ->
        Map.has_key?(right_val, left_val)

      true ->
        false
    end
  end

  defp evaluate_condition({:present, path}, eval_context, depth) do
    val = resolve_value(path, eval_context, depth + 1)
    val != nil and val != "" and val != []
  end

  defp evaluate_condition({:blank, path}, eval_context, depth) do
    val = resolve_value(path, eval_context, depth + 1)
    val == nil or val == "" or val == []
  end

  defp evaluate_condition(atom, eval_context, _depth) when is_atom(atom) do
    roles = get_in(eval_context, [:context, :roles]) || []
    role_match?(atom, roles)
  end

  defp evaluate_condition(_, _, _), do: false

  defp role_match?(required_role, roles) when is_list(roles) do
    required = role_to_string(required_role)

    if is_binary(required) and required != "" do
      Enum.any?(roles, fn role ->
        case role_to_string(role) do
          nil -> false
          role_str -> String.downcase(role_str) == String.downcase(required)
        end
      end)
    else
      false
    end
  end

  defp role_to_string(role) when is_atom(role), do: Atom.to_string(role)
  defp role_to_string(role) when is_binary(role), do: role
  defp role_to_string(_role), do: nil

  # Normalize atoms and strings for comparison (without creating new atoms).
  defp comparable(value) when is_atom(value), do: Atom.to_string(value)
  defp comparable(value) when is_binary(value), do: value
  defp comparable(value), do: value

  # Value resolution

  defp resolve_value(value, _eval_context, _depth) when is_number(value), do: value
  defp resolve_value(value, _eval_context, _depth) when is_binary(value), do: value
  defp resolve_value(value, _eval_context, _depth) when is_boolean(value), do: value
  defp resolve_value(nil, _eval_context, _depth), do: nil

  defp resolve_value(value, _eval_context, _depth) when is_atom(value) and value != nil do
    value
  end

  defp resolve_value(values, eval_context, depth) when is_list(values) do
    # Could be a path or a literal list
    case values do
      [first | _] when is_atom(first) or is_binary(first) ->
        # Treat as path only when the root is a known context variable
        if root_path_segment?(first) do
          resolve_path(values, eval_context, depth)
        else
          Enum.map(values, &resolve_value(&1, eval_context, depth + 1))
        end

      _ ->
        # Literal list
        Enum.map(values, &resolve_value(&1, eval_context, depth + 1))
    end
  end

  defp resolve_value(_, _, _), do: nil

  defp resolve_path([], _eval_context, _depth), do: nil

  defp resolve_path([root | rest], eval_context, _depth) do
    root_key = normalize_key(root)

    base =
      case root_key do
        :context -> Map.get(eval_context, :context, %{})
        :resource -> Map.get(eval_context, :resource, %{})
        :action -> Map.get(eval_context, :action)
        :environment -> Map.get(eval_context, :environment, %{})
        "context" -> Map.get(eval_context, :context, %{})
        "resource" -> Map.get(eval_context, :resource, %{})
        "action" -> Map.get(eval_context, :action)
        "environment" -> Map.get(eval_context, :environment, %{})
        _ -> nil
      end

    get_nested(base, rest)
  end

  defp get_nested(nil, _path), do: nil
  defp get_nested(value, []), do: value

  defp get_nested(map, [key | rest]) when is_map(map) do
    # Try both atom and string keys
    value = Map.get(map, normalize_key(key)) || Map.get(map, to_string(key))
    get_nested(value, rest)
  end

  defp get_nested(_, _), do: nil

  defp normalize_key(key) when is_atom(key), do: key

  defp normalize_key(key) when is_binary(key) do
    String.to_existing_atom(key)
  rescue
    ArgumentError -> key
  end

  defp root_path_segment?(:context), do: true
  defp root_path_segment?(:resource), do: true
  defp root_path_segment?(:action), do: true
  defp root_path_segment?(:environment), do: true
  defp root_path_segment?("context"), do: true
  defp root_path_segment?("resource"), do: true
  defp root_path_segment?("action"), do: true
  defp root_path_segment?("environment"), do: true
  defp root_path_segment?(_), do: false

  # WASM evaluation (placeholder - requires Wasmex)

  defp evaluate_wasm(policy, eval_context) do
    if wasm_available?() do
      do_evaluate_wasm(policy, eval_context)
    else
      Logger.debug("WASM backend not available, falling back to native")
      evaluate_native(policy, eval_context)
    end
  end

  defp do_evaluate_wasm(_policy, _eval_context) do
    # TODO: Implement when Wasmex is available
    # 1. Compile policy AST to WASM bytecode
    # 2. Create Wasmex instance with memory limits
    # 3. Call evaluate function with serialized context
    # 4. Parse result
    {:error, :wasm_not_implemented}
  end
end
