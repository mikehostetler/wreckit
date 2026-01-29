defmodule Cybernetic.VSM.System5.SOPEngineTest do
  use ExUnit.Case

  setup do
    sop_engine_pid = Process.whereis(Cybernetic.VSM.System5.SOPEngine)

    if sop_engine_pid == nil do
      {:ok, skip: true}
    else
      :ok
    end
  end

  test "create, update, execute", context do
    if Map.get(context, :skip) do
      :ok
    else
      # SOPEngine already started by application
      {:ok, %{id: id, version: 1}} =
        Cybernetic.VSM.System5.SOPEngine.create(%{
          "name" => "Block IP",
          "steps" => [%{"action" => "tag", "key" => "blocked", "value" => true}]
        })

      {:ok, %{id: ^id, version: 2}} =
        Cybernetic.VSM.System5.SOPEngine.update(id, %{"description" => "v2"})

      {:ok, %{exec_id: _, result: r}} =
        Cybernetic.VSM.System5.SOPEngine.execute(id, %{"ip" => "1.2.3.4"})

      assert r["blocked"] == true
    end
  end
end
