import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";
import { sourceBrainSchema } from "@brains/contracts";

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

type FaqSourceSchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  url: z.ZodOptional<z.ZodString>;
  excerpt: z.ZodOptional<z.ZodString>;
  brain: z.ZodOptional<typeof sourceBrainSchema>;
}>;

/**
 * A source the answer drew on when it was first given: the piece, its
 * address, its opening words and, when it came from another brain, that
 * brain. An asked-before answer shows them again without a lookup.
 */
export const faqSourceSchema: FaqSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().optional(),
  excerpt: z.string().min(1).optional(),
  brain: sourceBrainSchema.optional(),
});

export type FaqSource = z.output<typeof faqSourceSchema>;

/**
 * FAQ frontmatter: only what a reader needs. The body holds the answer and
 * any alternatives; which chat replies were counted is plugin state, not
 * part of the document.
 */
type FaqFrontmatterSchema = z.ZodObject<{
  question: z.ZodString;
  status: typeof faqStatusSchema;
  asked: z.ZodDefault<z.ZodNumber>;
  sources: z.ZodOptional<z.ZodArray<FaqSourceSchema>>;
}>;

export const faqFrontmatterSchema: FaqFrontmatterSchema = z.object({
  question: z.string(),
  status: faqStatusSchema,
  /** How many chat replies asked this question. */
  asked: z.number().int().min(1).default(1),
  /** What the answer drew on, kept from the reply that first gave it. */
  sources: z.array(faqSourceSchema).optional(),
});

export type FaqFrontmatter = z.output<typeof faqFrontmatterSchema>;
export type FaqFrontmatterInput = z.input<typeof faqFrontmatterSchema>;

type FaqMetadataSchema = z.ZodObject<{
  question: z.ZodString;
  status: typeof faqStatusSchema;
  asked: z.ZodNumber;
}>;

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
