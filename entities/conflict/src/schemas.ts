import { conflictOriginSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";

type ConflictFieldsSchema = z.ZodObject<{
  targetType: z.ZodString;
  targetId: z.ZodString;
  origin: typeof conflictOriginSchema;
  actor: z.ZodOptional<z.ZodString>;
  base: z.ZodOptional<z.ZodString>;
  current: z.ZodString;
  edit: z.ZodString;
}>;

/**
 * What a conflict says about the edit it holds. The same fields are its
 * frontmatter and its metadata, and metadata is read back onto the entity:
 * none may share a name with an entity's own fields (`entityType`, `id`,
 * `created`), or the conflict would read back as another entity.
 */
export const conflictFieldsSchema: ConflictFieldsSchema = z.object({
  /** The entity the edit was for. */
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  /** The way in the edit came through. */
  origin: conflictOriginSchema,
  /** The user id of whoever made the edit, when the way in knew one. */
  actor: z.string().min(1).optional(),
  /** The content hash the edit started from, when the way in recorded one. */
  base: z.string().min(1).optional(),
  /** The content hash of the version the edit would have replaced. */
  current: z.string().min(1),
  /** The content hash of the losing text: what makes the same edit one conflict. */
  edit: z.string().min(1),
});

export type ConflictFields = z.output<typeof conflictFieldsSchema>;

type ConflictImageFieldsSchema = z.ZodObject<
  ConflictFieldsSchema["shape"] & {
    image: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  }
>;

/**
 * What an image conflict says: the same fields as a text conflict, and what
 * the losing image is (format, dimensions, size), as the way in read it.
 * `edit` is the digest of its bytes.
 */
export const conflictImageFieldsSchema: ConflictImageFieldsSchema =
  conflictFieldsSchema.extend({
    image: z.record(z.string(), z.unknown()),
  });

export type ConflictImageFields = z.output<typeof conflictImageFieldsSchema>;
