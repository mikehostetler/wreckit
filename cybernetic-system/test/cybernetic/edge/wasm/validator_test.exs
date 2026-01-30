defmodule Cybernetic.Edge.WASMValidatorNoopTest do
  use ExUnit.Case, async: true

  test "noop impl loads and validates" do
    {:ok, inst} = Cybernetic.Edge.WASM.Validator.load(<<0, 0, 0>>, fuel: 10)

    assert {:ok, %{valid: true, noop: true}} =
             Cybernetic.Edge.WASM.Validator.validate(inst, %{"x" => 1})
  end
end
