import { askContentSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";

type AuthoredCopy = z.ZodDefault<z.ZodNullable<z.ZodString>>;

/** Absent authored copy becomes null: JSON snapshots have no undefined. */
function authoredCopy(field: z.ZodOptional<z.ZodString>): AuthoredCopy {
  return field.unwrap().nullable().default(null);
}

const copy = askContentSchema.shape;

/** The shared authoring contract remains authoritative. Normalize absent fields
 * only at the JSON snapshot boundary; this is not another editable copy schema.
 */
export const homepageOpeningSchema: z.ZodDefault<
  z.ZodNullable<
    z.ZodObject<{
      title: AuthoredCopy;
      introduction: AuthoredCopy;
      topics: z.ZodDefault<z.ZodArray<z.ZodString>>;
      topicsHeading: AuthoredCopy;
      contactLabel: AuthoredCopy;
      contactNote: AuthoredCopy;
      attribution: AuthoredCopy;
      mapCaption: AuthoredCopy;
      contactUrl: z.ZodURL;
    }>
  >
> = z
  .object({
    title: authoredCopy(copy.title),
    introduction: authoredCopy(copy.introduction),
    topics: copy.topics.unwrap().default([]),
    topicsHeading: authoredCopy(copy.topicsHeading),
    contactLabel: authoredCopy(copy.contactLabel),
    contactNote: authoredCopy(copy.contactNote),
    attribution: authoredCopy(copy.attribution),
    mapCaption: authoredCopy(copy.mapCaption),
    contactUrl: z.url({ protocol: /^https?$/ }),
  })
  .nullable()
  .default(null);

export type HomepageOpeningContent = NonNullable<
  z.output<typeof homepageOpeningSchema>
>;
