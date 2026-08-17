import { z } from "@brains/utils/zod";
import { linkStatusSchema } from "../../schemas/link";

// Types are derived from the schemas rather than written alongside them.
// Rendered data has to satisfy JsonObject, and TypeScript only gives an
// implicit index signature to type aliases — which is what z.output produces.

type LinkSourceSchema = z.ZodObject<{
  ref: z.ZodString;
  label: z.ZodString;
}>;

const linkSourceSchema: LinkSourceSchema = z.object({
  ref: z.string(),
  label: z.string(),
});

export type LinkSummarySource = z.output<typeof linkSourceSchema>;

type LinkSummarySchema = z.ZodObject<{
  status: typeof linkStatusSchema;
  title: z.ZodString;
  url: z.ZodURL;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  domain: z.ZodString;
  capturedAt: z.ZodString;
  source: LinkSourceSchema;
  id: z.ZodString;
  summary: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}>;

const linkSummarySchema: LinkSummarySchema = z.object({
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

export type LinkSummary = z.output<typeof linkSummarySchema>;

type LinkListSchema = z.ZodObject<{
  links: z.ZodArray<LinkSummarySchema>;
  totalCount: z.ZodNumber;
}>;

// Schema for link list page data
export const linkListSchema: LinkListSchema = z.object({
  links: z.array(linkSummarySchema),
  totalCount: z.number(),
});

export type LinkListData = z.output<typeof linkListSchema>;
