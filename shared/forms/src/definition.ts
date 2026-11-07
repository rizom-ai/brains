import { z } from "@brains/utils/zod";
import { languageTagSchema } from "@brains/site-composition";
import { formAdmissionPolicyShape } from "./admission-state";

type AdmissionShape = (typeof formAdmissionPolicyShape)["shape"];

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

type FormScoreSchema = z.ZodObject<
  {
    dimension: z.ZodString;
    outcome: z.ZodString;
    weight: z.ZodDefault<z.ZodNumber>;
  },
  z.core.$strict
>;
/** What choosing an option counts towards: an outcome in one dimension. */
const scoreSchema: FormScoreSchema = z.strictObject({
  dimension: slugSchema,
  outcome: slugSchema,
  weight: z.number().int().min(1).max(100).default(1),
});
type FormOptionSchema = z.ZodObject<
  {
    value: z.ZodString;
    label: z.ZodString;
    scores: z.ZodOptional<z.ZodArray<FormScoreSchema>>;
  },
  z.core.$strict
>;
/** One answer a choice offers: what it posts, what the visitor reads, and,
 * in a scored form, what choosing it counts towards. */
const optionSchema: FormOptionSchema = z.strictObject({
  value: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  label: labelSchema,
  scores: z.array(scoreSchema).min(1).max(20).optional(),
});
type ChoiceFieldSchema = z.ZodObject<
  {
    kind: z.ZodLiteral<"choice">;
    id: z.ZodString;
    label: z.ZodString;
    required: z.ZodDefault<z.ZodBoolean>;
    options: z.ZodArray<FormOptionSchema>;
  },
  z.core.$strict
>;
type ChoicesFieldSchema = z.ZodObject<
  {
    kind: z.ZodLiteral<"choices">;
    id: z.ZodString;
    label: z.ZodString;
    required: z.ZodDefault<z.ZodBoolean>;
    options: z.ZodArray<FormOptionSchema>;
    max: z.ZodOptional<z.ZodNumber>;
  },
  z.core.$strict
>;
const optionsSchema = z.array(optionSchema).min(1).max(50);
/** One of a list, asked as radio buttons. */
const choiceFieldSchema: ChoiceFieldSchema = z.strictObject({
  kind: z.literal("choice"),
  id: fieldIdSchema,
  label: labelSchema,
  required: z.boolean().default(false),
  options: optionsSchema,
});
/** Any of a list, asked as checkboxes; at most `max` of them. */
const choicesFieldSchema: ChoicesFieldSchema = z.strictObject({
  kind: z.literal("choices"),
  id: fieldIdSchema,
  label: labelSchema,
  required: z.boolean().default(false),
  options: optionsSchema,
  max: z.number().int().min(1).max(50).optional(),
});

type FormFieldSchema = z.ZodDiscriminatedUnion<
  [
    TextFieldSchema<"text">,
    TextFieldSchema<"email">,
    TextFieldSchema<"longText">,
    ChoiceFieldSchema,
    ChoicesFieldSchema,
  ]
>;
export const formFieldSchema: FormFieldSchema = z.discriminatedUnion("kind", [
  textField("text", 1000, 200),
  textField("email", 254, 254),
  textField("longText", 4000, 4000),
  choiceFieldSchema,
  choicesFieldSchema,
]);
export type FormField = z.output<typeof formFieldSchema>;
/** A field answered in text: its answer is one string of bounded length. */
export type FormTextField = Extract<FormField, { maxLength: number }>;
/** A field answered from a list of options. */
export type FormChoiceField = Extract<FormField, { options: unknown }>;

type FormOutcomeSchema = z.ZodObject<
  { id: z.ZodString; title: z.ZodString; body: z.ZodOptional<z.ZodString> },
  z.core.$strict
>;
type FormDimensionSchema = z.ZodObject<
  {
    id: z.ZodString;
    title: z.ZodString;
    outcomes: z.ZodArray<FormOutcomeSchema>;
  },
  z.core.$strict
>;
type FormScoringSchema = z.ZodObject<
  { dimensions: z.ZodArray<FormDimensionSchema> },
  z.core.$strict
>;
const outcomeSchema: FormOutcomeSchema = z.strictObject({
  id: slugSchema,
  title: labelSchema,
  body: copySchema.optional(),
});
const dimensionSchema: FormDimensionSchema = z.strictObject({
  id: slugSchema,
  title: labelSchema,
  outcomes: z.array(outcomeSchema).min(1).max(50),
});
/** What a scored form measures: dimensions, each with the outcomes its
 * options count towards. Each dimension's highest-scoring outcome is its
 * result, so one submission can have several. */
const scoringSchema: FormScoringSchema = z.strictObject({
  dimensions: z.array(dimensionSchema).min(1).max(20),
});

type Optional = z.ZodOptional<z.ZodString>;
type FormTranslationSchema = z.ZodObject<
  {
    title: Optional;
    pageTitle: Optional;
    intro: Optional;
    submitLabel: Optional;
    thanks: z.ZodOptional<
      z.ZodObject<{ title: Optional; body: Optional }, z.core.$strict>
    >;
    steps: z.ZodOptional<
      z.ZodArray<z.ZodObject<{ title: Optional }, z.core.$strict>>
    >;
    fields: z.ZodOptional<
      z.ZodRecord<
        z.ZodString,
        z.ZodObject<
          {
            label: Optional;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
          },
          z.core.$strict
        >
      >
    >;
    dimensions: z.ZodOptional<
      z.ZodRecord<
        z.ZodString,
        z.ZodObject<
          {
            title: Optional;
            outcomes: z.ZodOptional<
              z.ZodRecord<
                z.ZodString,
                z.ZodObject<{ title: Optional; body: Optional }, z.core.$strict>
              >
            >;
          },
          z.core.$strict
        >
      >
    >;
  },
  z.core.$strict
>;
/** A form's words in another language, by the ids of what they translate;
 * whatever it leaves out stays as written. */
const translationSchema: FormTranslationSchema = z.strictObject({
  title: labelSchema.optional(),
  pageTitle: labelSchema.optional(),
  intro: copySchema.optional(),
  submitLabel: labelSchema.optional(),
  thanks: z
    .strictObject({
      title: labelSchema.optional(),
      body: copySchema.optional(),
    })
    .optional(),
  /** By position, one for each step translated. */
  steps: z
    .array(z.strictObject({ title: labelSchema.optional() }))
    .max(20)
    .optional(),
  fields: z
    .record(
      z.string(),
      z.strictObject({
        label: labelSchema.optional(),
        options: z.record(z.string(), labelSchema).optional(),
      }),
    )
    .optional(),
  dimensions: z
    .record(
      z.string(),
      z.strictObject({
        title: labelSchema.optional(),
        outcomes: z
          .record(
            z.string(),
            z.strictObject({
              title: labelSchema.optional(),
              body: copySchema.optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});
export type FormTranslation = z.output<FormTranslationSchema>;

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
    limits: z.ZodOptional<
      z.ZodObject<
        { [K in keyof AdmissionShape]: z.ZodOptional<AdmissionShape[K]> },
        z.core.$strict
      >
    >;
    scoring: z.ZodOptional<FormScoringSchema>;
    translations: z.ZodOptional<
      z.ZodRecord<typeof languageTagSchema, FormTranslationSchema>
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
  /** Its own admission limits, over the plugin's. */
  limits: formAdmissionPolicyShape.partial().optional(),
  scoring: scoringSchema.optional(),
  /** Its words in each other language it is served in, at `/<lang>/<path>`. */
  translations: z.record(languageTagSchema, translationSchema).optional(),
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
    const dimensions = new Map(
      (form.scoring?.dimensions ?? []).map((dimension) => [
        dimension.id,
        new Set(dimension.outcomes.map((outcome) => outcome.id)),
      ]),
    );
    if (dimensions.size !== (form.scoring?.dimensions.length ?? 0))
      context.addIssue({
        code: "custom",
        path: ["scoring"],
        message: "Each dimension needs its own id",
      });
    for (const dimension of form.scoring?.dimensions ?? [])
      if (dimensions.get(dimension.id)?.size !== dimension.outcomes.length)
        context.addIssue({
          code: "custom",
          path: ["scoring"],
          message: `Each outcome of "${dimension.id}" needs its own id`,
        });
    const fieldsById = new Map(
      form.steps
        .flatMap((step) => step.fields)
        .map((field) => [field.id, field]),
    );
    for (const [language, translation] of Object.entries(
      form.translations ?? {},
    )) {
      const issue = (message: string): void =>
        context.addIssue({
          code: "custom",
          path: ["translations", language],
          message,
        });
      if ((translation.steps?.length ?? 0) > form.steps.length)
        issue("It translates more steps than the form has");
      for (const [id, field] of Object.entries(translation.fields ?? {})) {
        const asked = fieldsById.get(id);
        if (!asked)
          issue(`It translates a field "${id}" the form does not have`);
        for (const value of Object.keys(field.options ?? {}))
          if (
            !asked ||
            !("options" in asked) ||
            !asked.options.some((option) => option.value === value)
          )
            issue(
              `It translates an option "${id}/${value}" the form does not have`,
            );
      }
      for (const [id, dimension] of Object.entries(
        translation.dimensions ?? {},
      )) {
        const outcomes = dimensions.get(id);
        if (!outcomes)
          issue(`It translates a dimension "${id}" the form does not score`);
        for (const outcome of Object.keys(dimension.outcomes ?? {}))
          if (!outcomes?.has(outcome))
            issue(
              `It translates an outcome "${id}/${outcome}" the form does not have`,
            );
      }
    }
    for (const field of form.steps.flatMap((step) => step.fields)) {
      if (!("options" in field)) continue;
      for (const score of field.options.flatMap(
        (option) => option.scores ?? [],
      ))
        if (!dimensions.get(score.dimension)?.has(score.outcome))
          context.addIssue({
            code: "custom",
            path: ["steps"],
            message: `"${field.id}" counts towards "${score.dimension}/${score.outcome}", which the form does not score`,
          });
      const values = field.options.map((option) => option.value);
      if (new Set(values).size !== values.length)
        context.addIssue({
          code: "custom",
          path: ["steps"],
          message: `Each option of "${field.id}" needs its own value`,
        });
      if (
        "max" in field &&
        field.max !== undefined &&
        field.max > values.length
      )
        context.addIssue({
          code: "custom",
          path: ["steps"],
          message: `"${field.id}" allows more choices than it offers`,
        });
    }
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

export type FormDimension = z.output<FormDimensionSchema>;
export type FormOutcome = z.output<FormOutcomeSchema>;

/** Every field of a form, in the order its steps ask them. */
export function formFields(form: FormDefinition): FormField[] {
  return form.steps.flatMap((step) => step.fields);
}
