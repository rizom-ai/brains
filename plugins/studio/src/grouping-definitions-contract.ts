import {
  entityGroupingSchema,
  type EntityGrouping,
} from "@brains/plugins/contracts/grouping";
import { z } from "@brains/utils/zod";

export const GROUPING_DEFINITIONS_TYPE = "grouping-definitions";
export const MAX_GROUPING_DEFINITIONS = 20;

export const groupingDefinitionSchema: z.ZodObject<
  {
    label: z.ZodString;
    types: typeof entityGroupingSchema.shape.types;
    multiple: z.ZodBoolean;
    values: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strict
> = z.strictObject({
  label: entityGroupingSchema.shape.label,
  types: entityGroupingSchema.shape.types.refine(
    (types) => !types.includes(GROUPING_DEFINITIONS_TYPE),
    "The grouping definitions document cannot be a grouping contributor.",
  ),
  multiple: z.boolean(),
  values: z
    .array(z.string().min(1))
    .min(1)
    .superRefine((values, context) => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value))
          context.addIssue({
            code: "custom",
            path: [index],
            message: "Values must be unique (matching is exact).",
          });
        seen.add(value);
      });
    })
    .optional(),
});

export const groupingDefinitionsFrontmatterSchema: z.ZodObject<{
  groupings: z.ZodDefault<
    z.ZodRecord<z.ZodString, typeof groupingDefinitionSchema>
  >;
}> = z.object({
  groupings: z
    .record(entityGroupingSchema.shape.key, groupingDefinitionSchema)
    .refine(
      (groupings) => Object.keys(groupings).length <= MAX_GROUPING_DEFINITIONS,
      `Define at most ${MAX_GROUPING_DEFINITIONS} groupings.`,
    )
    .default({}),
});

export type GroupingDefinition = z.output<typeof groupingDefinitionSchema>;
export type GroupingDefinitionsFrontmatter = z.output<
  typeof groupingDefinitionsFrontmatterSchema
>;

export type GroupingValueRules = Pick<
  GroupingDefinition,
  "multiple" | "values"
>;
export interface StudioGrouping extends EntityGrouping {
  rules?: GroupingValueRules;
}

export interface GroupingDefinitionIssue {
  path: Array<string | number>;
  message: string;
}
export interface GroupingDefinitionsSnapshot extends GroupingDefinitionsFrontmatter {
  issues: GroupingDefinitionIssue[];
}
