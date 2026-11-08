import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

/**
 * How another package asks profile (@brains/profile), the anchor profile's
 * steward, to fill it from an outside source such as LinkedIn: a preview of
 * what an import would fill and keep, and the import itself, confirmed against that
 * preview. What the owner wrote is kept; only empty fields and the
 * placeholders a starter profile holds are filled.
 */

/** The anchor profile's importable fields: story is its body, the rest frontmatter. */
export const profileImportFieldNames = [
  "name",
  "headline",
  "industry",
  "location",
  "website",
  "story",
] as const;

export const profileImportFieldNameSchema: z.ZodEnum<{
  name: "name";
  headline: "headline";
  industry: "industry";
  location: "location";
  website: "website";
  story: "story";
}> = z.enum(profileImportFieldNames);

export type ProfileImportFieldName = z.output<
  typeof profileImportFieldNameSchema
>;

type ProfileImportFieldsSchema = z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  headline: z.ZodOptional<z.ZodString>;
  industry: z.ZodOptional<z.ZodString>;
  location: z.ZodOptional<z.ZodString>;
  website: z.ZodOptional<z.ZodString>;
  story: z.ZodOptional<z.ZodString>;
}>;

/** Values read from an outside source, in the profile's own field names. */
export const profileImportFieldsSchema: ProfileImportFieldsSchema = z.object({
  name: z.string().optional(),
  headline: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  story: z.string().optional(),
});

export type ProfileImportFields = z.output<typeof profileImportFieldsSchema>;

export const profileImportOutcomeSchema: z.ZodEnum<{
  fill: "fill";
  preserve: "preserve";
  unchanged: "unchanged";
}> = z.enum(["fill", "preserve", "unchanged"]);

export type ProfileImportOutcome = z.output<typeof profileImportOutcomeSchema>;

type ProfileImportFieldSchema = z.ZodObject<{
  field: typeof profileImportFieldNameSchema;
  current: z.ZodNullable<z.ZodString>;
  imported: z.ZodString;
  outcome: typeof profileImportOutcomeSchema;
}>;

/** One field an import offers: what the profile holds, what came in, and the outcome. */
export const profileImportFieldSchema: ProfileImportFieldSchema = z.object({
  field: profileImportFieldNameSchema,
  current: z.string().nullable(),
  imported: z.string(),
  outcome: profileImportOutcomeSchema,
});

export type ProfileImportField = z.output<typeof profileImportFieldSchema>;

type PreviewRequestSchema = z.ZodObject<{
  fields: ProfileImportFieldsSchema;
}>;
type PreviewResponseSchema = z.ZodObject<{
  fields: z.ZodArray<ProfileImportFieldSchema>;
  changed: z.ZodBoolean;
  revision: z.ZodString;
}>;

/**
 * What an import would do to the anchor profile as it stands: each offered
 * field's outcome, whether anything would be filled, and the revision that
 * binds a confirmation to these values and this profile.
 */
export const profileImportPreviewContract: BusContract<
  PreviewRequestSchema,
  PreviewResponseSchema,
  "request"
> = defineBusContract({
  channel: "@brains/profile:import-preview",
  request: z.object({ fields: profileImportFieldsSchema }),
  response: z.object({
    fields: z.array(profileImportFieldSchema),
    changed: z.boolean(),
    revision: z.string(),
  }),
  delivery: "request",
});

type ApplyRequestSchema = z.ZodObject<{
  fields: ProfileImportFieldsSchema;
  revision: z.ZodString;
}>;
type ApplyResponseSchema = z.ZodObject<{
  filled: z.ZodArray<typeof profileImportFieldNameSchema>;
  kept: z.ZodArray<typeof profileImportFieldNameSchema>;
}>;

/**
 * Fill the anchor profile from an import the asker previewed: refused as a
 * conflict when the profile or the import changed since that preview, so
 * nothing is filled over what the owner wrote meanwhile.
 */
export const profileImportApplyContract: BusContract<
  ApplyRequestSchema,
  ApplyResponseSchema,
  "request"
> = defineBusContract({
  channel: "@brains/profile:import-apply",
  request: z.object({
    fields: profileImportFieldsSchema,
    revision: z.string(),
  }),
  response: z.object({
    filled: z.array(profileImportFieldNameSchema),
    kept: z.array(profileImportFieldNameSchema),
  }),
  delivery: "request",
});
