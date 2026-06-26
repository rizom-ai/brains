import { z } from "@brains/utils/zod-v4";

const siteMetadataCTASchema = z.object({
  heading: z.string(),
  buttonText: z.string(),
  buttonLink: z.string(),
});

const siteMetadataSectionSchema = z.object({
  blurb: z.string().optional(),
});

export const siteBuilderSiteMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  url: z.string().optional(),
  copyright: z.string().optional(),
  logo: z.boolean().optional(),
  themeMode: z.enum(["light", "dark"]).optional(),
  analyticsScript: z.string().optional(),
  cta: siteMetadataCTASchema.optional(),
  sections: z.record(z.string(), siteMetadataSectionSchema).optional(),
});
