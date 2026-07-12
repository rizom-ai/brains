import { z } from "@brains/utils/zod";
import { siteInfoBodySchema, type SiteInfoBody } from "./site-info-schema";

export interface SiteInfoNavigationItem {
  label: string;
  href: string;
  priority: number;
}

export interface SiteInfoSocialLink {
  platform: "github" | "instagram" | "linkedin" | "email" | "website";
  url: string;
  label?: string | undefined;
}

export interface SiteInfo extends SiteInfoBody {
  navigation: {
    primary: SiteInfoNavigationItem[];
    secondary: SiteInfoNavigationItem[];
  };
  copyright: string;
  socialLinks?: SiteInfoSocialLink[] | undefined;
}

type SiteInfoNavigationItemSchema = z.ZodObject<{
  label: z.ZodString;
  href: z.ZodString;
  priority: z.ZodNumber;
}>;

const siteInfoNavigationItemSchema: SiteInfoNavigationItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  priority: z.number(),
});

type SiteInfoNavigationSchema = z.ZodObject<{
  primary: z.ZodArray<SiteInfoNavigationItemSchema>;
  secondary: z.ZodArray<SiteInfoNavigationItemSchema>;
}>;

const siteInfoNavigationSchema: SiteInfoNavigationSchema = z.object({
  primary: z.array(siteInfoNavigationItemSchema),
  secondary: z.array(siteInfoNavigationItemSchema),
});

type SiteInfoSocialLinkSchema = z.ZodObject<{
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

const siteInfoSocialLinkSchema: SiteInfoSocialLinkSchema = z.object({
  platform: z
    .enum(["github", "instagram", "linkedin", "email", "website"])
    .describe("Social media platform"),
  url: z.string().describe("Profile or contact URL"),
  label: z.string().optional().describe("Optional display label"),
});

/**
 * Schema for site information
 * Extends the body schema with navigation and socialLinks (from profile entity)
 */
export const SiteInfoSchema: ReturnType<
  typeof siteInfoBodySchema.extend<{
    navigation: SiteInfoNavigationSchema;
    copyright: z.ZodString;
    socialLinks: z.ZodOptional<z.ZodArray<SiteInfoSocialLinkSchema>>;
  }>
> = siteInfoBodySchema.extend({
  navigation: siteInfoNavigationSchema,
  copyright: z.string(), // Override: datasource always provides copyright (uses default if not in entity)
  socialLinks: z
    .array(siteInfoSocialLinkSchema)
    .optional()
    .describe("Social media links from profile entity"),
});
