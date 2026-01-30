defmodule Cybernetic.Intelligence.Policy.DSLTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Intelligence.Policy.DSL

  defp rules!(%{ast: {:policy, rules}}), do: rules

  describe "parse/2" do
    test "parses basic rules into an AST" do
      dsl = """
      require :authenticated
      allow
      """

      assert {:ok, policy} = DSL.parse(dsl, name: "test")
      assert policy.name == "test"

      assert [
               {:require, :authenticated},
               {:allow, true}
             ] = rules!(policy)
    end

    test "parses role requirements" do
      assert {:ok, policy} = DSL.parse("require role: :admin\nallow", name: "test")
      assert [{:require, {:role, :admin}}, {:allow, true}] = rules!(policy)
    end

    test "parses role list requirements" do
      assert {:ok, policy} = DSL.parse("require role in [:admin, :editor]\nallow", name: "test")
      assert [{:require, {:any_role, [:admin, :editor]}}, {:allow, true}] = rules!(policy)
    end

    test "parses present?/blank?" do
      assert {:ok, present_policy} =
               DSL.parse("allow when: present? resource.owner_id", name: "test")

      assert [{:allow, {:present, ["resource", "owner_id"]}}] = rules!(present_policy)

      assert {:ok, blank_policy} = DSL.parse("allow when: blank? context.user_id", name: "test")
      assert [{:allow, {:blank, ["context", "user_id"]}}] = rules!(blank_policy)
    end

    test "parses role conditions inside allow/deny clauses" do
      assert {:ok, policy} = DSL.parse("allow when: role: :admin", name: "test")
      assert [{:allow, {:role, :admin}}] = rules!(policy)

      assert {:ok, policy} = DSL.parse("deny when: role in [:admin, :editor]", name: "test")
      assert [{:deny, {:any_role, [:admin, :editor]}}] = rules!(policy)
    end

    test "parses compound expressions that include role/present?" do
      dsl = "allow when: role: :admin and present? resource.owner_id"
      assert {:ok, policy} = DSL.parse(dsl, name: "test")

      assert [{:allow, {:and, [{:role, :admin}, {:present, ["resource", "owner_id"]}]}}] =
               rules!(policy)
    end

    test "keeps non-allowlisted atoms as strings (safe)" do
      # :ok exists as an atom, but is not allowlisted by the DSL
      assert {:ok, policy} = DSL.parse("require role: :ok\nallow", name: "test")
      assert [{:require, {:role, "ok"}}, {:allow, true}] = rules!(policy)

      # Unknown atom stays as a string without creating a new atom
      assert {:ok, policy} = DSL.parse("require role: :unknown_role_xyz\nallow", name: "test")
      assert [{:require, {:role, "unknown_role_xyz"}}, {:allow, true}] = rules!(policy)
    end

    test "allowlisted status atoms are converted" do
      assert {:ok, policy} =
               DSL.parse("allow when: resource.status in [:draft, :published]", name: "test")

      assert [{:allow, {:in, ["resource", "status"], values}}] = rules!(policy)
      assert :draft in values
      assert :published in values
    end
  end

  describe "validate/1" do
    test "validates parsed policies" do
      assert {:ok, policy} = DSL.parse("require :authenticated\nallow", name: "test")
      assert :ok = DSL.validate(policy)
    end
  end

  describe "serialize/deserialize" do
    test "round-trips policies" do
      assert {:ok, policy} = DSL.parse("require :authenticated\nallow", name: "test")

      binary = DSL.serialize(policy)
      assert is_binary(binary)

      assert {:ok, restored} = DSL.deserialize(binary)
      assert restored.name == policy.name
      assert restored.ast == policy.ast
    end
  end

  describe "format/1" do
    test "formats policies back to a readable DSL" do
      assert {:ok, policy} = DSL.parse("require :authenticated\nallow", name: "test")
      formatted = DSL.format(policy)
      assert formatted =~ "policy \"test\""
      assert formatted =~ "require :authenticated"
      assert formatted =~ "allow"
    end
  end

  describe "operator precedence safety" do
    test "rejects ambiguous AND/OR expressions" do
      # Mixing AND and OR without parentheses is ambiguous and rejected
      dsl = "allow when: role == :admin or status == :draft and owner_id == user_id"

      assert_raise ArgumentError, ~r/Ambiguous condition/, fn ->
        DSL.parse(dsl, name: "test")
      end
    end

    test "allows pure AND expressions" do
      dsl = "allow when: role == :admin and status == :draft and tenant_id == context.tenant"

      assert {:ok, policy} = DSL.parse(dsl, name: "test")
      assert [{:allow, {:and, conditions}}] = rules!(policy)
      assert length(conditions) == 3
    end

    test "allows pure OR expressions" do
      dsl = "allow when: role == :admin or role == :editor or role == :owner"

      assert {:ok, policy} = DSL.parse(dsl, name: "test")
      assert [{:allow, {:or, conditions}}] = rules!(policy)
      assert length(conditions) == 3
    end

    test "separate rules can express OR logic safely" do
      # This is the recommended pattern instead of mixing AND/OR
      dsl = """
      allow when: role == :admin
      allow when: status == :draft and owner_id == context.user_id
      """

      assert {:ok, policy} = DSL.parse(dsl, name: "test")
      rules = rules!(policy)
      assert length(rules) == 2
    end

    test "NOT operator works with simple conditions" do
      dsl = "deny when: not role == :admin"

      assert {:ok, policy} = DSL.parse(dsl, name: "test")
      assert [{:deny, {:not, {:eq, ["role"], :admin}}}] = rules!(policy)
    end
  end
end
