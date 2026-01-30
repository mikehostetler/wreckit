defmodule Cybernetic.Integrations.OhMyOpencode.MCPProviderTest do
  use ExUnit.Case, async: true

  alias Cybernetic.Integrations.OhMyOpencode.MCPProvider
  alias Cybernetic.VSM.System3.RateLimiter
  alias Hermes.Server.Frame
  alias Hermes.Server.Response

  test "registers tool definitions on init" do
    {:ok, frame} = MCPProvider.init(%{}, Frame.new())

    tool_names =
      frame
      |> Frame.get_tools()
      |> Enum.map(& &1.name)

    assert "code_analysis.analyze" in tool_names
    assert "code_analysis.generate" in tool_names
    assert "database.query" in tool_names
  end

  test "executes a tool and returns a structured response" do
    {:ok, rate_limiter} =
      start_supervised(
        {RateLimiter,
         name: nil,
         default_budgets: %{
           mcp_tools: %{limit: 10, window_ms: 60_000}
         }}
      )

    frame =
      Frame.new(%{rate_limiter: rate_limiter})
      |> Frame.put_private(:session_id, "sess-1")

    {:reply, %Response{} = response, _frame} =
      MCPProvider.handle_tool_call(
        "code_analysis.analyze",
        %{code: "defmodule X do\nend"},
        frame
      )

    assert response.isError == false
    assert is_map(response.structured_content)
    assert response.structured_content[:metadata][:tool] == "code_analysis"
  end

  test "rejects an auth-required tool without auth_context" do
    {:ok, rate_limiter} =
      start_supervised(
        {RateLimiter,
         name: nil,
         default_budgets: %{
           mcp_tools: %{limit: 10, window_ms: 60_000}
         }}
      )

    frame =
      Frame.new(%{rate_limiter: rate_limiter})
      |> Frame.put_private(:session_id, "sess-2")

    {:reply, %Response{} = response, _frame} =
      MCPProvider.handle_tool_call(
        "database.query",
        %{sql: "select 1"},
        frame
      )

    assert response.isError == true
    assert Enum.any?(response.content, &(&1["text"] == "Unauthorized"))
  end

  test "enforces per-client rate limiting" do
    {:ok, rate_limiter} =
      start_supervised(
        {RateLimiter,
         name: nil,
         default_budgets: %{
           mcp_tools: %{limit: 2, window_ms: 60_000}
         }}
      )

    frame =
      Frame.new(%{rate_limiter: rate_limiter})
      |> Frame.put_private(:session_id, "sess-3")

    {:reply, %Response{} = ok_response, _frame} =
      MCPProvider.handle_tool_call(
        "code_analysis.analyze",
        %{code: "def ok, do: :ok"},
        frame
      )

    assert ok_response.isError == false

    {:reply, %Response{} = limited_response, _frame} =
      MCPProvider.handle_tool_call(
        "code_analysis.analyze",
        %{code: "def limited, do: :ok"},
        frame
      )

    assert limited_response.isError == true
    assert Enum.any?(limited_response.content, &(&1["text"] == "Rate limited"))
  end
end
