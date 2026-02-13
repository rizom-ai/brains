import type { ServicePluginContext } from "./context";
import { z } from "@brains/utils";

/**
 * Parameters for resolving a unique title before entity creation.
 */
export interface EnsureUniqueTitleParams {
  /** The entity type string (e.g. "post", "social-post") */
  entityType: string;
  /** The proposed title */
  title: string;
  /** Derive an entity ID from a title (e.g. slugify, platform-prefix) */
  deriveId: (title: string) => string;
  /** Prompt hint for the AI when it needs to regenerate */
  regeneratePrompt: string;
  /** Service context (needs entityService, ai, logger) */
  context: Pick<ServicePluginContext, "entityService" | "ai" | "logger">;
}

/**
 * Ensure a title won't collide with an existing entity ID.
 *
 * 1. Derives the proposed ID via `deriveId(title)`
 * 2. Checks if that ID already exists
 * 3. If collision → asks AI to generate a different title
 * 4. Returns the final title (original or regenerated)
 *
 * Callers should still pass `{ deduplicateId: true }` to `createEntity()`
 * as a safety net for any remaining edge-case collisions.
 */
export async function ensureUniqueTitle(
  params: EnsureUniqueTitleParams,
): Promise<string> {
  const { entityType, title, deriveId, regeneratePrompt, context } = params;

  const proposedId = deriveId(title);

  // Check for collision
  const existing = await context.entityService.getEntity(
    entityType,
    proposedId,
  );
  if (!existing) {
    return title;
  }

  context.logger.debug(
    `Entity ID collision: ${entityType}/${proposedId}, asking AI for a new title`,
  );

  const titleSchema = z.object({
    title: z.string().max(80).describe("A short, unique title (2-6 words)"),
  });

  const { object } = await context.ai.generateObject(
    `The title "${title}" is already taken. ${regeneratePrompt}`,
    titleSchema,
  );

  const newTitle = object.title;
  context.logger.debug(`AI suggested new title: "${newTitle}"`);

  return newTitle;
}
