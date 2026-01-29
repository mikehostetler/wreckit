defmodule Cybernetic.VSM.System4.LLM.Pipeline.Steps.Invoke do
  @moduledoc """
  The ONLY step that invokes req_llm for LLM operations.

  Handles both streaming and non-streaming requests.
  """

  require Logger

  @doc """
  Invoke req_llm with the prepared context.
  """
  def run(%{route: route, messages: messages, params: params, stream?: false} = ctx) do
    # Already in "provider:model" format from Router
    model = route.model

    Logger.debug("Invoking req_llm with model: #{model}")

    # ReqLLM expects messages in specific format
    formatted_messages = format_messages_for_req_llm(messages)

    # Build options for ReqLLM
    opts = build_req_llm_options(params)

    case ReqLLM.generate_text(model, formatted_messages, opts) do
      {:ok, response} ->
        Logger.debug("req_llm response received")
        # Store raw response only; Postprocess will translate
        {:ok, Map.put(ctx, :raw_response, response)}

      {:error, error} ->
        Logger.error("req_llm error: #{inspect(error)}")
        {:error, normalize_error(error)}
    end
  rescue
    e ->
      Logger.error("req_llm exception: #{inspect(e)}")
      {:error, {:llm_error, e}}
  end

  def run(%{route: route, messages: messages, params: params, stream?: true} = _ctx) do
    # Already in "provider:model" format from Router
    model = route.model

    Logger.debug("Starting req_llm stream with model: #{model}")

    # ReqLLM expects messages in specific format
    formatted_messages = format_messages_for_req_llm(messages)

    # Build options for ReqLLM
    opts = build_req_llm_options(params)

    case ReqLLM.stream_text(model, formatted_messages, opts) do
      {:ok, stream} ->
        # Wrap the stream to translate each chunk
        translated_stream = Stream.map(stream, &translate_stream_chunk/1)
        {:halt, translated_stream}

      {:error, error} ->
        Logger.error("req_llm stream error: #{inspect(error)}")
        {:error, normalize_error(error)}
    end
  rescue
    e ->
      Logger.error("req_llm stream exception: #{inspect(e)}")
      {:error, {:llm_stream_error, e}}
  end

  def run(ctx) do
    Logger.error("Invoke step missing required context: #{inspect(Map.keys(ctx))}")
    {:error, :missing_invoke_context}
  end

  defp format_messages_for_req_llm(messages) when is_list(messages) do
    # Messages are already in the right format (list of maps with :role and :content)
    messages
  end

  defp format_messages_for_req_llm(message) when is_map(message) do
    # Single message
    [message]
  end

  defp format_messages_for_req_llm(message) when is_binary(message) do
    # Plain string message
    [%{role: "user", content: message}]
  end

  defp build_req_llm_options(params) when is_map(params) do
    opts = []

    opts = if params[:temperature], do: [{:temperature, params[:temperature]} | opts], else: opts
    opts = if params[:max_tokens], do: [{:max_tokens, params[:max_tokens]} | opts], else: opts
    opts = if params[:top_p], do: [{:top_p, params[:top_p]} | opts], else: opts
    opts = if params[:tools], do: [{:tools, params[:tools]} | opts], else: opts
    opts = if params[:tool_choice], do: [{:tool_choice, params[:tool_choice]} | opts], else: opts

    opts =
      if params[:response_format],
        do: [{:response_format, params[:response_format]} | opts],
        else: opts

    if params[:extra], do: Keyword.merge(opts, params[:extra]), else: opts
  end

  defp build_req_llm_options(_), do: []

  # Streaming response translation (streams bypass Postprocess step)
  defp translate_stream_chunk(chunk) do
    # Translate streaming chunk to our format
    %{
      delta: get_chunk_delta(chunk),
      finish_reason: get_in(chunk, [:finish_reason]),
      raw: chunk
    }
  end

  defp get_chunk_delta(chunk) do
    get_in(chunk, [:delta]) ||
      get_in(chunk, [:choices, Access.at(0), :delta]) ||
      %{}
  end

  defp normalize_error({:error, %{status: 429} = error}) do
    {:error, :rate_limited, error}
  end

  defp normalize_error({:error, %{status: status} = error}) when status >= 500 do
    {:error, :provider_error, error}
  end

  defp normalize_error({:error, %{status: 401} = error}) do
    {:error, :authentication_error, error}
  end

  defp normalize_error({:error, %{status: 400} = error}) do
    {:error, :invalid_request, error}
  end

  defp normalize_error({:error, :timeout} = error) do
    {:error, :timeout, error}
  end

  defp normalize_error(error) do
    {:error, :unknown_error, error}
  end
end
