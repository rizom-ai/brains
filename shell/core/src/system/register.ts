import type {
  IMCPService,
  Prompt,
  Resource,
  ResourceTemplate,
  Tool,
  ToolContext,
} from "@brains/mcp-service";
import type { IMessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import type { SystemServices } from "./types";
import { createSystemTools } from "./tools";
import { createSystemResources } from "./resources";
import { createSystemResourceTemplates } from "./resource-templates";
import { createSystemPrompts } from "./prompts";
import { createSystemInstructions } from "./instructions";

const SYSTEM_ID = "system";

function registerSkippingDuplicates<T>(
  items: T[],
  register: (item: T) => void,
  getLabel: (item: T) => string,
  noun: string,
  logger: Logger,
): void {
  for (const item of items) {
    try {
      register(item);
    } catch {
      logger.debug(
        `System ${noun} ${getLabel(item)} already registered, skipping`,
      );
    }
  }
}

/**
 * Register system tools, resources, prompts, and instructions.
 * Called from shell initialization after all plugins are registered.
 */
export function registerSystemCapabilities(
  services: SystemServices,
  mcpService: IMCPService,
  messageBus: IMessageBus,
  logger: Logger,
): () => void {
  // ── Tools ──
  const tools = createSystemTools(services);
  registerSkippingDuplicates<Tool>(
    tools,
    (tool) => mcpService.registerTool(SYSTEM_ID, tool),
    (tool) => tool.name,
    "tool",
    logger,
  );

  // Subscribe to tool execution (same message bus pattern as plugins)
  const unsubscribeToolExecution = messageBus.subscribe(
    `plugin:${SYSTEM_ID}:tool:execute`,
    async (message) => {
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
    },
  );

  logger.debug(`Registered ${tools.length} system tools`);

  // ── Resources ──
  const resources = createSystemResources(services);
  registerSkippingDuplicates<Resource>(
    resources,
    (resource) => mcpService.registerResource(SYSTEM_ID, resource),
    (resource) => resource.uri,
    "resource",
    logger,
  );
  logger.debug(`Registered ${resources.length} system resources`);

  // ── Resource Templates ──
  const resourceTemplates = createSystemResourceTemplates(services);
  registerSkippingDuplicates<ResourceTemplate>(
    resourceTemplates,
    (template) => mcpService.registerResourceTemplate(SYSTEM_ID, template),
    (template) => template.uriTemplate,
    "resource template",
    logger,
  );
  logger.debug(
    `Registered ${resourceTemplates.length} system resource templates`,
  );

  // ── Prompts ──
  const prompts = createSystemPrompts(services);
  registerSkippingDuplicates<Prompt>(
    prompts,
    (prompt) => mcpService.registerPrompt(SYSTEM_ID, prompt),
    (prompt) => prompt.name,
    "prompt",
    logger,
  );
  logger.debug(`Registered ${prompts.length} system prompts`);

  // ── Instructions ──
  const instructions = createSystemInstructions(services);
  try {
    mcpService.registerInstructions(SYSTEM_ID, instructions);
  } catch {
    logger.debug("System instructions already registered, skipping");
  }
  logger.debug("Registered system instructions");

  return unsubscribeToolExecution;
}
