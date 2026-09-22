import { askContentSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";

export interface HomepageOpeningContent {
  title: string | null;
  introduction: string | null;
  topics: string[];
  contactUrl: string;
}
/** The shared authoring contract remains authoritative. Normalize absent fields
 * only at the JSON snapshot boundary; this is not another editable copy schema.
 */
export const homepageOpeningSchema: z.ZodType<HomepageOpeningContent | null> =
  askContentSchema
    .extend({
      contactUrl: z
        .string()
        .url()
        .regex(/^https?:\/\//),
      title: askContentSchema.shape.title.unwrap().nullable().default(null),
      introduction: askContentSchema.shape.introduction
        .unwrap()
        .nullable()
        .default(null),
      topics: askContentSchema.shape.topics.unwrap().default([]),
    })
    .nullable()
    .default(null);
