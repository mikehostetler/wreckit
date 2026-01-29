defmodule Cybernetic.Capabilities.Supervisor do
  @moduledoc """
  Supervisor for Tier 2 Capability layer components.

  Manages the lifecycle of:
  - Capability Registry
  - Planner Collaboration
  - Execution Handoff
  - MCP Router
  - LLM CDN

  ## Configuration

      config :cybernetic, Cybernetic.Capabilities.Supervisor,
        enabled: true,
        registry_opts: [],
        planner_opts: [],
        handoff_opts: [],
        mcp_router_opts: [],
        llm_cdn_opts: []
  """
  use Supervisor

  require Logger

  @doc "Start the capabilities supervisor"
  @spec start_link(keyword()) :: Supervisor.on_start()
  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    Logger.info("Capabilities Supervisor starting")

    children = [
      # Capability Registry
      {Cybernetic.Capabilities.Registry, Keyword.get(opts, :registry_opts, [])},

      # Planner Collaboration
      {Cybernetic.Capabilities.Planner.Collaboration, Keyword.get(opts, :planner_opts, [])},

      # Execution Handoff
      {Cybernetic.Capabilities.Execution.Handoff, Keyword.get(opts, :handoff_opts, [])},

      # MCP Router
      {Cybernetic.Capabilities.MCPRouter, Keyword.get(opts, :mcp_router_opts, [])},

      # LLM CDN
      {Cybernetic.Capabilities.LLMCDN, Keyword.get(opts, :llm_cdn_opts, [])}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end
