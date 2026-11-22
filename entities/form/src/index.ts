import {
  formFrontmatterSchema,
  parseFormMarkdown,
  withoutEmptyPath,
} from "@brains/forms";
import {
  defineEntity,
  defineEntityPackage,
  z,
  type EntityDefinition,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  storedFormCodec,
  bodyUnderHeader,
  withPersistValidator,
  type StoredDocument,
} from "@brains/sdk/internal/entity-runtime";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";

// Legacy: also reads the header form written before 0.2.0-alpha.760; removed with stored-form-old-headers (docs/legacy-code-inventory.json).

type FormMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  target: z.ZodString;
  path: z.ZodOptional<z.ZodString>;
}>;
/** What forms are found by: the type their submissions become, and where,
 * when the form names its path. A form that names none is served beneath
 * /forms; an empty path is none. */
export const formMetadataSchema: FormMetadataSchema = z.object({
  title: z.string(),
  target: z.string(),
  path: z.string().min(1).optional(),
});
export type FormMetadata = z.output<typeof formMetadataSchema>;

// A form reads as its stored document, metadata what it is found by. The
// class wrote its body from the line under its header. A form stored with
// an empty path reads as one without a path.
const storedForm = storedDocumentCodec<
  typeof formFrontmatterSchema,
  typeof formMetadataSchema
>({
  header: formFrontmatterSchema,
  deriveMetadata: ({ title, target, path }) => ({
    title,
    target,
    ...(path !== undefined && { path }),
  }),
  prepare: (document) =>
    inCurrentShape(
      bodyUnderHeader({
        ...document,
        frontmatter: withoutEmptyPath(document.frontmatter),
      }),
    ),
});

/**
 * A form in either stored form, its introduction as the body, as the
 * current form holds it: the next (docs/external-plugin-authoring.md, The stored format) is a
 * YAML file, its introduction the intro key.
 */
function inCurrentShape(document: StoredDocument): StoredDocument {
  const { intro, ...frontmatter } = document.frontmatter;
  return typeof intro === "string" ? { content: intro, frontmatter } : document;
}

/**
 * The header and introduction a write states: the document's whole header,
 * the fields its metadata names the record's. A body handed in without its
 * header (a field write) states those fields alone, and the serializer
 * keeps the rest of the stored header.
 */
function written(content: string, metadata: FormMetadata): StoredDocument {
  const stated = {
    title: metadata.title,
    target: metadata.target,
    ...(metadata.path !== undefined && { path: metadata.path }),
  };
  const parsed = parseMarkdown(content);
  // An empty path is none, as a read has it.
  const document = inCurrentShape({
    content: parsed.content,
    frontmatter: withoutEmptyPath(parsed.frontmatter),
  });
  return {
    content: document.content,
    frontmatter: { ...document.frontmatter, ...stated },
  };
}

/** The next form's header: the introduction beside the thanks text. */
function withIntro(document: StoredDocument): Record<string, unknown> {
  const intro = document.content.trim();
  if (intro === "") return document.frontmatter;
  const entries = Object.entries(document.frontmatter);
  const at = entries.findIndex(([key]) => key === "thanks");
  const placed: [string, unknown][] = [["intro", intro]];
  return Object.fromEntries(
    at < 0
      ? [...entries, ...placed]
      : [...entries.slice(0, at), ...placed, ...entries.slice(at)],
  );
}

/**
 * Read as its stored document in either form, a header and its
 * introduction as the body or a YAML file of the whole definition; the
 * YAML file is written.
 */
const formMarkdown = storedFormCodec<typeof formMetadataSchema>({
  decode: storedForm.decode,
  encode: ({ content, metadata }) => ({
    content: "",
    frontmatter: withIntro(written(content, metadata)),
  }),
  // Strict, as the old header is: an unknown key is refused.
  header: z.strictObject({
    ...formFrontmatterSchema.shape,
    intro: z.string().optional(),
  }),
  oldHeader: formFrontmatterSchema,
  // An introduction moved to the header sits beside the thanks text.
  places: [["intro", "thanks"]],
  readAsWritten: true,
});

/**
 * The `form` type. A form is served by the package its target belongs to;
 * installing this alone serves nothing. The forms engine parses a form's
 * whole document, its steps, copy and scoring, so a form reads as its
 * stored document, as the class read it, and metadata indexes only what it
 * is found by. A write keeps the header in the order of the file it
 * replaces. A form the engine would not run, or whose id is not a slug, is
 * refused before it is stored.
 */
export const form: EntityDefinition<"form", typeof formMetadataSchema> =
  withPersistValidator(
    defineEntity({
      type: "form",
      purpose:
        "A public form on the brain's site: its fields, copy and what its submissions become. Served by the package that stores them; never knowledge or model input.",
      metadata: formMetadataSchema,
      hasBody: true,
      markdown: formMarkdown,
      config: {
        // Its next form is a YAML file (docs/external-plugin-authoring.md, The stored format).
        storage: "yaml",
        embeddable: false,
        fullTextSearchable: false,
        projectionSource: false,
        projectionSourceRole: "excluded",
      },
    }),
    ({ id, content }) => {
      try {
        parseFormMarkdown(id, content);
      } catch {
        // The engine says why on import; never echo the definition here.
        throw new Error("Invalid form");
      }
    },
  );

/** The form type, as one package. */
export const formPackage: EntityPackageDefinition<readonly [typeof form]> =
  defineEntityPackage({ id: "form", entities: [form] });

export default formPackage;
