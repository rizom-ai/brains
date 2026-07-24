import { z } from "@brains/utils/zod";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Anchor profile entity schema
 * Profile data (name, description, socialLinks) is stored in content field as structured markdown
 */
export const anchorProfileSchema: ReturnType<
  typeof baseEntitySchema.extend<{
    id: z.ZodLiteral<"anchor-profile">;
    entityType: z.ZodLiteral<"anchor-profile">;
  }>
> = baseEntitySchema.extend({
  id: z.literal("anchor-profile"),
  entityType: z.literal("anchor-profile"),
});

/**
 * Anchor profile entity type derived from schema
 */
export type AnchorProfileEntity = z.infer<typeof anchorProfileSchema>;

export interface AnchorProfileSocialLink {
  platform: "github" | "instagram" | "linkedin" | "email" | "website";
  url: string;
  label?: string | undefined;
}

export type AnchorProfileKindSchema = z.ZodEnum<{
  person: "person";
  team: "team";
  organization: "organization";
}>;

export const anchorProfileKindSchema: AnchorProfileKindSchema = z.enum([
  "person",
  "team",
  "organization",
]);

export type AnchorProfileKind = z.infer<typeof anchorProfileKindSchema>;

/**
 * Legacy → canonical anchor kinds for a brain's OWN authored content.
 *
 * Mirrors `ANCHOR_KIND_ALIASES` in `@brains/atproto-contracts`, which converts
 * kinds on cards discovered from peers. Here we coerce the singleton a brain
 * reads from its own content repo, so upgrading past the kind rename transitions
 * a pre-cutover value automatically instead of failing closed to fallback
 * identity. The canonical value is written back on the next serialization.
 *
 * `anchorProfileKindSchema` above stays a strict enum for AI-output and public
 * contract schemas; only authored-content parsing tolerates the legacy input.
 */
const ANCHOR_PROFILE_KIND_ALIASES: Record<string, AnchorProfileKind> = {
  professional: "person",
  collective: "organization",
};

export const authoredAnchorProfileKindSchema: z.ZodType<AnchorProfileKind> = z
  .preprocess(
    (value) =>
      typeof value === "string" && value in ANCHOR_PROFILE_KIND_ALIASES
        ? ANCHOR_PROFILE_KIND_ALIASES[value]
        : value,
    anchorProfileKindSchema,
  )
  .describe("Type of anchor: person, team, or organization");

export interface AnchorProfile {
  name: string;
  kind: AnchorProfileKind;
  organization?: string | undefined;
  description?: string | undefined;
  avatar?: string | undefined;
  website?: string | undefined;
  email?: string | undefined;
  socialLinks?: AnchorProfileSocialLink[] | undefined;
}

type SocialLinkSchema = z.ZodObject<{
  platform: z.ZodEnum<{
    github: "github";
    instagram: "instagram";
    linkedin: "linkedin";
    email: "email";
    website: "website";
  }>;
  url: z.ZodString;
  label: z.ZodOptional<z.ZodString>;
}>;

export type AnchorProfileBodySchema = z.ZodObject<{
  name: z.ZodString;
  kind: z.ZodType<AnchorProfileKind>;
  organization: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  avatar: z.ZodOptional<z.ZodString>;
  website: z.ZodOptional<z.ZodString>;
  email: z.ZodOptional<z.ZodString>;
  socialLinks: z.ZodOptional<z.ZodArray<SocialLinkSchema>>;
}>;

/**
 * Anchor profile body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const anchorProfileBodySchema: AnchorProfileBodySchema = z.object({
  name: z.string().describe("Name (person or organization)"),
  kind: authoredAnchorProfileKindSchema,
  organization: z
    .string()
    .optional()
    .describe("Organization the anchor belongs to"),
  description: z.string().optional().describe("Short description or biography"),
  avatar: z.string().optional().describe("URL or asset path to avatar/logo"),
  website: z.string().optional().describe("Primary website URL"),
  email: z.string().optional().describe("Contact email"),
  socialLinks: z
    .array(
      z.object({
        platform: z
          .enum(["github", "instagram", "linkedin", "email", "website"])
          .describe("Social media platform"),
        url: z.string().describe("Profile or contact URL"),
        label: z.string().optional().describe("Optional display label"),
      }),
    )
    .optional()
    .describe("Social media and contact links"),
});
