import { z } from "@brains/utils/zod";
import {
  mailCategorySchema,
  mailPrioritySchema,
  type MailCategory,
  type MailPriority,
} from "../entity/schemas/mail-item";

interface RetainedMailClassificationValue {
  decision: "retain";
  title: string;
  category: MailCategory;
  priority: MailPriority;
  needsReply: boolean;
  organization?: string | undefined;
  requestedActions: string[];
  summary: string;
}

const retainedMailClassificationObjectSchema = z.strictObject({
  decision: z.literal("retain"),
  title: z.string().min(1).max(160),
  category: mailCategorySchema,
  priority: mailPrioritySchema,
  needsReply: z.boolean(),
  organization: z.string().min(1).max(200).optional(),
  requestedActions: z.array(z.string().min(1).max(240)).max(10),
  summary: z.string().min(1).max(1_000),
});

export const retainedMailClassificationSchema: z.ZodType<
  RetainedMailClassificationValue,
  RetainedMailClassificationValue
> = retainedMailClassificationObjectSchema;

interface DiscardedMailClassificationValue {
  decision: "discard";
  reason: "spam";
}

const discardedMailClassificationObjectSchema = z.strictObject({
  decision: z.literal("discard"),
  reason: z.literal("spam"),
});

export const discardedMailClassificationSchema: z.ZodType<
  DiscardedMailClassificationValue,
  DiscardedMailClassificationValue
> = discardedMailClassificationObjectSchema;

type MailTriageDecisionValue =
  RetainedMailClassificationValue | DiscardedMailClassificationValue;

export const mailTriageDecisionSchema: z.ZodType<
  MailTriageDecisionValue,
  MailTriageDecisionValue
> = z.discriminatedUnion("decision", [
  retainedMailClassificationObjectSchema,
  discardedMailClassificationObjectSchema,
]);

export type RetainedMailClassification = z.output<
  typeof retainedMailClassificationSchema
>;
export type DiscardedMailClassification = z.output<
  typeof discardedMailClassificationSchema
>;
export type MailTriageDecision = z.output<typeof mailTriageDecisionSchema>;
