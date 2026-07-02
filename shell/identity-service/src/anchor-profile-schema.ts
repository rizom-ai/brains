import { z } from "@brains/utils/zod-v4";
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

export interface AnchorProfile {
  name: string;
  kind: "professional" | "team" | "collective";
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
  kind: z.ZodEnum<{
    professional: "professional";
    team: "team";
    collective: "collective";
  }>;
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
  kind: z
    .enum(["professional", "team", "collective"])
    .describe("Type of anchor: professional (individual), team, or collective"),
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
