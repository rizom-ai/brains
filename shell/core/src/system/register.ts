import type { IMCPService, ToolContext } from "@brains/mcp-service";
import type { MessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import type { SystemServices } from "./types";
import { createSystemTools } from "./tools";
import { createSystemResources } from "./resources";
import { createSystemPrompts } from "./prompts";
import { createSystemInstructions } from "./instructions";
import { createSystemWidgets } from "./widgets";

const SYSTEM_ID = "system";

/**
 * Register system tools, resources, prompts, instructions, and widgets.
 * Called from shell initialization after all plugins are registered.
 */
export function registerSystemCapabilities(
  services: SystemServices,
  mcpService: IMCPService,
  messageBus: MessageBus,
  logger: Logger,
): void {
  // ── Tools ──
  const tools = createSystemTools(services);
  for (const tool of tools) {
    try {
      mcpService.registerTool(SYSTEM_ID, tool);
    } catch {
      // Tool already registered (e.g., singleton not fully reset in tests)
      logger.debug(`System tool ${tool.name} already registered, skipping`);
    }
  }

  // Subscribe to tool execution (same message bus pattern as plugins)
  messageBus.subscribe(`plugin:${SYSTEM_ID}:tool:execute`, async (message) => {
    const { toolName, args, interfaceType, userId, channelId } =
      message.payload as {
        toolName: string;
        args: unknown;
        interfaceType?: string;
        userId?: string;
        channelId?: string;
      };

    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      return {
        success: false,
        error: `System tool not found: ${toolName}`,
      };
    }

    const toolContext: ToolContext = {
      interfaceType: interfaceType ?? "system",
      userId: userId ?? "system",
    };
    if (channelId) toolContext.channelId = channelId;
    const result = await tool.handler(args, toolContext);
    return { success: true, data: result };
  });

  logger.debug(`Registered ${tools.length} system tools`);

  // ── Resources ──
  const resources = createSystemResources(services);
  for (const resource of resources) {
    try {
      mcpService.registerResource(SYSTEM_ID, resource);
    } catch {
      logger.debug(
        `System resource ${resource.uri} already registered, skipping`,
      );
    }
  }
  logger.debug(`Registered ${resources.length} system resources`);

  // ── Prompts ──
  const prompts = createSystemPrompts(services);
  for (const prompt of prompts) {
    try {
      mcpService.registerPrompt(SYSTEM_ID, prompt);
    } catch {
      logger.debug(`System prompt ${prompt.name} already registered, skipping`);
    }
  }
  logger.debug(`Registered ${prompts.length} system prompts`);

  // ── Instructions ──
  const instructions = createSystemInstructions(services);
  try {
    mcpService.registerPluginInstructions(SYSTEM_ID, instructions);
  } catch {
    logger.debug("System instructions already registered, skipping");
  }
  logger.debug("Registered system instructions");

  // ── Dashboard widgets ──
  const widgets = createSystemWidgets(services);
  messageBus.subscribe("system:plugins:ready", async () => {
    for (const widget of widgets) {
      await messageBus.send("dashboard:register-widget", widget, SYSTEM_ID);
    }
    logger.debug(`Registered ${widgets.length} dashboard widgets`);
    return { success: true };
  });
}
