import { z } from "@brains/utils/zod";

/** A published FAQ as the homepage shows it: its question and its answer. */
export const homepageFaqSchema: z.ZodObject<{
  id: z.ZodString;
  question: z.ZodString;
  answer: z.ZodString;
}> = z.object({
  id: z.string(),
  question: z.string(),
  /** Markdown: the owner's chosen answer, never its alternatives. */
  answer: z.string(),
});

/** Most asked first; empty until the owner publishes one. */
export const homepageFaqsSchema: z.ZodDefault<
  z.ZodArray<typeof homepageFaqSchema>
> = z.array(homepageFaqSchema).default([]);

export type HomepageFaq = z.output<typeof homepageFaqSchema>;
