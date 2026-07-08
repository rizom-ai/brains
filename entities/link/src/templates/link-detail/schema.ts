import { z } from "@brains/utils/zod";
import type { LinkStatus } from "../../schemas/link";

export interface LinkDetailSource {
  ref: string;
  label: string;
}

export interface LinkDetail {
  status: LinkStatus;
  title: string;
  url: string;
  description?: string | undefined;
  domain: string;
  capturedAt: string;
  source: LinkDetailSource;
  id: string;
  summary?: string | undefined;
}

export interface LinkDetailData {
  link: LinkDetail;
  prevLink: LinkDetail | null;
  nextLink: LinkDetail | null;
}

const linkSourceSchema: z.ZodType<LinkDetailSource> = z.object({
  ref: z.string(),
  label: z.string(),
});

const linkDetailSchema: z.ZodType<LinkDetail> = z.object({
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

// Schema for link detail page data
export const linkDetailDataSchema: z.ZodType<LinkDetailData> = z.object({
  link: linkDetailSchema,
  prevLink: linkDetailSchema.nullable(),
  nextLink: linkDetailSchema.nullable(),
});
