import type { ServicePluginContext, Tool, ToolResponse } from "@brains/plugins";
import { z as zConfig } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";
import type { AtprotoPlugin } from "./plugin";

const publishCardInputSchema = {
  dryRun: zConfig
    .boolean()
    .default(false)
    .describe("Build and return the card record without writing to the PDS"),
};

const publishCardInputParserSchema = z.object({
  dryRun: z.boolean().default(false),
});

const validateCredentialsInputSchema = {};

const publishEntityInputSchema = {
  entityType: zConfig
    .string()
    .describe("Local entity type with a registered AT Protocol projection"),
  entityId: zConfig.string().optional().describe("Local entity ID to publish"),
  slug: zConfig.string().optional().describe("Local entity slug to publish"),
  dryRun: zConfig
    .boolean()
    .default(false)
    .describe("Build and return the record without writing to the PDS"),
  topics: zConfig
    .array(zConfig.string())
    .optional()
    .describe("Optional topic labels to include in the AT Protocol record"),
};

const publishEntityInputParserSchema = z.object({
  entityType: z.string(),
  entityId: z.string().optional(),
  slug: z.string().optional(),
  dryRun: z.boolean().default(false),
  topics: z.array(z.string()).optional(),
});

const discoverBrainCardsInputSchema = {
  repos: zConfig
    .array(zConfig.string().min(1))
    .min(1)
    .max(50)
    .describe("Candidate AT Protocol repo DIDs or handles to inspect"),
};

const discoverBrainCardsInputParserSchema = z.object({
  repos: z.array(z.string().min(1)).min(1).max(50),
});

const publishPostInputSchema = {
  entityId: zConfig
    .string()
    .optional()
    .describe("Local blog post entity ID to publish"),
  slug: zConfig.string().optional().describe("Local blog post slug to publish"),
  dryRun: zConfig
    .boolean()
    .default(false)
    .describe("Build and return the post record without writing to the PDS"),
  topics: zConfig
    .array(zConfig.string())
    .optional()
    .describe("Optional topic labels to include in the AT Protocol record"),
};

const publishPostInputParserSchema = z.object({
  entityId: z.string().optional(),
  slug: z.string().optional(),
  dryRun: z.boolean().default(false),
  topics: z.array(z.string()).optional(),
});

export function createAtprotoTools(
  pluginId: string,
  plugin: AtprotoPlugin,
  context: ServicePluginContext,
): Tool[] {
  return [
    createValidateCredentialsTool(pluginId, plugin),
    createPublishCardTool(pluginId, plugin, context),
    createPublishEntityTool(pluginId, plugin, context),
    createPublishPostTool(pluginId, plugin, context),
    createDiscoverBrainCardsTool(pluginId, plugin, context),
  ];
}

function createValidateCredentialsTool(
  pluginId: string,
  plugin: AtprotoPlugin,
): Tool {
  return {
    name: `${pluginId}_validate_credentials`,
    description:
      "Validate AT Protocol PDS credentials without publishing records.",
    inputSchema: validateCredentialsInputSchema,
    handler: async (): Promise<ToolResponse> => {
      const valid = await plugin.validatePdsCredentials();
      return { success: true, data: { valid } };
    },
  };
}

function createPublishCardTool(
  pluginId: string,
  plugin: AtprotoPlugin,
  context: ServicePluginContext,
): Tool {
  return {
    name: `${pluginId}_publish_card`,
    description:
      "Publish this brain's AT Protocol discovery card to the configured PDS, or dry-run the record payload.",
    inputSchema: publishCardInputSchema,
    handler: async (input): Promise<ToolResponse> => {
      const parsed = publishCardInputParserSchema.safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }

      try {
        const result = await plugin.publishBrainCard(context, {
          dryRun: parsed.data.dryRun,
        });
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Publish failed",
        };
      }
    },
  };
}

function createPublishEntityTool(
  pluginId: string,
  plugin: AtprotoPlugin,
  context: ServicePluginContext,
): Tool {
  return {
    name: `${pluginId}_publish_entity`,
    description:
      "Publish any public local entity with a registered AT Protocol projection, or dry-run the record payload.",
    inputSchema: publishEntityInputSchema,
    handler: async (input): Promise<ToolResponse> => {
      const parsed = publishEntityInputParserSchema.safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }

      try {
        if (!parsed.data.entityId && !parsed.data.slug) {
          return {
            success: false,
            error: "Invalid input: entityId or slug is required",
          };
        }

        const result = await plugin.publishEntity(context, {
          entityType: parsed.data.entityType,
          ...(parsed.data.entityId && { entityId: parsed.data.entityId }),
          ...(parsed.data.slug && { slug: parsed.data.slug }),
          dryRun: parsed.data.dryRun,
          ...(parsed.data.topics && { topics: parsed.data.topics }),
        });
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Publish failed",
        };
      }
    },
  };
}

function createDiscoverBrainCardsTool(
  pluginId: string,
  plugin: AtprotoPlugin,
  context: ServicePluginContext,
): Tool {
  return {
    name: `${pluginId}_discover_brain_cards`,
    description:
      "Read public ai.rizom.brain.card/self records from candidate AT Protocol repo DIDs or handles and emit internal discovery events.",
    inputSchema: discoverBrainCardsInputSchema,
    handler: async (input): Promise<ToolResponse> => {
      const parsed = discoverBrainCardsInputParserSchema.safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }

      try {
        const result = await plugin.discoverBrainCards(context, {
          repos: parsed.data.repos,
        });
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Discovery failed",
        };
      }
    },
  };
}

function createPublishPostTool(
  pluginId: string,
  plugin: AtprotoPlugin,
  context: ServicePluginContext,
): Tool {
  return {
    name: `${pluginId}_publish_post`,
    description:
      "Publish a local blog post entity as an ai.rizom.brain.post AT Protocol record, or dry-run the record payload.",
    inputSchema: publishPostInputSchema,
    handler: async (input): Promise<ToolResponse> => {
      const parsed = publishPostInputParserSchema.safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.message}`,
        };
      }

      try {
        if (!parsed.data.entityId && !parsed.data.slug) {
          return {
            success: false,
            error: "Invalid input: entityId or slug is required",
          };
        }

        const result = await plugin.publishPost(context, {
          ...(parsed.data.entityId && { entityId: parsed.data.entityId }),
          ...(parsed.data.slug && { slug: parsed.data.slug }),
          dryRun: parsed.data.dryRun,
          ...(parsed.data.topics && { topics: parsed.data.topics }),
        });
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Publish failed",
        };
      }
    },
  };
}
