defmodule Cybernetic.Intelligence.Policy.DSL do
  @moduledoc """
  Policy Definition Language for declarative access control and business rules.

  The DSL compiles to an AST that can be:
  1. Interpreted directly in Elixir (default)
  2. Compiled to WASM for sandboxed execution (when Wasmex available)

  ## Syntax

      # Line-based DSL (supported):
      require :authenticated
      require role: :editor
      require resource.owner_id == context.user_id
      allow when: resource.status in [:draft, :review]

  ## Operators

  - Comparison: `==`, `!=`, `>`, `>=`, `<`, `<=`
  - Logical: `and`, `or`, `not`
  - Membership: `in`
  - Existence: `present?`, `blank?`

  ## Grammar Limitations

  **Important**: The parser uses simple string splitting for logical operators.
  To avoid subtle authorization bugs:

  1. **No mixed AND/OR**: Expressions like `a or b and c` are rejected as ambiguous.
     Split into separate rules instead:
     ```
     # Instead of: allow when: role == :admin or status == :draft and owner_id == user_id
     # Use separate rules:
     allow when: role == :admin
     allow when: status == :draft and owner_id == user_id
     ```

  2. **No parentheses**: Grouping with `()` is not supported.

  3. **AND has implicit precedence**: Within a single `and` or `or` expression,
     all conditions are grouped together (left-to-right evaluation).

  ## Context Variables

  - `context` - Runtime context (user_id, roles, tenant_id, etc.)
  - `resource` - The resource being accessed
  - `action` - The action being performed
  - `environment` - Environment variables (time, ip, etc.)

  ## Security

  Atom values are restricted to a known allowlist to prevent atom table exhaustion.
  Unknown atoms are kept as strings and matched at runtime.
  """

  # Allowlist of atoms that can be created from DSL input
  # All other values stay as strings to prevent atom table exhaustion (DoS)
  @allowed_atoms ~w(
    authenticated admin editor viewer operator guest
    draft review published archived deleted
    read write delete create update execute
    context resource action environment
    true false nil
  )a

  @type ast :: term()
  @type policy :: %{
          name: String.t(),
          version: pos_integer(),
          ast: ast(),
          metadata: map()
        }

  @doc """
  Parse a policy from DSL string.

  ## Examples

      iex> DSL.parse(\"\"\"
      ...>   require :authenticated
      ...>   require role in [:admin, :editor]
      ...>   allow
      ...> \"\"\")
      {:ok, %{...}}
  """
  @spec parse(String.t(), keyword()) :: {:ok, policy()} | {:error, term()}
  def parse(source, opts \\ []) when is_binary(source) do
    name = Keyword.get(opts, :name, "unnamed")
    version = Keyword.get(opts, :version, 1)

    case do_parse(source) do
      {:ok, ast} ->
        policy = %{
          name: name,
          version: version,
          ast: ast,
          metadata: %{
            parsed_at: DateTime.utc_now(),
            source_hash: :crypto.hash(:sha256, source) |> Base.encode16()
          }
        }

        {:ok, policy}

      {:error, reason} ->
        {:error, {:parse_error, reason}}
    end
  end

  @doc """
  Parse a policy from keyword list (programmatic definition).

  ## Examples

      iex> DSL.from_rules([
      ...>   {:require, :authenticated},
      ...>   {:require, {:in, :role, [:admin, :editor]}},
      ...>   {:allow, true}
      ...> ])
      {:ok, %{...}}
  """
  @spec from_rules([tuple()], keyword()) :: {:ok, policy()} | {:error, term()}
  def from_rules(rules, opts \\ []) when is_list(rules) do
    name = Keyword.get(opts, :name, "unnamed")
    version = Keyword.get(opts, :version, 1)

    case validate_rules(rules) do
      :ok ->
        ast = {:policy, rules}

        policy = %{
          name: name,
          version: version,
          ast: ast,
          metadata: %{
            parsed_at: DateTime.utc_now()
          }
        }

        {:ok, policy}

      {:error, reason} ->
        {:error, {:validation_error, reason}}
    end
  end

  @doc """
  Validate a policy AST.
  """
  @spec validate(policy()) :: :ok | {:error, term()}
  def validate(%{ast: ast}) do
    case validate_ast(ast) do
      :ok -> :ok
      {:error, reason} -> {:error, {:invalid_ast, reason}}
    end
  end

  @doc """
  Serialize policy to binary.
  """
  @spec serialize(policy()) :: binary()
  def serialize(policy) do
    :erlang.term_to_binary(policy)
  end

  @doc """
  Deserialize policy from binary.
  """
  @spec deserialize(binary()) :: {:ok, policy()} | {:error, term()}
  def deserialize(binary) when is_binary(binary) do
    try do
      policy = :erlang.binary_to_term(binary, [:safe])

      if is_map(policy) and Map.has_key?(policy, :ast) do
        {:ok, policy}
      else
        {:error, :invalid_policy}
      end
    rescue
      _ -> {:error, :deserialize_failed}
    end
  end

  @doc """
  Pretty-print a policy AST.
  """
  @spec format(policy()) :: String.t()
  def format(%{name: name, ast: {:policy, rules}}) do
    formatted_rules =
      Enum.map(rules, &format_rule/1)
      |> Enum.join("\n  ")

    "policy \"#{name}\" do\n  #{formatted_rules}\nend"
  end

  def format(%{name: name, ast: ast}) do
    "policy \"#{name}\" do\n  #{inspect(ast)}\nend"
  end

  # Private parsing

  defp do_parse(source) do
    lines =
      source
      |> String.split("\n")
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == "" or String.starts_with?(&1, "#")))

    rules =
      Enum.map(lines, fn line ->
        cond do
          String.starts_with?(line, "require ") ->
            parse_require(String.replace_prefix(line, "require ", ""))

          String.starts_with?(line, "deny ") ->
            parse_deny(String.replace_prefix(line, "deny ", ""))

          String.starts_with?(line, "allow ") ->
            parse_allow(String.replace_prefix(line, "allow ", ""))

          line == "allow" ->
            {:allow, true}

          line == "deny" ->
            {:deny, true}

          true ->
            {:error, {:unknown_directive, line}}
        end
      end)

    errors = Enum.filter(rules, &match?({:error, _}, &1))

    if errors == [] do
      {:ok, {:policy, rules}}
    else
      {:error, errors}
    end
  end

  defp parse_require(expr) do
    cond do
      expr == ":authenticated" ->
        {:require, :authenticated}

      String.starts_with?(expr, "role in ") ->
        [_left, right] = String.split(expr, " in ", parts: 2)
        {:require, {:any_role, parse_list(right)}}

      String.starts_with?(expr, "role:") ->
        role =
          expr
          |> String.replace_prefix("role:", "")
          |> String.trim()
          |> parse_atom_or_string()

        {:require, {:role, role}}

      String.contains?(expr, " in ") ->
        [left, right] = String.split(expr, " in ", parts: 2)
        {:require, {:in, parse_path(left), parse_list(right)}}

      String.contains?(expr, "==") ->
        [left, right] = String.split(expr, "==", parts: 2)
        {:require, {:eq, parse_path(String.trim(left)), parse_value(String.trim(right))}}

      String.contains?(expr, "!=") ->
        [left, right] = String.split(expr, "!=", parts: 2)
        {:require, {:neq, parse_path(String.trim(left)), parse_value(String.trim(right))}}

      true ->
        {:require, parse_atom_or_string(expr)}
    end
  end

  defp parse_allow(expr) do
    cond do
      String.starts_with?(expr, "when:") ->
        condition = String.replace_prefix(expr, "when:", "") |> String.trim()
        {:allow, parse_condition(condition)}

      expr == "" ->
        {:allow, true}

      true ->
        {:allow, parse_condition(expr)}
    end
  end

  defp parse_deny(expr) do
    cond do
      String.starts_with?(expr, "when:") ->
        condition = String.replace_prefix(expr, "when:", "") |> String.trim()
        {:deny, parse_condition(condition)}

      expr == "" ->
        {:deny, true}

      true ->
        {:deny, parse_condition(expr)}
    end
  end

  defp parse_condition(expr) do
    # SECURITY: Reject ambiguous expressions mixing AND/OR without parentheses.
    # We intentionally RAISE here (not return {:error, _}) because:
    # 1. This is a compile-time security check that must fail loudly
    # 2. Silent errors could lead to deployed policies with bypass vulnerabilities
    # 3. Policy authors must fix ambiguity before the policy can be used
    # This follows the "fail fast" principle for security-critical code.
    has_and = String.contains?(expr, " and ")
    has_or = String.contains?(expr, " or ")

    if has_and and has_or do
      raise ArgumentError,
            "Ambiguous condition: '#{expr}' mixes 'and' and 'or' without parentheses. " <>
              "Use separate rules or explicit grouping to avoid precedence issues."
    end

    cond do
      has_and ->
        parts = String.split(expr, " and ")
        {:and, Enum.map(parts, &parse_condition/1)}

      has_or ->
        parts = String.split(expr, " or ")
        {:or, Enum.map(parts, &parse_condition/1)}

      String.starts_with?(expr, "not ") ->
        {:not, parse_condition(String.replace_prefix(expr, "not ", ""))}

      String.starts_with?(expr, "present? ") ->
        path = String.replace_prefix(expr, "present? ", "") |> String.trim()
        {:present, parse_path(path)}

      String.starts_with?(expr, "blank? ") ->
        path = String.replace_prefix(expr, "blank? ", "") |> String.trim()
        {:blank, parse_path(path)}

      String.starts_with?(expr, "role in ") ->
        [_left, right] = String.split(expr, " in ", parts: 2)
        {:any_role, parse_list(right)}

      String.starts_with?(expr, "role:") ->
        role =
          expr
          |> String.replace_prefix("role:", "")
          |> String.trim()
          |> parse_atom_or_string()

        {:role, role}

      String.contains?(expr, " in ") ->
        [left, right] = String.split(expr, " in ", parts: 2)
        {:in, parse_path(left), parse_list(right)}

      String.contains?(expr, "==") ->
        [left, right] = String.split(expr, "==", parts: 2)
        {:eq, parse_path(String.trim(left)), parse_value(String.trim(right))}

      String.contains?(expr, "!=") ->
        [left, right] = String.split(expr, "!=", parts: 2)
        {:neq, parse_path(String.trim(left)), parse_value(String.trim(right))}

      String.contains?(expr, ">=") ->
        [left, right] = String.split(expr, ">=", parts: 2)
        {:gte, parse_path(String.trim(left)), parse_value(String.trim(right))}

      String.contains?(expr, "<=") ->
        [left, right] = String.split(expr, "<=", parts: 2)
        {:lte, parse_path(String.trim(left)), parse_value(String.trim(right))}

      String.contains?(expr, ">") ->
        [left, right] = String.split(expr, ">", parts: 2)
        {:gt, parse_path(String.trim(left)), parse_value(String.trim(right))}

      String.contains?(expr, "<") ->
        [left, right] = String.split(expr, "<", parts: 2)
        {:lt, parse_path(String.trim(left)), parse_value(String.trim(right))}

      true ->
        parse_atom_or_string(expr)
    end
  end

  defp parse_path(str) do
    str
    |> String.trim()
    |> String.split(".")
    |> Enum.map(&parse_atom_or_string/1)
  end

  defp parse_list(str) do
    str
    |> String.trim()
    |> String.trim_leading("[")
    |> String.trim_trailing("]")
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.map(&parse_value/1)
  end

  defp parse_value(str) do
    str = String.trim(str)

    cond do
      String.starts_with?(str, ":") ->
        # Use safe_to_atom to prevent atom DoS
        String.replace_prefix(str, ":", "") |> safe_to_atom()

      String.starts_with?(str, "\"") and String.ends_with?(str, "\"") ->
        String.slice(str, 1..-2//1)

      String.starts_with?(str, "'") and String.ends_with?(str, "'") ->
        String.slice(str, 1..-2//1)

      str =~ ~r/^\d+$/ ->
        String.to_integer(str)

      str =~ ~r/^\d+\.\d+$/ ->
        String.to_float(str)

      str == "true" ->
        true

      str == "false" ->
        false

      str == "nil" ->
        nil

      String.contains?(str, ".") ->
        parse_path(str)

      true ->
        str
    end
  end

  defp parse_atom_or_string(str) do
    str = String.trim(str)

    if String.starts_with?(str, ":") do
      # Use safe_to_atom to prevent atom DoS
      String.replace_prefix(str, ":", "") |> safe_to_atom()
    else
      str
    end
  end

  # Convert string to atom only if in allowlist, otherwise keep as string
  # This prevents atom table exhaustion attacks
  defp safe_to_atom(str) when is_binary(str) do
    atom = String.to_existing_atom(str)
    if atom in @allowed_atoms, do: atom, else: str
  rescue
    ArgumentError -> str
  end

  defp validate_rules(rules) do
    invalid =
      Enum.reject(rules, fn
        {:require, _} -> true
        {:allow, _} -> true
        {:deny, _} -> true
        _ -> false
      end)

    if invalid == [] do
      :ok
    else
      {:error, {:invalid_rules, invalid}}
    end
  end

  defp validate_ast({:policy, rules}) when is_list(rules) do
    Enum.reduce_while(rules, :ok, fn rule, _acc ->
      case validate_rule(rule) do
        :ok -> {:cont, :ok}
        error -> {:halt, error}
      end
    end)
  end

  defp validate_ast(_), do: {:error, :invalid_structure}

  defp validate_rule({:require, _}), do: :ok
  defp validate_rule({:allow, _}), do: :ok
  defp validate_rule({:deny, _}), do: :ok
  defp validate_rule(rule), do: {:error, {:invalid_rule, rule}}

  defp format_rule({:require, :authenticated}), do: "require :authenticated"
  defp format_rule({:require, {:role, role}}), do: "require role: #{inspect(role)}"
  defp format_rule({:require, {:any_role, roles}}), do: "require role in #{inspect(roles)}"
  defp format_rule({:require, {:eq, :role, role}}), do: "require role: #{inspect(role)}"

  defp format_rule({:require, {:in, path, values}}),
    do: "require #{format_path(path)} in #{inspect(values)}"

  defp format_rule({:require, condition}), do: "require #{format_condition(condition)}"
  defp format_rule({:allow, true}), do: "allow"
  defp format_rule({:allow, condition}), do: "allow when: #{format_condition(condition)}"
  defp format_rule({:deny, true}), do: "deny"
  defp format_rule({:deny, condition}), do: "deny when: #{format_condition(condition)}"

  defp format_path(path) when is_list(path), do: Enum.join(path, ".")
  defp format_path(path), do: to_string(path)

  defp format_condition({:and, conditions}),
    do: Enum.map(conditions, &format_condition/1) |> Enum.join(" and ")

  defp format_condition({:or, conditions}),
    do: Enum.map(conditions, &format_condition/1) |> Enum.join(" or ")

  defp format_condition({:not, condition}), do: "not #{format_condition(condition)}"
  defp format_condition({:role, role}), do: "role: #{inspect(role)}"
  defp format_condition({:any_role, roles}), do: "role in #{inspect(roles)}"
  defp format_condition({:present, path}), do: "present? #{format_path(path)}"
  defp format_condition({:blank, path}), do: "blank? #{format_path(path)}"
  defp format_condition({:eq, left, right}), do: "#{format_path(left)} == #{inspect(right)}"
  defp format_condition({:neq, left, right}), do: "#{format_path(left)} != #{inspect(right)}"
  defp format_condition({:in, left, right}), do: "#{format_path(left)} in #{inspect(right)}"
  defp format_condition(other), do: inspect(other)
end
