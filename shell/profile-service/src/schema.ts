import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Profile entity schema
 * Profile data (name, description, socialLinks) is stored in content field as structured markdown
 */
export const profileSchema = baseEntitySchema.extend({
  id: z.literal("profile"),
  entityType: z.literal("profile"),
});

/**
 * Profile entity type derived from schema
 */
export type ProfileEntity = z.infer<typeof profileSchema>;

/**
 * Profile body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const profileBodySchema = z.object({
  name: z.string().describe("Name (person or organization)"),
  description: z.string().optional().describe("Short description or biography"),
  tagline: z
    .string()
    .optional()
    .describe("Short, punchy one-liner for homepage"),
  intro: z
    .string()
    .optional()
    .describe("Optional longer introduction for homepage"),
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
 * Profile body type
 */
export type ProfileBody = z.infer<typeof profileBodySchema>;
