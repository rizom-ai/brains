import { z, computeContentHash, slugify } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Newsletter status enum
 */
export const newsletterStatusSchema = z.enum([
  "draft",
  "queued",
  "sent",
  "failed",
]);
export type NewsletterStatus = z.infer<typeof newsletterStatusSchema>;

/**
 * Newsletter metadata schema
 */
export const newsletterMetadataSchema = z.object({
  subject: z.string(),
  status: newsletterStatusSchema,
  entityIds: z.array(z.string()).optional(),
  scheduledFor: z.string().datetime().optional(),
  sentAt: z.string().datetime().optional(),
  buttondownId: z.string().optional(),
});

export type NewsletterMetadata = z.infer<typeof newsletterMetadataSchema>;

/**
 * Newsletter entity schema
 */
export const newsletterSchema = baseEntitySchema.extend({
  entityType: z.literal("newsletter"),
  metadata: newsletterMetadataSchema,
});

export type Newsletter = z.infer<typeof newsletterSchema>;

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
