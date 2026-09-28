import {
  entityGroupingSchema,
  groupingValueSchema,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod";

export const MAX_GROUPING_DEFINITIONS = 20;
export const groupingDefinitionSchema: z.ZodObject<
  {
    label: z.ZodString;
    excludeTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    multiple: z.ZodBoolean;
    values: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strict
> = z.strictObject({
  label: entityGroupingSchema.shape.label,
  excludeTypes: z
    .array(entityGroupingSchema.shape.types.element)
    .max(100)
    .refine(
      (types) => new Set(types).size === types.length,
      "Excluded types must be unique.",
    )
    .optional(),
  multiple: z.boolean(),
  values: z
    .array(groupingValueSchema.min(1))
    .min(1)
    .max(100)
    .refine(
      (values) => new Set(values).size === values.length,
      "Values must be unique (matching is exact).",
    )
    .optional(),
});
export type GroupingDefinition = z.output<typeof groupingDefinitionSchema>;
export interface GroupingDefinitionsSnapshot {
  groupings: Record<string, GroupingDefinition>;
  issues: Array<{ path: Array<string | number>; message: string }>;
}
