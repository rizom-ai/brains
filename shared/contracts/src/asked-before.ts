import { z } from "@brains/utils/zod";
import { SourceCitationSchema } from "./agent-response";

/**
 * A visitor's question, put to whoever keeps published FAQs before the model
 * is asked. A hit answers the turn in the model's place, with the sources the
 * FAQ kept from the reply that first gave the answer.
 */
export const GUEST_ASKED_BEFORE_CHANNEL = "guest:asked-before";

type AskedBeforeRequestSchema = z.ZodObject<{ question: z.ZodString }>;

export const askedBeforeRequestSchema: AskedBeforeRequestSchema = z.object({
  question: z.string().trim().min(1),
});

export type AskedBeforeRequest = z.output<typeof askedBeforeRequestSchema>;

type AskedBeforeHitSchema = z.ZodObject<{
  faqId: z.ZodString;
  faqQuestion: z.ZodString;
  answer: z.ZodString;
  sources: z.ZodDefault<z.ZodArray<typeof SourceCitationSchema>>;
}>;

export const askedBeforeHitSchema: AskedBeforeHitSchema = z.object({
  faqId: z.string().min(1),
  faqQuestion: z.string().min(1),
  answer: z.string().trim().min(1),
  sources: z.array(SourceCitationSchema).default([]),
});

export type AskedBeforeHit = z.output<typeof askedBeforeHitSchema>;

type AskedBeforeResponseSchema = z.ZodObject<{
  hit: z.ZodOptional<AskedBeforeHitSchema>;
}>;

/** No hit is an ordinary answer: the turn goes to the model. */
export const askedBeforeResponseSchema: AskedBeforeResponseSchema = z.object({
  hit: askedBeforeHitSchema.optional(),
});

export type AskedBeforeResponse = z.output<typeof askedBeforeResponseSchema>;

/**
 * The first well-formed hit among the answers collected on the channel; a
 * malformed answer is no answer, never a failure of the turn.
 */
export function firstAskedBeforeHit(
  responses: readonly unknown[],
): AskedBeforeHit | undefined {
  for (const response of responses) {
    const parsed = askedBeforeResponseSchema.safeParse(response);
    if (parsed.success && parsed.data.hit) return parsed.data.hit;
  }
  return undefined;
}
