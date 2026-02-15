import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Identity entity schema
 * Identity data (role, purpose, values) is stored in content field as structured markdown
 */
export const identitySchema = baseEntitySchema.extend({
  id: z.literal("identity"),
  entityType: z.literal("identity"),
});

/**
 * Identity entity type derived from schema
 */
export type IdentityEntity = z.infer<typeof identitySchema>;

/**
 * Identity body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const identityBodySchema = z.object({
  name: z.string().describe("The brain's friendly display name"),
  role: z.string().describe("The brain's primary role"),
  purpose: z.string().describe("The brain's purpose and goals"),
  values: z.array(z.string()).describe("Core values that guide behavior"),
});

/**
 * Identity body type
 */
export type IdentityBody = z.infer<typeof identityBodySchema>;

/**
 * Identity frontmatter schema for CMS editing
 * Same shape as body schema — all identity data is structured fields
 */
export const identityFrontmatterSchema = identityBodySchema;
