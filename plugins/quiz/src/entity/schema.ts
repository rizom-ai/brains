import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

type ResultSchema = z.ZodObject<
  {
    dimension: z.ZodString;
    title: z.ZodString;
    outcome: z.ZodString;
    outcomeTitle: z.ZodString;
  },
  z.core.$strict
>;
/** One dimension's result, as the taker was shown it. */
const resultSchema: ResultSchema = z.strictObject({
  dimension: z.string(),
  title: z.string(),
  outcome: z.string(),
  outcomeTitle: z.string(),
});
type AnswerSchema = z.ZodObject<
  {
    field: z.ZodString;
    label: z.ZodString;
    value: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString>]>;
  },
  z.core.$strict
>;
/** One answer as the taker saw it: the question and what they gave or
 * chose, in words, never the option's value. */
const answerSchema: AnswerSchema = z.strictObject({
  field: z.string(),
  label: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
});

const statusSchema: z.ZodEnum<{ new: "new"; handled: "handled" }> = z.enum([
  "new",
  "handled",
]);
const notificationSchema: z.ZodEnum<{
  pending: "pending";
  sent: "sent";
  failed: "failed";
  none: "none";
}> = z.enum(["pending", "sent", "failed", "none"]);

type QuizResultFrontmatterSchema = z.ZodObject<
  {
    quiz: z.ZodString;
    language: z.ZodOptional<z.ZodString>;
    receivedAt: z.ZodISODateTime;
    status: typeof statusSchema;
    notification: typeof notificationSchema;
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodEmail>;
    results: z.ZodArray<ResultSchema>;
    answers: z.ZodArray<AnswerSchema>;
  },
  z.core.$strict
>;
/** A quiz result says itself what was asked and answered: a later edit to
 * the quiz never changes what an older result says. */
export const quizResultFrontmatterSchema: QuizResultFrontmatterSchema =
  z.strictObject({
    quiz: z.string().meta({ studioWidget: "provenance" }),
    language: z.string().optional().meta({ studioWidget: "provenance" }),
    receivedAt: z.iso.datetime().meta({ studioWidget: "provenance" }),
    status: statusSchema,
    notification: notificationSchema.meta({ studioWidget: "provenance" }),
    name: z.string().max(200).optional().meta({ studioWidget: "provenance" }),
    email: z.email().max(254).optional().meta({ studioWidget: "provenance" }),
    results: z.array(resultSchema).max(20).meta({ studioWidget: "provenance" }),
    answers: z
      .array(answerSchema)
      .max(200)
      .meta({ studioWidget: "provenance" }),
  });
export type QuizResultFrontmatter = z.output<
  typeof quizResultFrontmatterSchema
>;

type QuizResultMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  quiz: z.ZodString;
  receivedAt: z.ZodISODateTime;
  status: typeof statusSchema;
  notification: typeof notificationSchema;
  contact: z.ZodBoolean;
}>;
export const quizResultMetadataSchema: QuizResultMetadataSchema = z.object({
  title: z.string(),
  quiz: z.string(),
  receivedAt: z.iso.datetime(),
  status: statusSchema,
  notification: notificationSchema,
  /** Whether the taker left an email to be answered at. */
  contact: z.boolean(),
});
export type QuizResultMetadata = z.output<typeof quizResultMetadataSchema>;

export const quizResultSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"quiz-result">;
    visibility: z.ZodLiteral<"restricted">;
    metadata: QuizResultMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("quiz-result"),
  visibility: z.literal("restricted"),
  metadata: quizResultMetadataSchema,
});
export type QuizResult = z.output<typeof quizResultSchema>;
