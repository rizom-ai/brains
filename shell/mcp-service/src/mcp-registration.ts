import type { IMessageBus, MessageResponse } from "@brains/messaging-service";
import { PermissionService, type UserPermissionLevel } from "@brains/templates";
import { z, type Logger } from "@brains/utils";
import {
  McpServer,
  ResourceTemplate as MCPResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Prompt, Resource, ResourceTemplate, Tool } from "./types";

const MCP_SERVER_INFO = {
  name: "brain-mcp",
  version: "1.0.0",
};

const DEFAULT_TOOL_VISIBILITY: UserPermissionLevel = "anchor";
const RESOURCE_VISIBILITY: UserPermissionLevel = "anchor";

export interface RegisteredTool {
  pluginId: string;
  tool: Tool;
}

export interface RegisteredResource {
  pluginId: string;
  resource: Resource;
}

export interface RegisteredTemplate {
  pluginId: string;
  template: ResourceTemplate;
}

export interface RegisteredPrompt {
  pluginId: string;
  prompt: Prompt;
}

export function createMcpServerInstance(): McpServer {
  return new McpServer(MCP_SERVER_INFO);
}

export function canExposeTool(
  permissionLevel: UserPermissionLevel,
  tool: Tool,
): boolean {
  return PermissionService.hasPermission(
    permissionLevel,
    tool.visibility ?? DEFAULT_TOOL_VISIBILITY,
  );
}

export function canExposeResource(
  permissionLevel: UserPermissionLevel,
): boolean {
  return PermissionService.hasPermission(permissionLevel, RESOURCE_VISIBILITY);
}

export function filterToolsForPermission(
  tools: RegisteredTool[],
  userLevel: UserPermissionLevel,
): RegisteredTool[] {
  return tools.filter(({ tool }) => canExposeTool(userLevel, tool));
}

export function serializeMessageResponse(response: MessageResponse): string {
  if ("success" in response && !response.success) {
    throw new Error(response.error ?? "Operation failed");
  }
  return JSON.stringify("data" in response ? response.data : response, null, 2);
}

export function registerToolOnServer(
  server: McpServer,
  pluginId: string,
  tool: Tool,
  messageBus: IMessageBus,
  logger: Logger,
): void {
  server.tool(
    tool.name,
    tool.description,
    tool.inputSchema,
    async (params, extra) => {
      const interfaceType = extra._meta?.["interfaceType"] ?? "mcp";
      const userId = extra._meta?.["userId"] ?? "mcp-user";
      const channelId = extra._meta?.["channelId"];
      const channelName = extra._meta?.["channelName"];
      const progressToken = extra._meta?.progressToken;

      logger.debug("MCP client metadata", {
        tool: tool.name,
        pluginId,
        interfaceType,
        userId,
        channelId,
        channelName,
        progressToken,
      });

      try {
        const response = await messageBus.send(
          `plugin:${pluginId}:tool:execute`,
          {
            toolName: tool.name,
            args: params,
            progressToken,
            hasProgress: progressToken !== undefined,
            interfaceType,
            userId,
            channelId,
            channelName,
          },
          "MCPService",
        );

        return {
          content: [
            {
              type: "text" as const,
              text: serializeMessageResponse(response),
            },
          ],
        };
      } catch (error) {
        logger.error(`Tool execution error for ${tool.name}`, error);
        throw error;
      }
    },
  );
}

export function registerResourceOnServer(
  server: McpServer,
  resource: Resource,
): void {
  server.resource(
    resource.name,
    resource.uri,
    { description: resource.description, mimeType: resource.mimeType },
    async () => resource.handler(),
  );
}

export function registerResourceTemplateOnServer(
  server: McpServer,
  template: ResourceTemplate,
): void {
  const listFn = template.list;

  const sdkTemplate = new MCPResourceTemplate(template.uriTemplate, {
    list: listFn
      ? async (): Promise<{
          resources: Array<{ uri: string; name: string }>;
        }> => ({
          resources: (await listFn()).map((r) => ({
            uri: r.uri,
            name: r.name,
          })),
        })
      : undefined,
    ...(template.complete && {
      complete: Object.fromEntries(
        Object.entries(template.complete).map(([k, fn]) => [
          k,
          (
            value: string,
            context?: { arguments?: Record<string, string> },
          ): string[] | Promise<string[]> => fn(value, context),
        ]),
      ),
    }),
  });

  server.registerResource(
    template.name,
    sdkTemplate,
    { description: template.description, mimeType: template.mimeType },
    async (_uri, vars) => {
      const flatVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(vars)) {
        flatVars[k] = Array.isArray(v) ? (v[0] ?? "") : v;
      }
      return template.handler(flatVars);
    },
  );
}

export function registerPromptOnServer(
  server: McpServer,
  prompt: Prompt,
): void {
  const argsSchema = Object.fromEntries(
    Object.entries(prompt.args).map(([key, arg]) => [
      key,
      arg.required
        ? z.string().describe(arg.description)
        : z.string().optional().describe(arg.description),
    ]),
  );

  server.prompt(
    prompt.name,
    prompt.description ?? "Prompt",
    argsSchema,
    async (args) => prompt.handler(args as Record<string, string>),
  );
}
