import type {
  CreateInput,
  CreateInterceptionResult,
  EntityPluginContext,
} from "@brains/plugins";
import {
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

/**
 * system_create for a doc from the writer's own page: the text stays as
 * written, titled from its first heading, and placed after the last page.
 * The section is the docs' only section, or the one the user names; with
 * several sections or none yet, the user is asked once.
 */
export async function createDocFromText(
  input: CreateInput,
  context: Pick<EntityPluginContext, "entityService">,
): Promise<CreateInterceptionResult> {
  const read = readEntityText(input, {
    noun: "doc",
    fieldsSchema: docTextFieldsSchema,
    isComplete: (frontmatter) =>
      docFrontmatterSchema.safeParse(frontmatter).success,
  });
  if (read.kind === "not-text") return { kind: "continue", input };
  if (read.kind === "error") {
    return entityTextError(read.error, read.question);
  }
  const { title, body, fields } = read.text;

  const { sections, lastOrder } = await existingPlaces(context);
  const section =
    fields.section ?? (sections.length === 1 ? sections[0] : undefined);
  if (!section) {
    return entityTextError(
      sections.length === 0
        ? "Which section does this page belong in? There are no docs yet to file it with; pass the answer as fields { section }."
        : `Which section does this page belong in: ${sections.map((name) => `"${name}"`).join(", ")}, or a new one? Pass the answer as fields { section }.`,
      "fields",
    );
  }

  return continueWithEntityText(input, {
    title,
    body,
    frontmatter: {
      title,
      section,
      order: fields.order ?? lastOrder + 1,
      description: fields.description,
    },
  });
}
