import { z } from "@brains/utils";

export const PullQuoteContentSchema = z.object({
  quote: z.string(),
  attribution: z.string(),
});

export type PullQuoteContent = z.infer<typeof PullQuoteContentSchema>;
