import { z } from "@brains/utils/zod";

type LinkSummarySchema = z.ZodObject<{
  status: z.ZodEnum<{
    pending: "pending";
    draft: "draft";
    published: "published";
  }>;
  title: z.ZodString;
  url: z.ZodURL;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  domain: z.ZodString;
  capturedAt: z.ZodString;
  source: z.ZodObject<{ ref: z.ZodString; label: z.ZodString }>;
  id: z.ZodString;
  summary: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}>;

const linkSummarySchema: LinkSummarySchema = z.object({
  status: z.enum(["pending", "draft", "published"]),
  title: z.string(),
  url: z.url(),
  description: z.string().nullable().default(null),
  domain: z.string(),
  capturedAt: z.string().datetime(),
  source: z.object({
    ref: z.string(),
    label: z.string(),
  }),
  id: z.string(),
  summary: z.string().nullable().default(null),
});

export type LinkSummary = z.output<typeof linkSummarySchema>;
export type LinkSummarySource = LinkSummary["source"];

// Schema for link list page data
export const linkListSchema: z.ZodObject<{
  links: z.ZodArray<LinkSummarySchema>;
  totalCount: z.ZodNumber;
}> = z.object({
  links: z.array(linkSummarySchema),
  totalCount: z.number(),
});

export type LinkListData = z.output<typeof linkListSchema>;
