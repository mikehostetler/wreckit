defmodule Cybernetic.Intelligence.Policy.RuntimeTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Intelligence.Policy.DSL
  alias Cybernetic.Intelligence.Policy.Runtime

  @eval_context %{
    context: %{
      user_id: "user_123",
      roles: [:editor, :viewer],
      authenticated: true,
      tenant_id: "tenant_abc"
    },
    resource: %{
      owner_id: "user_123",
      status: :draft
    },
    action: :edit,
    environment: %{}
  }

  describe "evaluate/3" do
    test "denies by default when no allow matches" do
      assert {:ok, policy} = DSL.parse("require :authenticated", name: "test")
      assert :deny = Runtime.evaluate(policy, @eval_context)
    end

    test "enforces role requirements" do
      assert {:ok, policy} = DSL.parse("require role: :editor\nallow", name: "test")
      assert :allow = Runtime.evaluate(policy, @eval_context)

      context = put_in(@eval_context[:context][:roles], [:viewer])
      assert :deny = Runtime.evaluate(policy, context)
    end

    test "enforces role list requirements" do
      assert {:ok, policy} = DSL.parse("require role in [:admin, :editor]\nallow", name: "test")
      assert :allow = Runtime.evaluate(policy, @eval_context)

      context = put_in(@eval_context[:context][:roles], [:viewer])
      assert :deny = Runtime.evaluate(policy, context)
    end

    test "matches non-allowlisted role atoms via string normalization" do
      # DSL keeps :ok as "ok" string; context may contain :ok atom.
      assert {:ok, policy} = DSL.parse("require role: :ok\nallow", name: "test")
      context = put_in(@eval_context[:context][:roles], [:ok])
      assert :allow = Runtime.evaluate(policy, context)
    end

    test "evaluates path equality" do
      assert {:ok, policy} =
               DSL.parse("require resource.owner_id == context.user_id\nallow", name: "test")

      assert :allow = Runtime.evaluate(policy, @eval_context)

      context = put_in(@eval_context[:resource][:owner_id], "other_user")
      assert :deny = Runtime.evaluate(policy, context)
    end

    test "compares atoms to atoms correctly" do
      # With atom DoS protection, allowed atoms stay as atoms
      # Ensure atom comparison works when context uses atoms
      assert {:ok, eq_policy} = DSL.parse("allow when: resource.status == :draft", name: "test")

      # Context uses atom :draft matching DSL atom :draft
      context = put_in(@eval_context[:resource][:status], :draft)
      assert :allow = Runtime.evaluate(eq_policy, context)

      assert {:ok, in_policy} =
               DSL.parse("allow when: resource.status in [:draft, :review]", name: "test")

      assert :allow = Runtime.evaluate(in_policy, context)
    end

    test "supports present?/blank?" do
      assert {:ok, policy} = DSL.parse("allow when: present? resource.owner_id", name: "test")
      assert :allow = Runtime.evaluate(policy, @eval_context)

      assert {:ok, policy} = DSL.parse("allow when: blank? resource.owner_id", name: "test")
      assert :deny = Runtime.evaluate(policy, @eval_context)

      assert {:ok, policy} = DSL.parse("allow when: blank? resource.missing_key", name: "test")
      assert :allow = Runtime.evaluate(policy, @eval_context)
    end

    test "supports compound expressions with and/or/not" do
      assert {:ok, policy} =
               DSL.parse("allow when: role: :editor and resource.status == :draft", name: "test")

      assert :allow = Runtime.evaluate(policy, @eval_context)

      assert {:ok, policy} = DSL.parse("allow when: role: :admin or role: :editor", name: "test")
      assert :allow = Runtime.evaluate(policy, @eval_context)

      assert {:ok, policy} = DSL.parse("allow when: not role: :admin", name: "test")
      assert :allow = Runtime.evaluate(policy, @eval_context)
    end
  end

  describe "evaluate_all/3" do
    test "deny wins across policies" do
      assert {:ok, allow_policy} = DSL.parse("allow", name: "allow")
      assert {:ok, deny_policy} = DSL.parse("deny", name: "deny")

      assert :deny = Runtime.evaluate_all([allow_policy, deny_policy], @eval_context)
    end

    test "empty policy list denies" do
      assert :deny = Runtime.evaluate_all([], @eval_context)
    end
  end
end
