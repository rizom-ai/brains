import { z } from "@brains/utils";

const siteContentDefinitionConfigSchema = z.object({
  namespace: z.string(),
  sections: z.record(z.any()),
});

export const siteContentPluginConfigSchema = z.object({
  definitions: z
    .union([
      siteContentDefinitionConfigSchema,
      z.array(siteContentDefinitionConfigSchema),
    ])
    .optional(),
});
