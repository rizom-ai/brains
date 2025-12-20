import { z } from "@brains/utils";
import { linkBodySchema } from "../../schemas/link";

// Schema for link detail - extends linkBody with id
const linkDetailSchema = linkBodySchema.extend({
  id: z.string(),
  title: z.string(),
});

// Schema for link detail page data
export const linkDetailDataSchema = z.object({
  link: linkDetailSchema,
  prevLink: linkDetailSchema.nullable(),
  nextLink: linkDetailSchema.nullable(),
});

export type LinkDetail = z.infer<typeof linkDetailSchema>;
export type LinkDetailData = z.infer<typeof linkDetailDataSchema>;
