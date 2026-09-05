import { z } from "@brains/utils/zod";
import { linkStatusSchema } from "../../schemas/link";

const linkSourceSchema: z.ZodObject<{ ref: z.ZodString; label: z.ZodString }> =
  z.object({
    ref: z.string(),
    label: z.string(),
  });

export type LinkDetailSource = z.output<typeof linkSourceSchema>;

const linkDetailSchema: z.ZodObject<{
  status: typeof linkStatusSchema;
  title: z.ZodString;
  url: z.ZodURL;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  domain: z.ZodString;
  capturedAt: z.ZodString;
  source: typeof linkSourceSchema;
  id: z.ZodString;
  summary: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  status: linkStatusSchema,
  title: z.string(),
  url: z.url(),
  description: z.string().nullable().default(null),
  domain: z.string(),
  capturedAt: z.string().datetime(),
  source: linkSourceSchema,
  id: z.string(),
  summary: z.string().nullable().default(null),
});

export type LinkDetail = z.output<typeof linkDetailSchema>;

// Schema for link detail page data
export const linkDetailDataSchema: z.ZodObject<{
  link: typeof linkDetailSchema;
  prevLink: z.ZodNullable<typeof linkDetailSchema>;
  nextLink: z.ZodNullable<typeof linkDetailSchema>;
}> = z.object({
  link: linkDetailSchema,
  prevLink: linkDetailSchema.nullable(),
  nextLink: linkDetailSchema.nullable(),
});

export type LinkDetailData = z.output<typeof linkDetailDataSchema>;
