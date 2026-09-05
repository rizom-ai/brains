import { z } from "@brains/utils/zod";
import {
  mailCategorySchema,
  mailPrioritySchema,
} from "../entity/schemas/mail-item";

type RetainedMailClassificationSchema = z.ZodObject<
  {
    decision: z.ZodLiteral<"retain">;
    title: z.ZodString;
    category: typeof mailCategorySchema;
    priority: typeof mailPrioritySchema;
    needsReply: z.ZodBoolean;
    organization: z.ZodOptional<z.ZodString>;
    requestedActions: z.ZodArray<z.ZodString>;
    summary: z.ZodString;
  },
  z.core.$strict
>;

export const retainedMailClassificationSchema: RetainedMailClassificationSchema =
  z.strictObject({
    decision: z.literal("retain"),
    title: z.string().min(1).max(160),
    category: mailCategorySchema,
    priority: mailPrioritySchema,
    needsReply: z.boolean(),
    organization: z.string().min(1).max(200).optional(),
    requestedActions: z.array(z.string().min(1).max(240)).max(10),
    summary: z.string().min(1).max(1_000),
  });

type DiscardedMailClassificationSchema = z.ZodObject<
  { decision: z.ZodLiteral<"discard">; reason: z.ZodLiteral<"spam"> },
  z.core.$strict
>;

export const discardedMailClassificationSchema: DiscardedMailClassificationSchema =
  z.strictObject({
    decision: z.literal("discard"),
    reason: z.literal("spam"),
  });

type MailTriageDecisionSchema = z.ZodDiscriminatedUnion<
  [RetainedMailClassificationSchema, DiscardedMailClassificationSchema]
>;

export const mailTriageDecisionSchema: MailTriageDecisionSchema =
  z.discriminatedUnion("decision", [
    retainedMailClassificationSchema,
    discardedMailClassificationSchema,
  ]);

export type RetainedMailClassification = z.output<
  typeof retainedMailClassificationSchema
>;
export type DiscardedMailClassification = z.output<
  typeof discardedMailClassificationSchema
>;
export type MailTriageDecision = z.output<typeof mailTriageDecisionSchema>;
