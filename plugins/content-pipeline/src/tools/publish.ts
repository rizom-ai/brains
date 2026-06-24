import { createHash } from "node:crypto";
import type {
  BaseEntity,
  Tool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z as zConfig } from "@brains/utils/zod";
import { z } from "@brains/utils/zod-v4";
import type { ProviderRegistry } from "../provider-registry";
import {
  PublishExecutor,
  type PublishEntityExecutor,
} from "../publish-executor";

/**
 * Input schema for publish-pipeline:publish tool
 */
export const publishInputSchema = zConfig.object({
  entityType: zConfig
    .string()
    .describe("Entity type to publish (e.g., social-post, post, deck)"),
  id: zConfig.string().optional().describe("Entity ID to publish"),
  slug: zConfig.string().optional().describe("Entity slug to publish"),
  confirmed: zConfig.boolean().optional(),
  confirmationToken: zConfig.string().optional(),
  contentHash: zConfig.string().optional(),
  expiresAt: zConfig.string().datetime().optional(),
});

const publishInputParserSchema = z.object({
  entityType: z.string(),
  id: z.string().optional(),
  slug: z.string().optional(),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  contentHash: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

export type PublishInput = zConfig.output<typeof publishInputSchema>;

/**
 * Output schema for publish-pipeline:publish tool - discriminated union for success/error cases
 */
export const publishSuccessSchema = zConfig.object({
  success: zConfig.literal(true),
  message: zConfig.string().optional(),
  data: zConfig
    .object({
      entityType: zConfig.string().optional(),
      entityId: zConfig.string().optional(),
      platformId: zConfig.string().optional(),
      url: zConfig.string().optional(),
    })
    .optional(),
});

export const publishErrorSchema = zConfig.object({
  success: zConfig.literal(false),
  error: zConfig.string(),
  code: zConfig.string().optional(),
});

export const publishConfirmationSchema = zConfig.object({
  success: zConfig.literal(false).optional(),
  error: zConfig.string().optional(),
  needsConfirmation: zConfig.literal(true),
  toolName: zConfig.string(),
  summary: zConfig.string(),
  preview: zConfig.string().optional(),
  args: zConfig.unknown(),
});

export const publishOutputSchema = zConfig.union([
  publishSuccessSchema,
  publishErrorSchema,
  publishConfirmationSchema,
]);

export type PublishOutput = zConfig.infer<typeof publishOutputSchema>;

const CONFIRMATION_TTL_MS = 15 * 60 * 1000;

/**
 * Create the publish-pipeline:publish tool
 *
 * This is a centralized publish tool that directly publishes any registered
 * entity type using the appropriate provider.
 *
 * @param context - Plugin context for entity access
 * @param pluginId - Plugin ID for tool naming
 * @param providerRegistry - Registry of providers per entity type
 */
export function createPublishTool(
  context: ServicePluginContext,
  pluginId: string,
  providerRegistry: ProviderRegistry,
  publishExecutor?: PublishEntityExecutor,
): Tool<PublishOutput> {
  const executor =
    publishExecutor ??
    new PublishExecutor({
      context,
      providerRegistry,
    });
  const toolName = `${pluginId}_publish`;

  return {
    name: toolName,
    description:
      "Publish an entity directly to its platform. Call this when the user asks to publish; the tool will request confirmation itself. Works with any registered entity type (social-post, post, deck, etc.)",
    inputSchema: publishInputSchema.shape,
    outputSchema: publishOutputSchema,
    visibility: "anchor",
    handler: async (rawInput, toolContext): Promise<ToolResponse> => {
      const parsed = publishInputParserSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        };
      }

      const input = parsed.data;
      const { entityType, id, slug } = input;

      try {
        context.permissions.assertEntityActionAllowed(
          entityType,
          "publish",
          toolContext,
        );
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      const validation = await executor.resolveCandidate({
        entityType,
        id,
        slug,
      });
      if ("error" in validation)
        return { success: false, error: validation.error };

      const { entity } = validation;
      if (input.confirmed) {
        const tokenValidation = validateConfirmationToken(
          toolName,
          input,
          entity,
        );
        if (tokenValidation !== null) return tokenValidation;

        let publishResult: Awaited<
          ReturnType<PublishEntityExecutor["publish"]>
        >;
        try {
          publishResult = await executor.publish({
            entityType,
            id: entity.id,
          });
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        if ("error" in publishResult) {
          return {
            success: false,
            error: publishResult.error,
          };
        }

        const { entity: publishedEntity, result } = publishResult;
        return {
          success: true,
          data: {
            entityType,
            entityId: publishedEntity.id,
            platformId: result.id,
            url: result.url,
          },
          message: `Published ${entityType}:${publishedEntity.id}`,
        };
      }

      return createPublishConfirmation(toolName, input, entity);
    },
  } as Tool<PublishOutput>;
}

function createPublishConfirmation(
  toolName: string,
  input: PublishInput,
  entity: BaseEntity,
): ToolResponse {
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();
  const confirmationToken = createConfirmationToken(
    toolName,
    entity,
    expiresAt,
  );
  const label = getEntityLabel(entity);

  return {
    needsConfirmation: true,
    toolName,
    summary: `Publish "${label}"?`,
    preview: `This will publish ${entity.entityType}:${entity.id} to its registered public publish provider.`,
    args: {
      ...input,
      id: entity.id,
      slug: undefined,
      confirmed: true,
      confirmationToken,
      contentHash: entity.contentHash,
      expiresAt,
    },
  };
}

function validateConfirmationToken(
  toolName: string,
  input: PublishInput,
  entity: BaseEntity,
): ToolResponse | null {
  const { confirmationToken, contentHash, expiresAt } = input;
  if (!confirmationToken || !expiresAt) {
    return {
      success: false,
      error:
        "Invalid publish confirmation token. Request confirmation again and retry with the returned confirmation args.",
      code: "INVALID_CONFIRMATION_TOKEN",
    };
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return {
      success: false,
      error:
        "Invalid publish confirmation expiry. Request confirmation again and retry with the returned confirmation args.",
      code: "INVALID_CONFIRMATION_TOKEN",
    };
  }

  if (expiresAtMs <= Date.now()) {
    return {
      success: false,
      error:
        "Publish confirmation expired. Request confirmation again before publishing.",
      code: "EXPIRED_CONFIRMATION_TOKEN",
    };
  }

  if (contentHash && contentHash !== entity.contentHash) {
    return {
      success: false,
      error: `Cannot publish ${entity.entityType}:${entity.id} because it changed after confirmation. Review it and try again.`,
    };
  }

  if (
    confirmationToken !== createConfirmationToken(toolName, entity, expiresAt)
  ) {
    return {
      success: false,
      error:
        "Invalid publish confirmation token. Request confirmation again and retry with the returned confirmation args.",
      code: "INVALID_CONFIRMATION_TOKEN",
    };
  }

  return null;
}

function createConfirmationToken(
  toolName: string,
  entity: BaseEntity,
  expiresAt: string,
): string {
  return createHash("sha256")
    .update(toolName)
    .update("\0")
    .update(entity.entityType)
    .update("\0")
    .update(entity.id)
    .update("\0")
    .update(entity.contentHash)
    .update("\0")
    .update(expiresAt)
    .digest("hex");
}

function getEntityLabel(entity: BaseEntity): string {
  const title = entity.metadata["title"];
  if (typeof title === "string" && title.length > 0) return title;

  const subject = entity.metadata["subject"];
  if (typeof subject === "string" && subject.length > 0) return subject;

  const slug = entity.metadata["slug"];
  if (typeof slug === "string" && slug.length > 0) return slug;

  return entity.id;
}
