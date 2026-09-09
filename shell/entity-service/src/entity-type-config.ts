import { z } from "@brains/utils/zod";
import { definedFields } from "@brains/utils/strip-undefined";
import type { EntityTypeConfig } from "./types";

const entityTypeConfigSchema = z.object({
  weight: z.number().optional(),
  embeddable: z.boolean().optional(),
  fullTextSearchable: z.boolean().optional(),
  binaryStorage: z.literal("asset").optional(),
  projectionSource: z.boolean().optional(),
  projectionSourceRole: z
    .enum([
      "canonical",
      "primary",
      "secondary",
      "supporting",
      "ambient",
      "excluded",
    ])
    .optional(),
  publish: z.object({ publishStatuses: z.array(z.string()) }).optional(),
} satisfies Record<keyof EntityTypeConfig, z.ZodType>);

/** Validate declared metadata and detach nested policy data from its owner. */
export function copyEntityTypeConfig(
  config: EntityTypeConfig,
): EntityTypeConfig {
  return definedFields(entityTypeConfigSchema.parse(config));
}
