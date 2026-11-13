import { formFrontmatterSchema, parseFormMarkdown } from "@brains/forms";
import {
  defineEntity,
  defineEntityPackage,
  z,
  type EntityDefinition,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  withFrontmatterSchema,
  withPersistValidator,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";

type FormMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  target: z.ZodString;
  path: z.ZodString;
}>;
/** What forms are found by: the type their submissions become, and where. */
export const formMetadataSchema: FormMetadataSchema = z.object({
  title: z.string(),
  target: z.string(),
  path: z.string(),
});
export type FormMetadata = z.output<typeof formMetadataSchema>;

// A form reads as its stored document, metadata what it is found by. The
// class wrote its body from the line under its header; the codec stays the
// one storedDocumentCodec made, which is what reads as written.
const storedForm = storedDocumentCodec<
  typeof formFrontmatterSchema,
  typeof formMetadataSchema
>({
  header: formFrontmatterSchema,
  deriveMetadata: ({ title, target, path }) => ({
    title,
    target,
    path: path ?? "",
  }),
  readAsWritten: true,
});
const storedDecode = storedForm.decode;
Object.assign(storedForm, {
  decode: (document: Parameters<typeof storedDecode>[0]) =>
    storedDecode({
      ...document,
      content: document.content.replace(/^\n+/u, ""),
    }),
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
  writesInDocumentOrder(
    withFrontmatterSchema(
      withPersistValidator(
        defineEntity({
          type: "form",
          purpose:
            "A public form on the brain's site: its fields, copy and what its submissions become. Served by the package that stores them; never knowledge or model input.",
          metadata: formMetadataSchema,
          hasBody: true,
          markdown: storedForm,
          config: {
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
      ),
      formFrontmatterSchema,
    ),
  );

/** The form type, as one package. */
export const formPackage: EntityPackageDefinition<readonly [typeof form]> =
  defineEntityPackage({ id: "form", entities: [form] });

export default formPackage;
