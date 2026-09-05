import { z } from "@brains/utils/zod";
import type { SiteContentDefinition } from "../definitions";

const siteContentDefinitionShapeSchema = z.object({
  namespace: z.string(),
  sections: z.record(z.string(), z.any()),
});

const siteContentDefinitionConfigSchema: z.ZodCustom<
  SiteContentDefinition,
  SiteContentDefinition
> = z.custom<SiteContentDefinition>(
  (value) => siteContentDefinitionShapeSchema.safeParse(value).success,
);

export const siteContentPluginConfigSchema: z.ZodObject<{
  definitions: z.ZodOptional<
    z.ZodUnion<
      readonly [
        typeof siteContentDefinitionConfigSchema,
        z.ZodArray<typeof siteContentDefinitionConfigSchema>,
      ]
    >
  >;
}> = z.object({
  definitions: z
    .union([
      siteContentDefinitionConfigSchema,
      z.array(siteContentDefinitionConfigSchema),
    ])
    .optional(),
});

export type SiteContentPluginConfig = z.output<
  typeof siteContentPluginConfigSchema
>;
export type SiteContentPluginConfigInput = z.input<
  typeof siteContentPluginConfigSchema
>;
