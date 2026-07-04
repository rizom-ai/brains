import { z } from "@brains/utils/zod";
import type { ICoreEntityService } from "@brains/entity-service";
import { AnchorProfileAdapter } from "./anchor-profile-adapter";

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
 * Shared professional profile fields.
 *
 * The base anchor-profile schema remains brain-model agnostic. Brain models
 * and site compositions that operate on professional profiles can opt into
 * this extension explicitly.
 */
export const professionalProfileExtension = baseProfileExtension.extend({
  role: z.string().optional().describe("Professional role or working identity"),
  audience: z
    .string()
    .optional()
    .describe("Primary audience or community served"),
  expertise: z
    .array(z.string())
    .optional()
    .describe("Skills, domains, areas of focus"),
  currentFocus: z
    .string()
    .optional()
    .describe("What you're currently working on"),
  availability: z
    .string()
    .optional()
    .describe("What you're open to (consulting, speaking, etc.)"),
  desiredTone: z
    .string()
    .optional()
    .describe("Preferred tone for profile-shaped outputs"),
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

/**
 * Fetch the anchor-profile entity and parse its body with the given schema.
 * Combines {@link fetchAnchorProfile} with the adapter parse step that every
 * profile consumer otherwise repeats.
 */
export async function fetchAnchorProfileData<T extends Record<string, unknown>>(
  entityService: ICoreEntityService,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const content = await fetchAnchorProfile(entityService);
  return new AnchorProfileAdapter().parseProfileBody(content, schema);
}
