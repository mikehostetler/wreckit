defmodule Cybernetic.VSM.System4.LLMProvider do
  @moduledoc """
  Behaviour for LLM providers in the S4 Intelligence system.

  Each provider implements standardized capabilities, analysis, and generation
  functions to enable intelligent routing and fallback across different models.
  """

  @doc """
  Returns provider capabilities for routing decisions.

  ## Returns

  %{
    modes: [:chat | :tool_use | :json | :reasoning],
    strengths: [:reasoning | :code | :privacy | :speed | :cost],
    max_tokens: integer(),
    context_window: integer()
  }
  """
  @callback capabilities() :: %{
              modes: [atom()],
              strengths: [atom()],
              max_tokens: integer(),
              context_window: integer()
            }

  @doc """
  Analyze an episode for intelligence insights.

  ## Parameters

  - episode: Episode struct with context and data
  - opts: Provider-specific options (model, temperature, etc.)

  ## Returns

  {:ok, %{
    text: String.t(),
    tokens: %{input: integer(), output: integer()},
    usage: %{cost_usd: float(), latency_ms: integer()},
    citations: [String.t()],
    confidence: float()
  }} | {:error, atom()}
  """
  @callback analyze_episode(episode :: map(), opts :: keyword()) ::
              {:ok, map()} | {:error, atom()}

  @doc """
  Generate text completion for a prompt.

  ## Parameters

  - prompt: Text prompt or structured conversation
  - opts: Generation options

  ## Returns

  {:ok, %{
    text: String.t(),
    tokens: %{input: integer(), output: integer()},
    usage: %{cost_usd: float(), latency_ms: integer()},
    tool_calls: [map()],
    finish_reason: :stop | :length | :tool_calls
  }} | {:error, atom()}
  """
  @callback generate(prompt :: String.t() | list(), opts :: keyword()) ::
              {:ok, map()} | {:error, atom()}

  @doc """
  Generate embeddings for text.

  ## Parameters

  - text: Input text to embed
  - opts: Embedding options

  ## Returns

  {:ok, %{
    embeddings: [float()],
    dimensions: integer(),
    usage: %{cost_usd: float(), latency_ms: integer()}
  }} | {:error, atom()}
  """
  @callback embed(text :: String.t(), opts :: keyword()) ::
              {:ok, map()} | {:error, atom()}

  @doc """
  Health check for provider availability.
  """
  @callback health_check() :: :ok | {:error, atom()}
end
