import { z } from "@brains/utils/zod";
import type { SiteContentDefinition } from "../definitions";

const siteContentDefinitionShapeSchema = z.object({
  namespace: z.string(),
  sections: z.record(z.string(), z.any()),
});

const siteContentDefinitionConfigSchema: z.ZodType<
  SiteContentDefinition,
  SiteContentDefinition
> = z.custom<SiteContentDefinition>(
  (value) => siteContentDefinitionShapeSchema.safeParse(value).success,
);

export interface SiteContentPluginConfig {
  definitions?: SiteContentDefinition | SiteContentDefinition[] | undefined;
}

export type SiteContentPluginConfigInput = SiteContentPluginConfig;

export const siteContentPluginConfigSchema: z.ZodType<
  SiteContentPluginConfig,
  SiteContentPluginConfigInput
> = z.object({
  definitions: z
    .union([
      siteContentDefinitionConfigSchema,
      z.array(siteContentDefinitionConfigSchema),
    ])
    .optional(),
});
