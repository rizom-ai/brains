import { z } from "@brains/utils/zod";

/** Every form posts its token and a honeypot under these names. */
export const RESERVED_FIELD_IDS: ReadonlySet<string> = new Set([
  "token",
  "website",
]);

const slugSchema: z.ZodString = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const fieldIdSchema: z.ZodString = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,63}$/)
  .refine((id) => !RESERVED_FIELD_IDS.has(id), "This field id is reserved");
const labelSchema: z.ZodString = z.string().trim().min(1).max(200);
const copySchema: z.ZodString = z.string().trim().min(1).max(4000);
/** A path on the brain's own site: lowercase segments, no trailing slash. */
const pathSchema: z.ZodString = z
  .string()
  .regex(/^(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/);

type TextFieldSchema<K extends string> = z.ZodObject<
  {
    kind: z.ZodLiteral<K>;
    id: z.ZodString;
    label: z.ZodString;
    required: z.ZodDefault<z.ZodBoolean>;
    maxLength: z.ZodDefault<z.ZodNumber>;
    autocomplete: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
>;
/** A field answered in text, bounded by what one post may carry. */
function textField<K extends string>(
  kind: K,
  limit: number,
  fallback: number,
): TextFieldSchema<K> {
  return z.strictObject({
    kind: z.literal(kind),
    id: fieldIdSchema,
    label: labelSchema,
    required: z.boolean().default(false),
    maxLength: z.number().int().min(1).max(limit).default(fallback),
    /** The browser's autofill hint, such as `name`. */
    autocomplete: z
      .string()
      .regex(/^[a-z][a-z -]{0,39}$/)
      .optional(),
  });
}

type FormFieldSchema = z.ZodDiscriminatedUnion<
  [
    TextFieldSchema<"text">,
    TextFieldSchema<"email">,
    TextFieldSchema<"longText">,
  ]
>;
export const formFieldSchema: FormFieldSchema = z.discriminatedUnion("kind", [
  textField("text", 1000, 200),
  textField("email", 254, 254),
  textField("longText", 4000, 4000),
]);
export type FormField = z.output<typeof formFieldSchema>;

type FormStepSchema = z.ZodObject<
  {
    title: z.ZodOptional<z.ZodString>;
    fields: z.ZodArray<FormFieldSchema>;
  },
  z.core.$strict
>;
type FormObjectSchema = z.ZodObject<
  {
    id: z.ZodString;
    target: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    pageTitle: z.ZodOptional<z.ZodString>;
    intro: z.ZodOptional<z.ZodString>;
    submitLabel: z.ZodDefault<z.ZodString>;
    thanks: z.ZodDefault<
      z.ZodObject<
        { title: z.ZodString; body: z.ZodOptional<z.ZodString> },
        z.core.$strict
      >
    >;
    steps: z.ZodArray<FormStepSchema>;
    notify: z.ZodDefault<
      z.ZodObject<
        {
          enabled: z.ZodDefault<z.ZodBoolean>;
          title: z.ZodOptional<z.ZodString>;
        },
        z.core.$strict
      >
    >;
  },
  z.core.$strict
>;
/** A form as its content holds it: the entity id is its id, the body its intro. */
type FormFrontmatterSchema = z.ZodObject<
  Omit<FormObjectSchema["shape"], "id" | "intro">,
  z.core.$strict
>;

const stepSchema: FormStepSchema = z.strictObject({
  title: labelSchema.optional(),
  fields: z.array(formFieldSchema).min(1).max(50),
});
const formObjectSchema: FormObjectSchema = z.strictObject({
  id: slugSchema,
  /** The entity type its submissions become; its package stores them. */
  target: slugSchema,
  /** Where the site serves it; its thanks page is beneath it. */
  path: pathSchema.optional(),
  /** Visible copy may name the site's owner as `{owner}`. */
  title: labelSchema,
  /** The page's title in the browser and the site; the form's title by default. */
  pageTitle: labelSchema.optional(),
  intro: copySchema.optional(),
  submitLabel: labelSchema.default("Send"),
  thanks: z
    .strictObject({ title: labelSchema, body: copySchema.optional() })
    .default({ title: "Thank you" }),
  steps: z.array(stepSchema).min(1).max(20),
  notify: z
    .strictObject({
      /** Whether a submission emails the owner. */
      enabled: z.boolean().default(true),
      title: labelSchema.optional(),
    })
    .default({ enabled: true }),
});

export const formFrontmatterSchema: FormFrontmatterSchema =
  formObjectSchema.omit({ id: true, intro: true });
export type FormFrontmatter = z.output<FormFrontmatterSchema>;

export type FormDefinitionInput = z.input<FormObjectSchema>;
type ParsedForm = z.output<FormObjectSchema>;
export type FormDefinition = Omit<
  ParsedForm,
  "path" | "pageTitle" | "notify"
> & {
  path: string;
  pageTitle: string;
  notify: { enabled: boolean; title: string };
};

export const formDefinitionSchema: z.ZodType<
  FormDefinition,
  FormDefinitionInput
> = formObjectSchema
  .superRefine((form, context) => {
    const ids = form.steps.flatMap((step) => step.fields.map((f) => f.id));
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["steps"],
        message: "Each field needs its own id",
      });
  })
  .transform((form): FormDefinition => ({
    ...form,
    path: form.path ?? `/forms/${form.id}`,
    pageTitle: form.pageTitle ?? form.title,
    notify: {
      enabled: form.notify.enabled,
      title: form.notify.title ?? `New submission: ${form.title}`,
    },
  }));

/** Every field of a form, in the order its steps ask them. */
export function formFields(form: FormDefinition): FormField[] {
  return form.steps.flatMap((step) => step.fields);
}
