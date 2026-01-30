defmodule Cybernetic.MCP.Core do
  @moduledoc """
  MCP client/server core integrating Hermes and MAGG adapters.
  Handles stdio/websocket transports, tool discovery, and prompts.
  """
  use GenServer
  require Logger

  alias Cybernetic.Core.MCP.Hermes.Registry

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(opts) do
    # Schedule tool discovery after startup
    Process.send_after(self(), :discover_tools, 100)

    {:ok,
     %{
       sessions: %{},
       tools: %{},
       config: opts
     }}
  end

  @doc """
  Call an MCP tool with parameters.
  """
  @spec call_tool(String.t(), map(), timeout()) :: {:ok, map()} | {:error, term()}
  def call_tool(tool_name, params, timeout \\ 30_000) do
    GenServer.call(__MODULE__, {:call_tool, tool_name, params}, timeout)
  end

  @doc """
  Send a prompt to the MCP server.
  """
  @spec send_prompt(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def send_prompt(prompt, context \\ %{}) do
    GenServer.call(__MODULE__, {:send_prompt, prompt, context})
  end

  @doc """
  List available tools.
  Returns {:ok, tools} on success, {:error, reason} on failure.
  """
  @spec list_tools() :: {:ok, [map()]} | {:error, term()}
  def list_tools do
    GenServer.call(__MODULE__, :list_tools)
  end

  @doc """
  List available tools, raising on error.
  Returns tools list directly or raises on failure.
  """
  @spec list_tools!() :: [map()]
  def list_tools! do
    case list_tools() do
      {:ok, tools} -> tools
      {:error, reason} -> raise "Failed to list tools: #{inspect(reason)}"
    end
  end

  # GenServer callbacks - handle_call grouped together

  def handle_call({:call_tool, tool_name, params}, _from, state) do
    Logger.debug("MCP: Calling tool #{tool_name} with params: #{inspect(params)}")

    # TODO: Replace with actual Hermes MCP call
    # result = HermesMCP.call(tool_name, params)

    # Mock response for now
    result =
      {:ok,
       %{
         tool: tool_name,
         params: params,
         result: "Mock result for #{tool_name}",
         timestamp: DateTime.utc_now()
       }}

    {:reply, result, state}
  end

  def handle_call({:send_prompt, prompt, context}, _from, state) do
    Logger.debug("MCP: Sending prompt: #{prompt}")

    # TODO: Implement actual prompt sending via Hermes
    result =
      {:ok,
       %{
         prompt: prompt,
         context: context,
         response: "Mock response to: #{prompt}"
       }}

    {:reply, result, state}
  end

  def handle_call(:list_tools, _from, %{tools: tools} = state) do
    {:reply, {:ok, Map.values(tools)}, state}
  end

  @doc """
  Discover available MCP tools from configured servers.
  """
  def handle_info(:discover_tools, state) do
    Logger.info("MCP: Starting tool discovery")

    # TODO: Replace with actual Hermes MCP discovery when configured
    # For now, register some mock tools
    mock_tools = [
      %{name: "search", description: "Search the web"},
      %{name: "calculate", description: "Perform calculations"},
      %{name: "analyze", description: "Analyze data"}
    ]

    Enum.each(mock_tools, fn tool ->
      # Register with proper parameters
      Registry.register_tool(
        tool.name,
        tool.description,
        # parameters
        %{},
        # handler
        {__MODULE__, :mock_handler},
        # opts
        []
      )
    end)

    tools_map = Map.new(mock_tools, &{&1.name, &1})

    Logger.info("MCP: Discovered #{map_size(tools_map)} tools")
    {:noreply, %{state | tools: tools_map}}
  end

  @doc false
  def mock_handler(params) do
    {:ok, %{result: "Mock handler executed", params: params}}
  end
end
