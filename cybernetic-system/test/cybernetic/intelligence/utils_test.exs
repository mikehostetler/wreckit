defmodule Cybernetic.Intelligence.UtilsTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Intelligence.Utils

  describe "generate_id/0" do
    test "generates 32-character hex string" do
      id = Utils.generate_id()
      assert is_binary(id)
      assert String.length(id) == 32
      assert String.match?(id, ~r/^[a-f0-9]{32}$/)
    end

    test "generates unique IDs" do
      ids = for _ <- 1..100, do: Utils.generate_id()
      assert length(Enum.uniq(ids)) == 100
    end
  end

  describe "generate_node_id/0" do
    test "generates node ID with prefix" do
      node_id = Utils.generate_node_id()
      assert is_binary(node_id)
      assert String.starts_with?(node_id, "node_")
    end

    test "contains node name" do
      node_id = Utils.generate_node_id()
      node_str = Node.self() |> to_string() |> String.replace("@", "_")
      assert String.contains?(node_id, node_str)
    end
  end

  describe "to_callable/1" do
    test "wraps MFA tuple" do
      result = Utils.to_callable({Kernel, :exit, [:normal]})
      assert {:mfa, {Kernel, :exit, [:normal]}} = result
    end

    test "wraps anonymous function" do
      fun = fn -> :ok end
      result = Utils.to_callable(fun)
      assert {:fun, ^fun} = result
    end
  end

  describe "execute_callable/2" do
    test "executes MFA callable" do
      callable = {:mfa, {String, :upcase, ["hello"]}}
      result = Utils.execute_callable(callable, [])
      assert result == "HELLO"
    end

    test "executes MFA with extra args" do
      callable = {:mfa, {Enum, :sum, []}}
      result = Utils.execute_callable(callable, [[1, 2, 3]])
      assert result == 6
    end

    test "executes function callable" do
      callable = {:fun, fn x -> x * 2 end}
      result = Utils.execute_callable(callable, [5])
      assert result == 10
    end
  end

  describe "truncate_list/2" do
    test "keeps list if under max" do
      list = [1, 2, 3]
      assert Utils.truncate_list(list, 5) == [1, 2, 3]
    end

    test "truncates to max size" do
      list = [1, 2, 3, 4, 5]
      assert Utils.truncate_list(list, 3) == [1, 2, 3]
    end

    test "handles empty list" do
      assert Utils.truncate_list([], 10) == []
    end

    test "handles zero max" do
      assert Utils.truncate_list([1, 2, 3], 0) == []
    end
  end

  describe "safe_div/3" do
    test "divides normally" do
      assert Utils.safe_div(10, 2, 0) == 5.0
    end

    test "returns default for zero integer divisor" do
      assert Utils.safe_div(10, 0, -1) == -1
    end

    test "returns default for zero float divisor" do
      assert Utils.safe_div(10, 0.0, -1) == -1
    end

    test "handles float division" do
      assert Utils.safe_div(7.5, 2.5, 0) == 3.0
    end
  end
end
