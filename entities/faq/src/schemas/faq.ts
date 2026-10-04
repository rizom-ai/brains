import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/sdk/entities";

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

type FaqAlternativeSchema = z.ZodObject<{ answer: z.ZodString }>;

/**
 * Another answer a repeated question received, kept in the body under
 * "Alternative answers" for the owner to choose from.
 */
export const faqAlternativeSchema: FaqAlternativeSchema = z.object({
  answer: z.string(),
});

export type FaqAlternative = z.output<typeof faqAlternativeSchema>;

/**
 * FAQ frontmatter: only what a reader needs. The body holds the answer and
 * any alternatives; which chat replies were counted is plugin state, not
 * part of the document.
 */
type FaqFrontmatterSchema = z.ZodObject<{
  question: z.ZodString;
  status: typeof faqStatusSchema;
  asked: z.ZodDefault<z.ZodNumber>;
  rank: z.ZodOptional<z.ZodNumber>;
}>;

export const faqFrontmatterSchema: FaqFrontmatterSchema = z.object({
  question: z.string(),
  status: faqStatusSchema,
  /** How many chat replies asked this question. */
  asked: z.number().int().min(1).default(1),
  /** The owner's place for it on a site, 1 first; unranked FAQs follow. */
  rank: z.number().int().min(1).optional(),
});

export type FaqFrontmatter = z.output<typeof faqFrontmatterSchema>;
export type FaqFrontmatterInput = z.input<typeof faqFrontmatterSchema>;

type FaqMetadataSchema = z.ZodObject<{
  question: z.ZodString;
  status: typeof faqStatusSchema;
  asked: z.ZodNumber;
  rank: z.ZodOptional<z.ZodNumber>;
}>;

export const faqMetadataSchema: FaqMetadataSchema = z.object({
  question: z.string(),
  status: faqStatusSchema,
  asked: z.number().int(),
  rank: z.number().int().optional(),
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
