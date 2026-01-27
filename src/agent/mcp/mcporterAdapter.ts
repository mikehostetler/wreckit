import { zodToJsonSchema } from "zod-to-json-schema";
import type { AxFunction, AxFunctionJSONSchema } from "@ax-llm/ax";
import type { Logger } from "../../logging";

/**
 * Adapt in-process MCP servers (from Claude SDK) to AxFunctions.
 * 
 * Note: This implementation deviates from the original PRD requirement of returning
 * McporterServerConfig[] because Wreckit's internal MCP server relies on in-process
 * callbacks (e.g., onSavePrd) which cannot be serialized across process boundaries
 * via stdio transport. Instead, we adapt the tools directly.
 */
export function adaptMcpServersToAxTools(
  mcpServers: Record<string, any>,
  allowedTools?: string[]
): AxFunction[] {
  const tools: AxFunction[] = [];

  for (const [serverName, server] of Object.entries(mcpServers)) {
    if (!server || !server.tools) continue;

    for (const tool of server.tools) {
      const axToolName = `mcp__${serverName}__${tool.name}`;
      
      // Check if tool is allowed
      // specific check: mcp__wreckit__save_prd
      // original check: save_prd
      const isAllowed = !allowedTools || 
        allowedTools.includes(axToolName) || 
        allowedTools.includes(tool.name);

      if (!isAllowed) {
        continue;
      }

      const jsonSchema = zodToJsonSchema(tool.inputSchema) as AxFunctionJSONSchema;

      tools.push({
        name: axToolName,
        description: tool.description || "",
        parameters: jsonSchema,
        func: async (args: any) => {
          // MCP tools in Claude SDK return { content: [{ type: 'text', text: '...' }] }
          try {
            const result = await tool.handler(args);
            
            // Format result for Ax (string)
            if (result && result.content) {
              if (Array.isArray(result.content)) {
                return result.content
                  .map((c: any) => c.text || JSON.stringify(c))
                  .join("\n");
              }
              return JSON.stringify(result.content);
            }
            return JSON.stringify(result);
          } catch (error: any) {
            return `Error executing tool ${axToolName}: ${error.message}`;
          }
        }
      });
    }
  }

  return tools;
}
