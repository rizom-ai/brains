import type {
  CreateCheckResult,
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
  EntityTextResult,
} from "@brains/plugins";
import {
  checkEntityText,
  continueWithEntityText,
  entityTextError,
  readEntityText,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { docFrontmatterSchema, docMetadataSchema } from "../schemas/doc";

/** Doc fields a writer can state for their own page, in frontmatter or as `fields`. */
const docTextFieldsSchema = z.object({
  section: z.string().trim().min(1).optional(),
  order: z.coerce.number().int().optional(),
  description: z.string().trim().min(1).optional(),
});

const placedDocSchema = z.object({
  metadata: docMetadataSchema.pick({ section: true, order: true }),
});

/** Where the existing docs sit: their sections and the last place taken. */
async function existingPlaces(
  context: Pick<EntityPluginContext, "entityService">,
): Promise<{ sections: string[]; lastOrder: number }> {
  const docs = await context.entityService.listEntities({
    entityType: "doc",
    options: { filter: { visibilityScope: "restricted" } },
  });
  const places = docs.flatMap((doc) => {
    const parsed = placedDocSchema.safeParse(doc);
    return parsed.success ? [parsed.data.metadata] : [];
  });
  return {
    sections: [...new Set(places.map((place) => place.section))],
    lastOrder: Math.max(0, ...places.map((place) => place.order)),
  };
}

type DocTextFields = z.output<typeof docTextFieldsSchema>;

/**
 * The writer's page with its section and place: the section they name, or
 * the docs' only one; with several sections or none yet, the user is asked.
 */
async function readDocText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "entityService">,
): Promise<
  EntityTextResult<DocTextFields & { section: string; order: number }>
> {
  const read = readEntityText(input, {
    noun: "doc",
    fieldsSchema: docTextFieldsSchema,
    isComplete: (frontmatter) =>
      docFrontmatterSchema.safeParse(frontmatter).success,
  });
  if (read.kind !== "text") return read;
  const { title, body, fields } = read.text;

  const { sections, lastOrder } = await existingPlaces(context);
  const section =
    fields.section ?? (sections.length === 1 ? sections[0] : undefined);
  if (!section) {
    return {
      kind: "question",
      asks: "fields",
      question:
        sections.length === 0
          ? "Which section should this page go in?"
          : `Which section should this page go in: ${sections.map((name) => `"${name}"`).join(", ")}, or a new one?`,
      answerWith: "Pass the answer as fields { section }.",
    };
  }
  return {
    kind: "text",
    text: {
      title,
      body,
      fields: { ...fields, section, order: fields.order ?? lastOrder + 1 },
    },
  };
}

/**
 * Before a doc from the writer's page is confirmed: ask which section when
 * the docs do not settle it, and fill in the title and section the
 * confirmation shows and the confirmed save receives.
 */
export async function checkDocText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "entityService">,
): Promise<CreateCheckResult> {
  return checkEntityText(
    await readDocText(input, context),
    ({ title, fields }) => ({ title, fields: { section: fields.section } }),
  );
}

/**
 * system_create for a doc from the writer's own page: the text stays as
 * written, titled from its first heading, and placed after the last page.
 */
export async function createDocFromText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "entityService">,
): Promise<CreateInterceptionResult> {
  const read = await readDocText(input, context);
  if (read.kind === "not-text") return { kind: "continue", input };
  if (read.kind !== "text") return entityTextError(read);
  const { title, body, fields } = read.text;

  return continueWithEntityText(input, {
    title,
    body,
    frontmatter: {
      title,
      section: fields.section,
      order: fields.order,
      description: fields.description,
    },
  });
}
