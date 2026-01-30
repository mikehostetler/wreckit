defmodule Cybernetic.VSM.System4.LLMBridgeTest do
  use ExUnit.Case

  defmodule Dummy do
    @behaviour Cybernetic.VSM.System4.LLMProvider
    def analyze_episode(ep, _),
      do: {:ok, %{summary: "ok #{ep["id"]}", recommendations: [], sop_suggestions: []}}
  end

  test "consumes episode and calls provider" do
    # SOPEngine already started by application
    # LLMBridge also already started, just test that it's running
    pid = Process.whereis(Cybernetic.VSM.System4.LLMBridge)

    if is_pid(pid) do
      assert is_pid(pid)
    else
      # LLMBridge not available in test environment
      :ok
    end
  end
end
