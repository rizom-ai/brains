import { UserPermissionLevelSchema } from "@brains/sdk/services";
import { z } from "@brains/utils/zod";

export const faqCaptureJobSchema: z.ZodObject<{
  conversationId: z.ZodString;
  messageId: z.ZodString;
  userPermissionLevel: typeof UserPermissionLevelSchema;
  position: z.ZodNumber;
}> = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  userPermissionLevel: UserPermissionLevelSchema,
  /** The reply's 1-based position in its conversation when it was stored. */
  position: z.number().int().nonnegative(),
});
export type FaqCaptureJobData = z.output<typeof faqCaptureJobSchema>;

export const faqClassificationSchema: z.ZodObject<{
  reusable: z.ZodBoolean;
  question: z.ZodString;
  answer: z.ZodString;
}> = z.object({
  reusable: z
    .boolean()
    .describe(
      "True only when other people could plausibly ask this question and the answer stands on its own.",
    ),
  question: z
    .string()
    .describe(
      "The question rewritten to stand alone; empty when not reusable.",
    ),
  answer: z
    .string()
    .describe(
      "The answer rewritten as standalone markdown; empty when not reusable.",
    ),
});
export type FaqClassification = z.output<typeof faqClassificationSchema>;
export const faqCaptureResultSchema: z.ZodType<FaqCaptureResult> = z.union([
  z.object({
    captured: z.literal(true),
    entityId: z.string(),
    merged: z.boolean(),
  }),
  z.object({
    captured: z.literal(false),
    reason: z.enum([
      "answer-not-found",
      "no-question",
      "already-captured",
      "not-reusable",
    ]),
  }),
]);

export type FaqCaptureResult =
  | { captured: true; entityId: string; merged: boolean }
  | {
      captured: false;
      reason:
        | "answer-not-found"
        | "no-question"
        | "already-captured"
        | "not-reusable";
    };
