import { z } from "@brains/utils/zod";

type FieldInfoSchema = z.ZodObject<{
  name: z.ZodString;
  type: z.ZodEnum<{
    string: "string";
    number: "number";
    boolean: "boolean";
    array: "array";
    enum: "enum";
    date: "date";
    unknown: "unknown";
  }>;
  required: z.ZodBoolean;
  defaultValue: z.ZodOptional<z.ZodUnknown>;
  enumValues: z.ZodOptional<z.ZodArray<z.ZodString>>;
}>;

/** One frontmatter field of a type, as the brain describes it. */
export const fieldInfoSchema: FieldInfoSchema = z.object({
  name: z.string(),
  type: z.enum([
    "string",
    "number",
    "boolean",
    "array",
    "enum",
    "date",
    "unknown",
  ]),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  enumValues: z.array(z.string()).optional(),
});

export type FieldInfo = z.output<FieldInfoSchema>;

type VaultShapeSchema = z.ZodObject<{
  entityType: z.ZodString;
  singleton: z.ZodBoolean;
  bodyTemplate: z.ZodString;
  fields: z.ZodArray<FieldInfoSchema>;
}>;

/** A type the vault writes a template, fileClass and base for. */
export const vaultShapeSchema: VaultShapeSchema = z.object({
  entityType: z.string().min(1),
  singleton: z.boolean(),
  bodyTemplate: z.string(),
  fields: z.array(fieldInfoSchema),
});

export type VaultShape = z.output<VaultShapeSchema>;

type VaultShapesSchema = z.ZodObject<{
  shapes: z.ZodArray<VaultShapeSchema>;
}>;

/** What the drive answers at `.brain/vault-shapes.json`. */
export const vaultShapesSchema: VaultShapesSchema = z.object({
  shapes: z.array(vaultShapeSchema),
});
