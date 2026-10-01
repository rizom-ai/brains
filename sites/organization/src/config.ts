import { z } from "@brains/utils/zod";

/** The organization site has nothing to configure: the atlas is its homepage. */
export const organizationSiteConfigSchema: z.ZodObject<Record<string, never>> =
  z.object({});

export type OrganizationSiteConfig = z.output<
  typeof organizationSiteConfigSchema
>;
export type OrganizationSiteConfigInput = z.input<
  typeof organizationSiteConfigSchema
>;
