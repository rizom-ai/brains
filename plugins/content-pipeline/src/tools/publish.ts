import { createHash } from "node:crypto";
import type {
  BaseEntity,
  Tool,
  ToolContext,
  ServicePluginContext,
} from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { ProviderRegistry } from "../provider-registry";
import {
  PublishExecutor,
  type PublishEntityExecutor,
} from "../publish-executor";

/**
 * Input schema for publish-pipeline:publish tool
 */
type PublishInputSchema = z.ZodObject<{
  entityType: z.ZodString;
  id: z.ZodOptional<z.ZodString>;
  slug: z.ZodOptional<z.ZodString>;
  confirmed: z.ZodOptional<z.ZodBoolean>;
  confirmationToken: z.ZodOptional<z.ZodString>;
  contentHash: z.ZodOptional<z.ZodString>;
  expiresAt: z.ZodOptional<z.ZodString>;
}>;

export const publishInputSchema: PublishInputSchema = z.object({
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

export type PublishInput = z.output<typeof publishInputSchema>;

const publishInputParserSchema: PublishInputSchema = z.object({
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
type PublishSuccessSchema = z.ZodObject<{
  success: z.ZodLiteral<true>;
  message: z.ZodOptional<z.ZodString>;
  data: z.ZodOptional<
    z.ZodObject<{
      entityType: z.ZodOptional<z.ZodString>;
      entityId: z.ZodOptional<z.ZodString>;
      platformId: z.ZodOptional<z.ZodString>;
      url: z.ZodOptional<z.ZodString>;
    }>
  >;
}>;

export const publishSuccessSchema: PublishSuccessSchema = z.object({
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

type PublishErrorSchema = z.ZodObject<{
  success: z.ZodLiteral<false>;
  error: z.ZodString;
  code: z.ZodOptional<z.ZodString>;
}>;

export const publishErrorSchema: PublishErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

type PublishConfirmationSchema = z.ZodObject<{
  success: z.ZodOptional<z.ZodLiteral<false>>;
  error: z.ZodOptional<z.ZodString>;
  needsConfirmation: z.ZodLiteral<true>;
  toolName: z.ZodString;
  summary: z.ZodString;
  preview: z.ZodOptional<z.ZodString>;
  args: z.ZodCustom<PublishInput, PublishInput>;
}>;

export const publishConfirmationSchema: PublishConfirmationSchema = z.object({
  success: z.literal(false).optional(),
  error: z.string().optional(),
  needsConfirmation: z.literal(true),
  toolName: z.string(),
  summary: z.string(),
  preview: z.string().optional(),
  args: z.custom<PublishInput>(),
});

export const publishOutputSchema: z.ZodUnion<
  [PublishSuccessSchema, PublishErrorSchema, PublishConfirmationSchema]
> = z.union([
  publishSuccessSchema,
  publishErrorSchema,
  publishConfirmationSchema,
]);

export type PublishSuccessOutput = z.output<typeof publishSuccessSchema>;
export type PublishSuccessData = NonNullable<PublishSuccessOutput["data"]>;
export type PublishErrorOutput = z.output<typeof publishErrorSchema>;
export type PublishConfirmationOutput = z.output<
  typeof publishConfirmationSchema
>;
export type PublishOutput = z.output<typeof publishOutputSchema>;

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
    visibility: "admin",
    sideEffects: "external",
    handler: async (rawInput, toolContext): Promise<PublishOutput> =>
      handlePublishAction({
        context,
        executor,
        toolName,
        rawInput,
        toolContext,
      }),
  };
}

export async function handlePublishAction(input: {
  context: ServicePluginContext;
  executor: PublishEntityExecutor;
  toolName: string;
  rawInput: unknown;
  toolContext: ToolContext;
}): Promise<PublishOutput> {
  const parsed = publishInputParserSchema.safeParse(input.rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
    };
  }

  const publishInput = parsed.data;
  const { entityType, id, slug } = publishInput;

  try {
    input.context.permissions.assertEntityActionAllowed(
      entityType,
      "publish",
      input.toolContext,
    );
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }

  const validation = await input.executor.resolveCandidate({
    entityType,
    id,
    slug,
  });
  if ("error" in validation) return { success: false, error: validation.error };

  const { entity } = validation;
  if (publishInput.confirmed) {
    const tokenValidation = validateConfirmationToken(
      input.toolName,
      publishInput,
      entity,
    );
    if (tokenValidation !== null) return tokenValidation;

    let publishResult: Awaited<ReturnType<PublishEntityExecutor["publish"]>>;
    try {
      publishResult = await input.executor.publish({
        entityType,
        id: entity.id,
      });
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
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

  return createPublishConfirmation(input.toolName, publishInput, entity);
}

function createPublishConfirmation(
  toolName: string,
  input: PublishInput,
  entity: BaseEntity,
): PublishConfirmationOutput {
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
): PublishErrorOutput | null {
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
