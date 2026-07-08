import { z } from "@brains/utils/zod";
import type { LinkStatus } from "../../schemas/link";

export interface LinkSummarySource {
  ref: string;
  label: string;
}

export interface LinkSummary {
  status: LinkStatus;
  title: string;
  url: string;
  description?: string | undefined;
  domain: string;
  capturedAt: string;
  source: LinkSummarySource;
  id: string;
  summary?: string | undefined;
}

export interface LinkListData {
  links: LinkSummary[];
  totalCount: number;
}

const linkSourceSchema: z.ZodType<LinkSummarySource> = z.object({
  ref: z.string(),
  label: z.string(),
});

const linkSummarySchema: z.ZodType<LinkSummary> = z.object({
  status: z.enum(["pending", "draft", "published"]),
  title: z.string(),
  url: z.url(),
  description: z.string().optional(),
  domain: z.string(),
  capturedAt: z.string().datetime(),
  source: linkSourceSchema,
  id: z.string(),
  summary: z.string().optional(),
});

// Schema for link list page data
export const linkListSchema: z.ZodType<LinkListData> = z.object({
  links: z.array(linkSummarySchema),
  totalCount: z.number(),
});
