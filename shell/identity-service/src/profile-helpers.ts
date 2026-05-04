import { z } from "@brains/utils";
import type { ICoreEntityService } from "@brains/entity-service";

/**
 * Shared profile fields used by all layout packages.
 * Layout-specific extensions (e.g. expertise, availability) extend this.
 */
export const baseProfileExtension = z.object({
  tagline: z
    .string()
    .optional()
    .describe("Short, punchy one-liner for homepage"),
  intro: z
    .string()
    .optional()
    .describe("Optional longer introduction for homepage"),
  story: z
    .string()
    .optional()
    .describe("Extended bio/narrative (multi-paragraph markdown)"),
});

/**
 * Fetch the anchor-profile entity content.
 * Returns the raw markdown string — caller parses with their own schema
 * via AnchorProfileAdapter.parseProfileBody(content, schema).
 */
export async function fetchAnchorProfile(
  entityService: ICoreEntityService,
): Promise<string> {
  const entities = await entityService.listEntities({
    entityType: "anchor-profile",
    options: {
      limit: 1,
    },
  });
  const entity = entities[0];
  if (!entity) {
    throw new Error("Profile not found — create an anchor-profile entity");
  }
  return entity.content;
}
