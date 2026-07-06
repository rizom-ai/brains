import { z } from "@brains/utils/zod";
import type { ICoreEntityService } from "@brains/entity-service";

export interface BaseProfileExtension {
  tagline?: string | undefined;
  intro?: string | undefined;
  story?: string | undefined;
}

export type BaseProfileExtensionSchema = z.ZodObject<{
  tagline: z.ZodOptional<z.ZodString>;
  intro: z.ZodOptional<z.ZodString>;
  story: z.ZodOptional<z.ZodString>;
}>;

/**
 * Shared profile fields used by all layout packages.
 * Layout-specific extensions (e.g. expertise, availability) extend this.
 */
export const baseProfileExtension: BaseProfileExtensionSchema = z.object({
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

export interface ProfessionalProfileExtension extends BaseProfileExtension {
  role?: string | undefined;
  audience?: string | undefined;
  expertise?: string[] | undefined;
  currentFocus?: string | undefined;
  availability?: string | undefined;
  desiredTone?: string | undefined;
}

export type ProfessionalProfileExtensionSchema = ReturnType<
  typeof baseProfileExtension.extend<{
    role: z.ZodOptional<z.ZodString>;
    audience: z.ZodOptional<z.ZodString>;
    expertise: z.ZodOptional<z.ZodArray<z.ZodString>>;
    currentFocus: z.ZodOptional<z.ZodString>;
    availability: z.ZodOptional<z.ZodString>;
    desiredTone: z.ZodOptional<z.ZodString>;
  }>
>;

/**
 * Shared professional profile fields.
 *
 * The base anchor-profile schema remains brain-model agnostic. Brain models
 * and site compositions that operate on professional profiles can opt into
 * this extension explicitly.
 */
export const professionalProfileExtension: ProfessionalProfileExtensionSchema =
  baseProfileExtension.extend({
    role: z
      .string()
      .optional()
      .describe("Professional role or working identity"),
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
