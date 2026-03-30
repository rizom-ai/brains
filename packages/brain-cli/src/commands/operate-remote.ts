import type { CommandResult } from "../run-command";
import type { MCPClient } from "../lib/mcp-client";

/** A single tool from the MCP listTools response. */
type RemoteTool = Awaited<ReturnType<MCPClient["listTools"]>>[number];

/**
 * Find a remote tool by CLI command name.
 * Matches tools whose name ends with `_<commandName>`.
 * E.g. "list" matches "system_list", "sync" matches "directory-sync_sync".
 */
function findToolByCliName(
  tools: readonly RemoteTool[],
  commandName: string,
): RemoteTool | undefined {
  const suffix = `_${commandName}`;
  return tools.find((t) => t.name.endsWith(suffix));
}

/**
 * Map positional args to tool input using JSON Schema (remote equivalent of schema-map).
 *
 * Uses `properties` key order from the remote tool's inputSchema.
 */
function mapArgsFromJsonSchema(
  schema: RemoteTool["inputSchema"],
  args: string[],
  flags: Record<string, unknown>,
): Record<string, unknown> {
  const properties = schema.properties ?? {};
  const fieldNames = Object.keys(properties);
  const result: Record<string, unknown> = {};

  let argIdx = 0;
  for (const name of fieldNames) {
    // Flag takes precedence
    if (name in flags) {
      const value = flags[name];
      const prop = properties[name];
      const propType =
        prop && "type" in prop && typeof prop.type === "string"
          ? prop.type
          : undefined;
      result[name] = coerce(value, propType);
      continue;
    }

    // Map next positional arg
    if (argIdx < args.length) {
      const arg = args[argIdx];
      const prop = properties[name];
      const propType =
        prop && "type" in prop && typeof prop.type === "string"
          ? prop.type
          : undefined;
      if (arg !== undefined) {
        result[name] = coerce(arg, propType);
      }
      argIdx++;
    }
  }

  return result;
}

function coerce(value: unknown, type: string | undefined): unknown {
  if (typeof value !== "string") return value;
  if (type === "number" || type === "integer") return Number(value);
  if (type === "boolean") return value === "true";
  return value;
}

/**
 * Execute a CLI command against a remote brain via MCP HTTP.
 *
 * Connects to the remote /mcp endpoint, lists tools, matches by CLI name,
 * maps args via JSON Schema, calls the tool, and prints the result.
 */
export async function operateRemote(
  url: string,
  commandName: string,
  args: string[],
  flags: Record<string, unknown>,
  token: string | undefined,
): Promise<CommandResult> {
  const { MCPClient: ClientClass } = await import("../lib/mcp-client");
  const client = new ClientClass(url, token);

  try {
    await client.connect();
    const tools = await client.listTools();
    const tool = findToolByCliName(tools, commandName);

    if (!tool) {
      const available = tools
        .map((t) => {
          const parts = t.name.split("_");
          return parts[parts.length - 1];
        })
        .join(", ");
      return {
        success: false,
        message: `Unknown command: ${commandName}. Available: ${available}`,
      };
    }

    const input = mapArgsFromJsonSchema(tool.inputSchema, args, flags);
    const result = await client.callTool(tool.name, input);

    console.log(result);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Remote operation failed",
    };
  } finally {
    await client.close();
  }
}
