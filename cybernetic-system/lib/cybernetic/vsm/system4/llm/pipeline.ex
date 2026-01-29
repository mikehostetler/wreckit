defmodule Cybernetic.VSM.System4.LLM.Pipeline do
  @moduledoc """
  Req-style pipeline for LLM operations.

  Orchestrates a series of composable steps to handle LLM requests,
  providing centralized retries, rate limiting, telemetry, and more.
  """

  alias __MODULE__.Steps
  require Logger

  @type ctx :: map()
  @type result :: {:ok, map()} | {:error, term()} | Stream.t()

  @steps [
    Steps.ContextInit,
    Steps.Redactor,
    Steps.Guardrails,
    Steps.Router,
    Steps.PromptTemplate,
    Steps.Invoke,
    Steps.Postprocess,
    Steps.Accounting
  ]

  @doc """
  Run the pipeline with the given context.

  ## Parameters

    * `ctx` - Initial context map containing:
      * `:op` - Operation type (`:analyze`, `:generate`, `:chat`)
      * `:messages` - List of messages (for chat/generate)
      * `:episode` - Episode struct (for analyze)
      * `:stream?` - Whether to stream responses
      * `:policy` - Routing and governance policies
      * `:params` - Additional parameters (temperature, max_tokens, etc.)
      * `:meta` - Metadata (request_id, caller, etc.)

  ## Returns

    * `{:ok, result}` - Successful completion with result
    * `{:error, reason}` - Error with reason
    * `Stream.t()` - For streaming responses
  """
  @spec run(ctx()) :: result()
  def run(ctx) do
    Logger.debug("Pipeline starting with operation: #{ctx[:op]}")

    result =
      Enum.reduce_while(@steps, ctx, fn step, acc ->
        Logger.debug("Executing pipeline step: #{step}")

        case step.run(acc) do
          {:ok, updated_ctx} ->
            {:cont, updated_ctx}

          {:halt, result} ->
            # Step wants to short-circuit (e.g., guardrail failure)
            {:halt, result}

          {:error, err} ->
            Logger.error("Pipeline step #{step} failed: #{inspect(err)}")
            {:halt, {:error, err}}

          stream when is_struct(stream, Stream) or is_function(stream, 2) ->
            # Streaming response path
            {:halt, stream}
        end
      end)

    # Transform final context to result if we completed all steps
    case result do
      %{} = final_ctx ->
        {:ok, final_ctx[:result] || final_ctx[:response]}

      other ->
        other
    end
  rescue
    e ->
      stacktrace = __STACKTRACE__
      Logger.error("Pipeline error: #{inspect(e)}", stacktrace: stacktrace)
      {:error, {:pipeline_error, {e, stacktrace}}}
  end

  @doc """
  Get the configured steps for inspection/debugging.
  """
  @spec steps() :: [module()]
  def steps, do: @steps
end
