#!/usr/bin/env elixir

# Script to fix moduledoc syntax errors
files = [
  "lib/cybernetic/apps/telegram/bot/agent.ex",
  "lib/cybernetic/core/crdt/context_graph.ex",
  "lib/cybernetic/core/goldrush/elixir/engine.ex",
  "lib/cybernetic/core/goldrush/plugins/behaviour.ex",
  "lib/cybernetic/core/goldrush/telemetry/collector.ex",
  "lib/cybernetic/core/mcp/core.ex",
  "lib/cybernetic/core/mcp/transports/hermes_client.ex",
  "lib/cybernetic/core/mcp/transports/magg_adapter.ex",
  "lib/cybernetic/core/security/security.ex",
  "lib/cybernetic/core/transport/amqp/causality.ex",
  "lib/cybernetic/core/transport/amqp/connection.ex",
  "lib/cybernetic/core/transport/amqp/topology.ex",
  "lib/cybernetic/plugin.ex",
  "lib/cybernetic/plugin_registry.ex",
  "lib/cybernetic/plugins/plugin_behaviour.ex",
  "lib/cybernetic/plugins/registry.ex",
  "lib/cybernetic/ui/canvas.ex",
  "lib/cybernetic/vsm/supervisor.ex",
  "lib/cybernetic/vsm/system1/operational.ex",
  "lib/cybernetic/vsm/system2/coordinator.ex",
  "lib/cybernetic/vsm/system3/control.ex",
  "lib/cybernetic/vsm/system4/intelligence.ex",
  "lib/cybernetic/vsm/system5/policy.ex"
]

Enum.each(files, fn file ->
  if File.exists?(file) do
    content = File.read!(file)
    
    # Fix inline @moduledoc """ ... """ to multi-line format
    fixed_content = Regex.replace(
      ~r/@moduledoc """(.+?)"""/,
      content,
      fn _, doc -> 
        "@moduledoc \"\"\"\n  #{doc}\n  \"\"\""
      end
    )
    
    if content != fixed_content do
      File.write!(file, fixed_content)
      IO.puts("Fixed: #{file}")
    end
  end
end)

IO.puts("Done!")