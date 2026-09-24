import type { EntityGrouping } from "@brains/sdk/services";
import { z } from "@brains/utils/zod";

export const GROUPING_VOCABULARY_TYPE = "grouping-vocabulary";

// Browser form validation. The runtime independently admits grouping keys;
// importing its service entry here would pull server dependencies into the UI.
const groupingKeySchema: z.ZodString = z.string().min(1).max(80);

export const groupingVocabularySchema: z.ZodObject<{
  multiple: z.ZodBoolean;
  values: z.ZodArray<z.ZodString>;
}> = z
  .object({
    multiple: z.boolean(),
    values: z.array(z.string().min(1)).min(1),
  })
  .superRefine((vocabulary, context) => {
    const seen = new Set<string>();
    vocabulary.values.forEach((value, index) => {
      if (seen.has(value))
        context.addIssue({
          code: "custom",
          path: ["values", index],
          message: "Values must be unique (matching is exact).",
        });
      seen.add(value);
    });
  });

export const groupingVocabularyFrontmatterSchema: z.ZodObject<{
  groupings: z.ZodDefault<
    z.ZodRecord<typeof groupingKeySchema, typeof groupingVocabularySchema>
  >;
}> = z.object({
  groupings: z.record(groupingKeySchema, groupingVocabularySchema).default({}),
});

export type GroupingVocabulary = z.output<typeof groupingVocabularySchema>;
export type GroupingVocabularyFrontmatter = z.output<
  typeof groupingVocabularyFrontmatterSchema
>;
export interface StudioGrouping extends EntityGrouping {
  vocabulary?: GroupingVocabulary;
}
