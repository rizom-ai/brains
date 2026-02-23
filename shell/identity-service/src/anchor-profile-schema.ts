import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Anchor profile entity schema
 * Profile data (name, description, socialLinks) is stored in content field as structured markdown
 */
export const anchorProfileSchema = baseEntitySchema.extend({
  id: z.literal("anchor-profile"),
  entityType: z.literal("anchor-profile"),
});

/**
 * Anchor profile entity type derived from schema
 */
export type AnchorProfileEntity = z.infer<typeof anchorProfileSchema>;

/**
 * Anchor profile body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const anchorProfileBodySchema = z.object({
  name: z.string().describe("Name (person or organization)"),
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

/**
 * Anchor profile body type
 */
export type AnchorProfile = z.infer<typeof anchorProfileBodySchema>;
