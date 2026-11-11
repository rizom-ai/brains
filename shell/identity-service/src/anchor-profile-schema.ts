import { z } from "@brains/utils/zod";
import { baseEntitySchema } from "@brains/entity-service";
import { socialLinkSchema, type SocialLink } from "@brains/contracts";

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

export type AnchorProfileSocialLink = SocialLink;

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

type SocialLinkSchema = typeof socialLinkSchema;

export type AnchorProfileBodySchema = z.ZodObject<{
  name: z.ZodString;
  organization: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  avatar: z.ZodOptional<z.ZodString>;
  photo: z.ZodOptional<z.ZodString>;
  website: z.ZodOptional<z.ZodString>;
  email: z.ZodOptional<z.ZodString>;
  socialLinks: z.ZodOptional<z.ZodArray<SocialLinkSchema>>;
}>;

/**
 * Anchor profile body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const anchorProfileBodySchema: AnchorProfileBodySchema = z.object({
  name: z.string().describe("Name of the anchor"),
  organization: z
    .string()
    .optional()
    .describe("Organization the anchor belongs to"),
  description: z.string().optional().describe("Short description or biography"),
  avatar: z.string().optional().describe("URL or asset path to avatar/logo"),
  photo: z
    .string()
    .optional()
    .describe(
      "A photo of the people behind the anchor, as ![alt](entity://image/<id>)",
    ),
  website: z.string().optional().describe("Primary website URL"),
  email: z.string().optional().describe("Contact email"),
  socialLinks: z
    .array(socialLinkSchema)
    .optional()
    .describe("Social media and contact links"),
});

export type AnchorProfile = z.output<typeof anchorProfileBodySchema>;
