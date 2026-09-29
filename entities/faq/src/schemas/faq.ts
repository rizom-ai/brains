import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * FAQ status
 * - draft: captured from a chat, awaiting the owner
 * - published: approved by the owner
 */
export const faqStatusSchema: z.ZodEnum<{
  draft: "draft";
  published: "published";
}> = z.enum(["draft", "published"]);

export type FaqStatus = z.output<typeof faqStatusSchema>;

type FaqCandidateAnswerSchema = z.ZodObject<{
  messageId: z.ZodString;
  answer: z.ZodString;
}>;

/** A merged reply's own answer, kept for the owner to choose from. */
export const faqCandidateAnswerSchema: FaqCandidateAnswerSchema = z.object({
  messageId: z.string(),
  answer: z.string(),
});

export type FaqCandidateAnswer = z.output<typeof faqCandidateAnswerSchema>;

/**
 * FAQ frontmatter schema. The body holds the answer. `mergedMessageIds`
 * lists later replies that asked the same question at the same visibility;
 * `candidateAnswers` keeps their answers where they differ from the body.
 */
type FaqFrontmatterSchema = z.ZodObject<{
  question: z.ZodString;
  status: typeof faqStatusSchema;
  sourceConversationId: z.ZodString;
  sourceMessageId: z.ZodString;
  mergedMessageIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
  candidateAnswers: z.ZodDefault<z.ZodArray<FaqCandidateAnswerSchema>>;
}>;

export const faqFrontmatterSchema: FaqFrontmatterSchema = z.object({
  question: z.string(),
  status: faqStatusSchema,
  sourceConversationId: z.string(),
  sourceMessageId: z.string(),
  mergedMessageIds: z.array(z.string()).default([]),
  candidateAnswers: z.array(faqCandidateAnswerSchema).default([]),
});

export type FaqFrontmatter = z.output<typeof faqFrontmatterSchema>;
export type FaqFrontmatterInput = z.input<typeof faqFrontmatterSchema>;

type FaqMetadataSchema = z.ZodObject<{
  question: z.ZodString;
  status: typeof faqStatusSchema;
  asked: z.ZodNumber;
}>;

/** `asked` counts the source reply plus every merged reply. */
export const faqMetadataSchema: FaqMetadataSchema = z.object({
  question: z.string(),
  status: faqStatusSchema,
  asked: z.number().int(),
});

export type FaqMetadata = z.output<typeof faqMetadataSchema>;

export const faqSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"faq">;
    metadata: FaqMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("faq"),
  metadata: faqMetadataSchema,
});

export type FaqEntity = z.output<typeof faqSchema>;
