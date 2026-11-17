import {
  checkEntityText,
  entityRuntime,
  entityTextRefusal,
  readEntityText,
  type EntityTextResult,
} from "@brains/sdk/internal/entity-runtime";
import type {
  EntityCreateContext,
  EntityCreateResolution,
  EntityCreateRoute,
  EntityDefinition,
} from "@brains/sdk/entities";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/sdk/entities";
import { docFrontmatterSchema, type docMetadataSchema } from "../schemas/doc";
import { definedFields } from "@brains/utils/strip-undefined";

type DocDefinition = EntityDefinition<"doc", typeof docMetadataSchema>;

/** Doc fields a writer can state for their own page, in frontmatter or as `fields`. */
const docTextFieldsSchema = z.object({
  section: z.string().trim().min(1).optional(),
  order: z.coerce.number().int().optional(),
  description: z.string().trim().min(1).optional(),
});

type DocTextFields = z.output<typeof docTextFieldsSchema>;

/**
 * Where the existing docs sit: the sections the writer can see, and the last
 * place taken by any doc, restricted ones too, so a new page never collides
 * with a hidden one.
 */
async function existingPlaces(
  doc: DocDefinition,
  context: EntityCreateContext,
): Promise<{ sections: string[]; lastOrder: number }> {
  const [visible, every] = await Promise.all([
    context.entities.list(doc),
    entityRuntime(context).packageEntities.list(doc),
  ]);
  return {
    sections: [...new Set(visible.map(({ metadata }) => metadata.section))],
    lastOrder: Math.max(0, ...every.map(({ metadata }) => metadata.order)),
  };
}

/**
 * The writer's page with its section and place: the section they name, or
 * the docs' only one; with several sections or none yet, the user is asked.
 */
async function readDocText(
  doc: DocDefinition,
  context: EntityCreateContext,
): Promise<
  EntityTextResult<DocTextFields & { section: string; order: number }>
> {
  const read = readEntityText(context.input, {
    noun: "doc",
    fieldsSchema: docTextFieldsSchema,
    isComplete: (frontmatter) =>
      docFrontmatterSchema.safeParse(frontmatter).success,
  });
  if (read.kind !== "text") return read;
  const { title, body, fields } = read.text;

  const { sections, lastOrder } = await existingPlaces(doc, context);
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
 * system_create for a doc from the writer's own page: the text stays as
 * written, titled from its first heading, and placed after the last page;
 * before the save is confirmed, it asks which section when the docs do not
 * settle it. A complete doc, or anything that is not the writer's text,
 * goes on to the ordinary create.
 */
export function docFromText(
  docType: () => DocDefinition,
): EntityCreateRoute<typeof docMetadataSchema> {
  return {
    check: async (context) =>
      checkEntityText(
        await readDocText(docType(), context),
        ({ title, fields }) => ({ title, fields: { section: fields.section } }),
      ),
    resolve: async (
      context,
    ): Promise<EntityCreateResolution<typeof docMetadataSchema>> => {
      const read = await readDocText(docType(), context);
      const runtime = entityRuntime(context);
      if (read.kind === "not-text") return runtime.ordinaryCreate();
      if (read.kind !== "text") {
        return { refuse: entityTextRefusal(read) };
      }
      const { title, body, fields } = read.text;
      const frontmatter = definedFields({
        title,
        section: fields.section,
        order: fields.order,
        description: fields.description,
      });
      return runtime.ordinaryCreate({
        title,
        content: generateMarkdown(frontmatter, body),
      });
    },
  };
}
