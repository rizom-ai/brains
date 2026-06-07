import type {
  BaseEntity,
  Tool,
  ToolResponse,
  ServicePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils";
import type { ProviderRegistry } from "../provider-registry";
import {
  PublishExecutor,
  type PublishEntityExecutor,
} from "../publish-executor";

/**
 * Input schema for publish-pipeline:publish tool
 */
export const publishInputSchema = z.object({
  entityType: z
    .string()
    .describe("Entity type to publish (e.g., social-post, post, deck)"),
  id: z.string().optional().describe("Entity ID to publish"),
  slug: z.string().optional().describe("Entity slug to publish"),
  confirmed: z.boolean().optional(),
  confirmationToken: z.string().optional(),
  contentHash: z.string().optional(),
});

export type PublishInput = z.infer<typeof publishInputSchema>;

/**
 * Output schema for publish-pipeline:publish tool - discriminated union for success/error cases
 */
export const publishSuccessSchema = z.object({
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

export const publishErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

export const publishConfirmationSchema = z.object({
  success: z.literal(false).optional(),
  error: z.string().optional(),
  needsConfirmation: z.literal(true),
  toolName: z.string(),
  summary: z.string(),
  preview: z.string().optional(),
  args: z.unknown(),
});

export const publishOutputSchema = z.union([
  publishSuccessSchema,
  publishErrorSchema,
  publishConfirmationSchema,
]);

export type PublishOutput = z.infer<typeof publishOutputSchema>;

const CONFIRMATION_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_CONFIRMATIONS = 1000;

/**
 * In-memory store of outstanding publish confirmation tokens.
 *
 * Tokens are consumed on a confirmed call, but abandoned confirmations would
 * otherwise accumulate forever, so entries expire after a TTL and the store is
 * capped (oldest evicted first) as a backstop.
 */
class PendingConfirmationTokens {
  private readonly tokens = new Map<string, number>();

  public add(token: string): void {
    this.prune();
    if (this.tokens.size >= MAX_PENDING_CONFIRMATIONS) {
      const oldest = this.tokens.keys().next().value;
      if (oldest !== undefined) this.tokens.delete(oldest);
    }
    this.tokens.set(token, Date.now() + CONFIRMATION_TTL_MS);
  }

  public has(token: string): boolean {
    const expiresAt = this.tokens.get(token);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Date.now()) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }

  public delete(token: string): void {
    this.tokens.delete(token);
  }

  private prune(): void {
    const now = Date.now();
    for (const [token, expiresAt] of this.tokens) {
      if (expiresAt <= now) this.tokens.delete(token);
    }
  }
}

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
  const pendingConfirmationTokens = new PendingConfirmationTokens();
  const toolName = `${pluginId}_publish`;

  return {
    name: toolName,
    description:
      "Publish an entity directly to its platform. Call this when the user asks to publish; the tool will request confirmation itself. Works with any registered entity type (social-post, post, deck, etc.)",
    inputSchema: publishInputSchema.shape,
    outputSchema: publishOutputSchema,
    visibility: "anchor",
    handler: async (rawInput, toolContext): Promise<ToolResponse> => {
      const parsed = publishInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
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
        const token = input.confirmationToken;
        if (!token || !pendingConfirmationTokens.has(token)) {
          return createPublishConfirmation(
            toolName,
            input,
            entity,
            pendingConfirmationTokens,
          );
        }
        pendingConfirmationTokens.delete(token);

        if (input.contentHash && input.contentHash !== entity.contentHash) {
          return {
            success: false,
            error: `Cannot publish ${entityType}:${entity.id} because it changed after confirmation. Review it and try again.`,
          };
        }

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

      return createPublishConfirmation(
        toolName,
        input,
        entity,
        pendingConfirmationTokens,
      );
    },
  } as Tool<PublishOutput>;
}

function createPublishConfirmation(
  toolName: string,
  input: PublishInput,
  entity: BaseEntity,
  pendingConfirmationTokens: PendingConfirmationTokens,
): ToolResponse {
  const confirmationToken = crypto.randomUUID();
  pendingConfirmationTokens.add(confirmationToken);
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
    },
  };
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
