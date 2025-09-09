import { z } from "@brains/utils";

/**
 * Schema for site information
 */
export const SiteInfoSchema = z.object({
  title: z.string(),
  description: z.string(),
  url: z.string().optional(),
  navigation: z.object({
    primary: z.array(
      z.object({
        label: z.string(),
        href: z.string(),
        priority: z.number(),
      }),
    ),
    secondary: z.array(
      z.object({
        label: z.string(),
        href: z.string(),
        priority: z.number(),
      }),
    ),
  }),
  copyright: z.string(),
});

export type SiteInfo = z.infer<typeof SiteInfoSchema>;
