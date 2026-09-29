import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

/** Intake fields only. In particular, visibility and conversation locators are not input. */
export const contactSubmissionSchema: z.ZodObject<
  {
    name: z.ZodString;
    email: z.ZodString;
    message: z.ZodDefault<z.ZodString>;
    website: z.ZodDefault<z.ZodLiteral<"">>;
  },
  z.core.$strict
> = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().max(4000).default(""),
  website: z.literal("").default(""),
});
export type ContactSubmission = z.output<typeof contactSubmissionSchema>;

const statusSchema: z.ZodEnum<{ new: "new"; handled: "handled" }> = z.enum([
  "new",
  "handled",
]);
const notificationSchema: z.ZodEnum<{
  pending: "pending";
  sent: "sent";
  failed: "failed";
}> = z.enum(["pending", "sent", "failed"]);

type ContactFrontmatterSchema = z.ZodObject<
  {
    name: z.ZodString;
    email: z.ZodString;
    receivedAt: z.ZodISODateTime;
    expiresAt: z.ZodISODateTime;
    status: typeof statusSchema;
    notification: typeof notificationSchema;
  },
  z.core.$strict
>;

export const contactFrontmatterSchema: ContactFrontmatterSchema = z
  .strictObject({
    name: contactSubmissionSchema.shape.name,
    email: contactSubmissionSchema.shape.email,
    receivedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    status: statusSchema,
    notification: notificationSchema,
  })
  .refine((value) => {
    const lifetime = Date.parse(value.expiresAt) - Date.parse(value.receivedAt);
    // An upper bound, not a default or an approved deployment retention policy.
    return lifetime > 0 && lifetime <= 90 * 86400 * 1000;
  }, "Contact retention must be positive and at most 90 days");
export type ContactFrontmatter = z.output<typeof contactFrontmatterSchema>;

type ContactMetadataSchema = z.ZodObject<{
  title: z.ZodLiteral<"Contact request">;
  receivedAt: z.ZodISODateTime;
  expiresAt: z.ZodISODateTime;
  status: typeof statusSchema;
  notification: typeof notificationSchema;
}>;
export const contactMetadataSchema: ContactMetadataSchema = z.object({
  title: z.literal("Contact request"),
  receivedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  status: statusSchema,
  notification: notificationSchema,
});
export type ContactMetadata = z.output<typeof contactMetadataSchema>;

export const contactRequestSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"contact-request">;
    visibility: z.ZodLiteral<"restricted">;
    metadata: ContactMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("contact-request"),
  visibility: z.literal("restricted"),
  metadata: contactMetadataSchema,
});
export type ContactRequest = z.output<typeof contactRequestSchema>;
