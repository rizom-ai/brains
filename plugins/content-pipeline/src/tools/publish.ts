import { createHash } from "node:crypto";
import type {
  BaseEntity,
  Tool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { ProviderRegistry } from "../provider-registry";
import {
  PublishExecutor,
  type PublishEntityExecutor,
} from "../publish-executor";

/**
 * Input schema for publish-pipeline:publish tool
 */
export interface PublishInput {
  entityType: string;
  id?: string | undefined;
  slug?: string | undefined;
  confirmed?: boolean | undefined;
  confirmationToken?: string | undefined;
  contentHash?: string | undefined;
  expiresAt?: string | undefined;
}

export const publishInputSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<PublishInput, PublishInput> = z.object({
  entityType: z
    .string()
    .describe("Entity type to publish (e.g., social-post, post, deck)"),
  id: z.string().optional().describe("Entity ID to publish"),
  slug: z.string().optional().describe("Entity slug to publish"),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  contentHash: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const publishInputParserSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<PublishInput, PublishInput> = z.object({
  entityType: z.string(),
  id: z.string().optional(),
  slug: z.string().optional(),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  contentHash: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

/**
 * Output schema for publish-pipeline:publish tool - discriminated union for success/error cases
 */
export interface PublishSuccessData {
  entityType?: string | undefined;
  entityId?: string | undefined;
  platformId?: string | undefined;
  url?: string | undefined;
}

export interface PublishSuccessOutput {
  success: true;
  message?: string | undefined;
  data?: PublishSuccessData | undefined;
}

export interface PublishErrorOutput {
  success: false;
  error: string;
  code?: string | undefined;
}

export interface PublishConfirmationOutput {
  success?: false | undefined;
  error?: string | undefined;
  needsConfirmation: true;
  toolName: string;
  summary: string;
  preview?: string | undefined;
  args: unknown;
}

export type PublishOutput =
  PublishSuccessOutput | PublishErrorOutput | PublishConfirmationOutput;

export const publishSuccessSchema: z.ZodType<
  PublishSuccessOutput,
  PublishSuccessOutput
> = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z
    .object({
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      platformId: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
});

export const publishErrorSchema: z.ZodType<
  PublishErrorOutput,
  PublishErrorOutput
> = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

export const publishConfirmationSchema: z.ZodType<
  PublishConfirmationOutput,
  PublishConfirmationOutput
> = z.object({
  success: z.literal(false).optional(),
  error: z.string().optional(),
  needsConfirmation: z.literal(true),
  toolName: z.string(),
  summary: z.string(),
  preview: z.string().optional(),
  args: z.unknown(),
});

export const publishOutputSchema: z.ZodType<PublishOutput, PublishOutput> =
  z.union([
    publishSuccessSchema,
    publishErrorSchema,
    publishConfirmationSchema,
  ]);

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
      "Publish an entity directly to its platform. Call this when the user asks to publish; the tool will request confirmation itself. Works with any registered entity type (social-post, post, deck, etc.). For follow-up requests like 'publish it now', use the entity just read, generated, or updated in the conversation, including a post just changed to draft.",
    inputSchema: publishInputSchema.shape,
    outputSchema: publishOutputSchema,
    visibility: "anchor",
    sideEffects: "external",
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
