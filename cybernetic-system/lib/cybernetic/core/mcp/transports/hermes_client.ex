defmodule Cybernetic.MCP.HermesClient do
  @moduledoc """
  Real Hermes MCP client implementation for Cybernetic VSM.
  Provides access to external MCP tools and capabilities using the Hermes library.

  This module implements the Hermes.Client behavior and provides a Plugin behavior
  wrapper for integration with the Cybernetic plugin system.

  ## Transport Configuration

  The client supports multiple transport types via the Hermes library:

  - **stdio**: For command-line MCP servers
    Example: `{:stdio, command: "claude", args: ["mcp", "serve"]}`

  - **websocket**: For WebSocket-based MCP servers
    Example: `{:websocket, url: "ws://localhost:8080/mcp"}`

  - **streamable_http**: For HTTP-based MCP servers
    Example: `:streamable_http`

  ## Usage

      # Start the client with a transport
      {:ok, pid} = HermesClient.start_link(transport: {:stdio, command: "echo", args: []})

      # List available tools
      {:ok, response} = HermesClient.list_tools()

      # Call a tool
      {:ok, result} = HermesClient.call_tool("tool_name", %{param: "value"})

      # Check health
      {:ok, status} = HermesClient.health_check()
  """
  require Logger

  @behaviour Cybernetic.Plugin

  # Use Hermes.Client macro with proper configuration
  use Hermes.Client,
    name: "cybernetic",
    version: "0.1.0",
    protocol_version: "2024-11-05",
    capabilities: [:roots]

  # Wrapper functions for Hermes.Client macro functions
  # Note: The Hermes.Client macro already provides call_tool/3, list_tools/1, ping/1, read_resource/2
  # with proper error handling and transport delegation.

  # Child spec for dynamic transport configuration
  def child_spec(opts) do
    transport = Keyword.get(opts, :transport, {:stdio, command: "echo", args: []})

    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [[transport: transport]]},
      restart: :permanent,
      shutdown: 5000,
      type: :worker
    }
  end

  # Plugin behavior implementation
  def init(opts) do
    mock_mode = Keyword.get(opts, :mock_mode, Application.get_env(:cybernetic, :mcp, [])[:mock_mode] == true)
    {:ok, %{opts: opts, initialized: true, mock_mode: mock_mode}}
  end

  def metadata(), do: %{name: "hermes_mcp", version: "0.1.0"}

  def handle_event(event, state) do
    Logger.debug("Hermes MCP client received event: #{inspect(event)}")
    {:ok, state}
  end

  def process(%{tool: tool, params: params}, state) when is_binary(tool) and is_map(params) do
    Logger.debug("Hermes MCP tool call: #{tool} with #{inspect(params)}")

    try do
      case call_tool(tool, params, timeout: 30_000) do
        {:ok, response} ->
          # Extract result from response
          result = case response do
            %{result: result_data} -> result_data
            %{content: content} -> %{content: content}
            other -> other
          end
          {:ok, %{tool: tool, result: result, success: true}, state}

        {:error, reason} ->
          Logger.warning("Hermes MCP tool error: #{inspect(reason)}")
          {:error, %{tool: tool, error: :tool_error, reason: reason}, state}
      end
    rescue
      error ->
        Logger.error("Hermes MCP client error: #{inspect(error)}")
        {:error, %{tool: tool, error: :client_error, details: inspect(error)}, state}
    catch
      :exit, {:noproc, _} ->
        Logger.warning("Hermes MCP client not started")
        {:error, %{tool: tool, error: :client_error, reason: :client_not_started}, state}

      :exit, reason ->
        Logger.warning("Hermes MCP process exit: #{inspect(reason)}")
        {:error, %{tool: tool, error: :client_error, reason: reason}, state}
    end
  end

  # Handle malformed input gracefully
  def process(input, state) do
    Logger.warning("Hermes MCP invalid input structure: #{inspect(input)}")
    {:error, %{error: :client_error, details: "Invalid input structure", input: input}, state}
  end
end
