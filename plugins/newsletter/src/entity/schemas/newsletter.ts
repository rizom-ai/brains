import { baseEntityParserSchema } from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";

/**
 * Newsletter status enum
 */
export const newsletterStatusSchema: z.ZodEnum<{
  generating: "generating";
  draft: "draft";
  queued: "queued";
  published: "published";
  failed: "failed";
}> = z.enum(["generating", "draft", "queued", "published", "failed"]);

export type NewsletterStatus = z.output<typeof newsletterStatusSchema>;

/**
 * Newsletter frontmatter schema (stored in content as YAML frontmatter)
 * Contains all structured data — the body is the newsletter content
 */
export const newsletterFrontmatterSchema: z.ZodObject<{
  subject: z.ZodString;
  status: typeof newsletterStatusSchema;
  entityIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
  scheduledFor: z.ZodOptional<z.ZodString>;
  sentAt: z.ZodOptional<z.ZodString>;
  buttondownId: z.ZodOptional<z.ZodString>;
  sourceEntityType: z.ZodOptional<z.ZodString>;
}> = z.object({
  subject: z.string(),
  status: newsletterStatusSchema,
  entityIds: z.array(z.string()).optional(),
  scheduledFor: z.string().datetime().optional(),
  sentAt: z.string().datetime().optional(),
  buttondownId: z.string().optional(),
  sourceEntityType: z.string().optional(),
});

export type NewsletterFrontmatter = z.output<
  typeof newsletterFrontmatterSchema
>;

/**
 * Newsletter metadata schema - derived from frontmatter
 */
type NewsletterMetadataSchema = z.ZodObject<{
  subject: z.ZodString;
  status: typeof newsletterStatusSchema;
  entityIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
  scheduledFor: z.ZodOptional<z.ZodString>;
  sentAt: z.ZodOptional<z.ZodString>;
  buttondownId: z.ZodOptional<z.ZodString>;
  sourceEntityType: z.ZodOptional<z.ZodString>;
  error: z.ZodOptional<z.ZodString>;
}>;

export const newsletterMetadataSchema: NewsletterMetadataSchema = z.object({
  subject: z.string(),
  status: newsletterStatusSchema,
  entityIds: z.array(z.string()).optional(),
  scheduledFor: z.string().datetime().optional(),
  sentAt: z.string().datetime().optional(),
  buttondownId: z.string().optional(),
  sourceEntityType: z.string().optional(),
  error: z.string().optional(),
});

export type NewsletterMetadata = z.output<typeof newsletterMetadataSchema>;

/**
 * Newsletter entity schema
 */
export const newsletterSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"newsletter">;
    metadata: NewsletterMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("newsletter"),
  metadata: newsletterMetadataSchema,
});

export type Newsletter = z.output<typeof newsletterSchema>;

/**
 * Input for creating a newsletter
 */
export interface CreateNewsletterInput {
  subject: string;
  content: string;
  status?: NewsletterStatus;
  entityIds?: string[];
  scheduledFor?: string;
}

/**
 * Create a new newsletter entity with defaults
 */
export function createNewsletter(input: CreateNewsletterInput): Newsletter {
  const now = new Date().toISOString();
  const datePrefix = now.slice(0, 10); // YYYY-MM-DD
  const slug = slugify(input.subject);
  const id = `${slug}-${datePrefix}`;

  return newsletterSchema.parse({
    id,
    entityType: "newsletter",
    content: input.content,
    contentHash: computeContentHash(input.content),
    created: now,
    updated: now,
    metadata: {
      subject: input.subject,
      status: input.status ?? "draft",
      ...(input.entityIds !== undefined ? { entityIds: input.entityIds } : {}),
      ...(input.scheduledFor !== undefined
        ? { scheduledFor: input.scheduledFor }
        : {}),
    },
  });
}
