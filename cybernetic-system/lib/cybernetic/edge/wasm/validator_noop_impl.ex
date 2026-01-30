defmodule Cybernetic.Edge.WASM.Validator.NoopImpl do
  @moduledoc false
  @behaviour Cybernetic.Edge.WASM.Behaviour
  @impl true
  def load(_bytes, _opts), do: {:ok, :noop}
  @impl true
  def validate(_inst, _message, _opts), do: {:ok, %{valid: true, noop: true}}
end
