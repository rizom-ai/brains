import { slugify } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";
import { z as z4 } from "@brains/utils/zod-v4";
import { computeContentHash } from "@brains/utils/hash";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Newsletter status enum
 */
export const newsletterStatusSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);
export type NewsletterStatus = z.output<typeof newsletterStatusSchema>;

const newsletterStatusParserSchema = z4.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);

/**
 * Newsletter frontmatter schema (stored in content as YAML frontmatter)
 * Contains all structured data — the body is the newsletter content
 */
export const newsletterFrontmatterSchema = z.object({
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
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
export const newsletterMetadataSchema = newsletterFrontmatterSchema
  .pick({
    subject: true,
    status: true,
    entityIds: true,
    scheduledFor: true,
    sentAt: true,
    buttondownId: true,
    sourceEntityType: true,
  })
  .extend({
    error: z.string().optional(),
  });

export type NewsletterMetadata = z.output<typeof newsletterMetadataSchema>;

const newsletterEntityMetadataParserSchema = z4.object({
  subject: z4.string(),
  status: newsletterStatusParserSchema,
  entityIds: z4.array(z4.string()).optional(),
  scheduledFor: z4.string().datetime().optional(),
  sentAt: z4.string().datetime().optional(),
  buttondownId: z4.string().optional(),
  sourceEntityType: z4.string().optional(),
  error: z4.string().optional(),
});

/**
 * Newsletter entity schema
 */
export const newsletterSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("newsletter"),
  metadata: newsletterEntityMetadataParserSchema,
});

export type Newsletter = z4.output<typeof newsletterSchema>;

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
      entityIds: input.entityIds,
      scheduledFor: input.scheduledFor,
    },
  });
}
