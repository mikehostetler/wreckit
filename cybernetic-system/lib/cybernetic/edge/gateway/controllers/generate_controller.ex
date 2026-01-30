defmodule Cybernetic.Edge.Gateway.GenerateController do
  @moduledoc """
  Controller for the /v1/generate endpoint that routes requests
  to the S4 Intelligence system for LLM processing.
  """
  use Phoenix.Controller
  require Logger
  alias Cybernetic.VSM.System4.Episode
  alias Cybernetic.VSM.System4.Router

  @doc """
  Handle POST /v1/generate requests
  """
  def create(conn, params) do
    with {:ok, tenant_id} <- get_tenant_id(conn),
         {:ok, validated_params} <- validate_params(params),
         {:ok, episode} <- create_episode(validated_params, tenant_id),
         {:ok, result, provider_info} <- route_to_s4(episode) do
      # Emit telemetry
      :telemetry.execute(
        [:cybernetic, :edge, :generate, :success],
        %{latency_ms: provider_info[:latency_ms] || 0},
        %{tenant_id: tenant_id, provider: provider_info.provider}
      )

      conn
      |> put_status(:ok)
      |> json(%{
        id: episode.id,
        status: "completed",
        provider: provider_info.provider,
        result: result,
        metadata: %{
          tenant_id: tenant_id,
          request_id: get_request_id(conn),
          latency_ms: provider_info[:latency_ms]
        }
      })
    else
      {:error, :unauthorized} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Unauthorized", code: "AUTH_REQUIRED"})

      {:error, :invalid_params} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "Invalid parameters", code: "INVALID_PARAMS"})

      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> put_resp_header("retry-after", "60")
        |> json(%{error: "Rate limit exceeded", code: "RATE_LIMITED"})

      {:error, reason} ->
        Logger.error("Generate endpoint error: #{inspect(reason)}")

        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Internal server error", code: "INTERNAL_ERROR"})
    end
  end

  defp get_tenant_id(conn) do
    case conn.assigns[:tenant_id] do
      nil -> {:error, :unauthorized}
      tenant_id -> {:ok, tenant_id}
    end
  end

  defp get_request_id(conn) do
    conn.assigns[:request_id] || generate_uuid()
  end

  defp generate_uuid do
    :crypto.strong_rand_bytes(16)
    |> Base.encode16(case: :lower)
    |> String.slice(0..31)
  end

  defp validate_params(%{"prompt" => prompt} = params) when is_binary(prompt) do
    {:ok,
     %{
       prompt: prompt,
       model: Map.get(params, "model", "default"),
       temperature: validate_temperature(params["temperature"]),
       max_tokens: validate_max_tokens(params["max_tokens"]),
       stream: Map.get(params, "stream", false)
     }}
  end

  defp validate_params(_), do: {:error, :invalid_params}

  defp validate_temperature(nil), do: 0.7
  defp validate_temperature(temp) when is_number(temp) and temp >= 0 and temp <= 2, do: temp
  defp validate_temperature(_), do: 0.7

  defp validate_max_tokens(nil), do: 2048

  defp validate_max_tokens(tokens) when is_integer(tokens) and tokens > 0 and tokens <= 8192,
    do: tokens

  defp validate_max_tokens(_), do: 2048

  defp create_episode(params, tenant_id) do
    episode =
      Episode.new(
        determine_episode_kind(params),
        "Generate Request from #{tenant_id}",
        params.prompt,
        context: %{
          tenant_id: tenant_id,
          model: params.model,
          request_type: "generation"
        },
        metadata: Map.take(params, [:temperature, :max_tokens, :stream]),
        priority: :normal,
        source_system: :edge_gateway
      )

    {:ok, episode}
  end

  defp determine_episode_kind(%{model: "code"}), do: :code_gen
  defp determine_episode_kind(%{model: "policy"}), do: :policy_review
  # Use code_gen as default since :general is not valid
  defp determine_episode_kind(_), do: :code_gen

  defp route_to_s4(episode) do
    Router.route(episode)
  end
end
