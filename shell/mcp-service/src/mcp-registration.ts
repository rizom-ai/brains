import {
  actorRefSchema,
  createExternalActorId,
  PLUGIN_CHANNELS,
  type ActorRef,
} from "@brains/contracts";
import type { IMessageBus, MessageResponse } from "@brains/messaging-service";
import { PermissionService, type UserPermissionLevel } from "@brains/templates";
import { type Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import {
  McpServer,
  ResourceTemplate as MCPResourceTemplate,
} from "@modelcontextprotocol/server";
import type { ToolAnnotations } from "@modelcontextprotocol/server";
import type {
  DirectMcpExposure,
  MCPProtocolMode,
  Prompt,
  Resource,
  ResourceTemplate,
  Tool,
} from "./types";
import { normalizeToolExecutionMessageResponse } from "./tool-response-validation";

const MCP_SERVER_INFO = {
  name: "brain-mcp",
  version: "1.0.0",
};

const DEFAULT_TOOL_VISIBILITY: UserPermissionLevel = "admin";
const RESOURCE_VISIBILITY: UserPermissionLevel = "admin";
const DEFAULT_PROMPT_VISIBILITY: UserPermissionLevel = "admin";

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
  return new McpServer(MCP_SERVER_INFO, {
    cacheHints: {
      "tools/list": { ttlMs: 60_000, cacheScope: "private" },
      "prompts/list": { ttlMs: 60_000, cacheScope: "private" },
      "resources/list": { ttlMs: 60_000, cacheScope: "private" },
      "resources/templates/list": {
        ttlMs: 60_000,
        cacheScope: "private",
      },
    },
  });
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

function getDirectMcpExposure(tool: Tool): DirectMcpExposure {
  if (tool.directMcpExposure !== undefined) {
    return tool.directMcpExposure;
  }
  return isReadOnlyTool(tool) ? "basic" : "debug";
}

export function canExposeToolToAgent(
  permissionLevel: UserPermissionLevel,
  tool: Tool,
): boolean {
  return canExposeTool(permissionLevel, tool) && tool.agentTool !== false;
}

export function canExposeToolOnProtocol(
  permissionLevel: UserPermissionLevel,
  tool: Tool,
  mode: MCPProtocolMode,
): boolean {
  if (!canExposeTool(permissionLevel, tool)) {
    return false;
  }

  const exposure = getDirectMcpExposure(tool);
  if (exposure === "none") {
    return false;
  }
  return mode === "debug" || exposure === "basic";
}

export function canExposeResource(
  permissionLevel: UserPermissionLevel,
): boolean {
  return PermissionService.hasPermission(permissionLevel, RESOURCE_VISIBILITY);
}

/**
 * Resource templates expose entity listing/completion that can leak entity
 * existence even when handler output is filtered by visibility. Pin them to
 * the same admin-only policy as plain resources.
 */
export function canExposeResourceTemplate(
  permissionLevel: UserPermissionLevel,
): boolean {
  return PermissionService.hasPermission(permissionLevel, RESOURCE_VISIBILITY);
}

/**
 * Prompts ship as admin-only by default because their bodies can reference
 * restricted workflows, entity names, or operator instructions. Plugins can
 * opt a prompt down to "trusted" / "public" if its template is safe to share.
 */
export function canExposePrompt(
  permissionLevel: UserPermissionLevel,
  prompt: Prompt,
): boolean {
  return PermissionService.hasPermission(
    permissionLevel,
    prompt.visibility ?? DEFAULT_PROMPT_VISIBILITY,
  );
}

export function filterToolsForPermission(
  tools: RegisteredTool[],
  userLevel: UserPermissionLevel,
): RegisteredTool[] {
  return tools.filter(({ tool }) => canExposeTool(userLevel, tool));
}

export function filterAgentToolsForPermission(
  tools: RegisteredTool[],
  userLevel: UserPermissionLevel,
): RegisteredTool[] {
  return tools.filter(({ tool }) => canExposeToolToAgent(userLevel, tool));
}

export function getToolAnnotations(tool: Tool): ToolAnnotations | undefined {
  if (tool.annotations) {
    return tool.annotations;
  }

  if (tool.sideEffects === "none") {
    return {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
  }

  if (tool.sideEffects === "writes") {
    return {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    };
  }

  if (tool.sideEffects === "external") {
    return {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    };
  }

  return undefined;
}

export function isReadOnlyTool(tool: Tool): boolean {
  return getToolAnnotations(tool)?.readOnlyHint === true;
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
  permissionLevel: UserPermissionLevel,
  configuredIsAnchor = false,
): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: z.object(tool.inputSchema),
      annotations: getToolAnnotations(tool) ?? {},
    },
    async (params, ctx) => {
      const interfaceType = ctx.mcpReq._meta?.["interfaceType"] ?? "mcp";
      const verifiedSubject = ctx.http?.authInfo?.extra?.["subject"];
      const subject =
        typeof verifiedSubject === "string" && verifiedSubject.length > 0
          ? verifiedSubject
          : undefined;
      const actor = resolveMcpActor(
        ctx.http?.authInfo?.extra?.["actor"],
        subject,
      );
      const verifiedDisplayName = ctx.http?.authInfo?.extra?.["displayName"];
      const displayName =
        typeof verifiedDisplayName === "string" &&
        verifiedDisplayName.length > 0
          ? verifiedDisplayName
          : undefined;
      const verifiedIsAnchor = ctx.http?.authInfo?.extra?.["isAnchor"];
      const isAnchor =
        typeof verifiedIsAnchor === "boolean"
          ? verifiedIsAnchor
          : configuredIsAnchor;
      const conversationId = ctx.mcpReq._meta?.["conversationId"];
      const channelId = ctx.mcpReq._meta?.["channelId"];
      const channelName = ctx.mcpReq._meta?.["channelName"];
      const progressToken = ctx.mcpReq._meta?.progressToken;

      logger.debug("MCP client metadata", {
        tool: tool.name,
        pluginId,
        interfaceType,
        actor,
        conversationId,
        channelId,
        channelName,
        progressToken,
        userPermissionLevel: permissionLevel,
      });

      try {
        const response = await messageBus.send({
          type: PLUGIN_CHANNELS.toolExecute(pluginId),
          payload: {
            toolName: tool.name,
            args: params,
            progressToken,
            hasProgress: progressToken !== undefined,
            interfaceType,
            actor,
            ...(displayName ? { displayName } : {}),
            conversationId,
            channelId,
            channelName,
            userPermissionLevel: permissionLevel,
            isAnchor,
            signal: ctx.mcpReq.signal,
          },
          sender: "MCPService",
        });
        const normalizedResponse = normalizeToolExecutionMessageResponse(
          response,
          {
            pluginId,
            toolName: tool.name,
            logger,
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: serializeMessageResponse(normalizedResponse),
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

function resolveMcpActor(
  value: unknown,
  subject: string | undefined,
): ActorRef {
  const parsed = actorRefSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return {
    kind: "external",
    externalActorId: createExternalActorId("mcp", subject ?? "anonymous"),
  };
}

export function registerResourceOnServer(
  server: McpServer,
  resource: Resource,
): void {
  server.registerResource(
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

  server.registerPrompt(
    prompt.name,
    {
      description: prompt.description ?? "Prompt",
      argsSchema: z.object(argsSchema),
    },
    async (args) => prompt.handler(args as Record<string, string>),
  );
}
