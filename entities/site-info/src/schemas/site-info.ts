import { z } from "@brains/utils/zod";
import { socialLinkSchema, type SocialLink } from "@brains/contracts";
import {
  siteInfoBodySchema,
  type ResolvedSiteInfoBody,
} from "./site-info-schema";

export interface SiteInfoNavigationItem {
  label: string;
  href: string;
  priority: number;
}

export type SiteInfoSocialLink = SocialLink;

export interface SiteInfo extends ResolvedSiteInfoBody {
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

type SiteInfoSocialLinkSchema = typeof socialLinkSchema;
const siteInfoSocialLinkSchema: SiteInfoSocialLinkSchema = socialLinkSchema;

/**
 * Schema for site information
 * Extends the body schema with resolved display metadata and layout data.
 */
export const SiteInfoSchema: ReturnType<
  typeof siteInfoBodySchema.extend<{
    title: z.ZodString;
    description: z.ZodString;
    navigation: SiteInfoNavigationSchema;
    copyright: z.ZodString;
    socialLinks: z.ZodOptional<z.ZodArray<SiteInfoSocialLinkSchema>>;
  }>
> = siteInfoBodySchema.extend({
  title: z.string(),
  description: z.string(),
  navigation: siteInfoNavigationSchema,
  copyright: z.string(), // Override: datasource always provides copyright (uses default if not in entity)
  socialLinks: z
    .array(siteInfoSocialLinkSchema)
    .optional()
    .describe("Social media links composed by a site integration"),
});
