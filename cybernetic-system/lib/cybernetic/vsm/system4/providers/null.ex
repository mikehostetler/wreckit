defmodule Cybernetic.VSM.System4.Providers.Null do
  @moduledoc "No-op provider that echoes placeholders; useful for tests/dev."
  @behaviour Cybernetic.VSM.System4.LLMProvider

  @impl true
  def analyze_episode(ep, _opts) do
    {:ok,
     %{
       summary: "noop summary for #{ep["id"] || "episode"}",
       recommendations: [],
       sop_suggestions: []
     }}
  end

  @impl true
  def capabilities do
    %{
      modes: [:mock],
      strengths: [:testing],
      max_tokens: 1000,
      context_window: 1000
    }
  end

  @impl true
  def generate(_prompt_or_messages, _opts \\ []) do
    {:ok,
     %{
       text: "Mock response from Null provider",
       tokens: %{input: 10, output: 20},
       usage: %{cost_usd: 0.0, latency_ms: 1},
       tool_calls: [],
       finish_reason: :stop
     }}
  end

  @impl true
  def embed(_text, _opts \\ []) do
    {:error, :embeddings_not_supported}
  end

  @impl true
  def health_check do
    :ok
  end
end
