import { withFrontmatterSchema } from "@brains/sdk/internal/entity-runtime";
import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import { docFromText } from "./lib/create-from-text";
import { getTemplates } from "./lib/register-templates";
import { docFrontmatterSchema, docMetadataSchema } from "./schemas/doc";

const DOC_INSTRUCTIONS = [
  'Docs (entityType "doc") are this brain\'s reference documentation.',
  "For a question about how something works, how to set it up or how to use it, run system_search before answering from general knowledge or asking the network, and answer from the docs it finds.",
  "When you answer from the docs, name each doc you answer from by its title, so the reply links to it.",
].join("\n");

/**
 * A doc: a page of the brain's reference documentation. Its frontmatter is
 * its metadata, with the slug resolved from the title when the file states
 * none; a stated slug is written back as stated. `sourcePath`, which the
 * docs sync once wrote and nothing reads, is retired.
 */
export const doc: EntityDefinition<"doc", typeof docMetadataSchema> =
  withFrontmatterSchema(
    defineEntity({
      type: "doc",
      purpose: "A structured documentation page.",
      metadata: docMetadataSchema,
      markdown: {
        decode: ({ content, frontmatter }) => {
          const parsed = docFrontmatterSchema.parse(frontmatter);
          return {
            content,
            metadata: {
              title: parsed.title,
              section: parsed.section,
              order: parsed.order,
              description: parsed.description,
              slug: parsed.slug ?? slugify(parsed.title),
              ...(parsed.slug !== null && { authoredSlug: true }),
            },
          };
        },
        encode: ({ content, metadata }) => ({
          content,
          frontmatter: {
            title: metadata.title,
            section: metadata.section,
            order: metadata.order,
            description: metadata.description,
            ...(metadata.authoredSlug === true && { slug: metadata.slug }),
          },
        }),
      },
      config: {
        projectionSourceRole: "primary",
        retiredFields: ["sourcePath"],
      },
      instructions: DOC_INSTRUCTIONS,
      templates: getTemplates(),
      // The route reads the type it is declared on, once it is defined.
      create: { fromContent: docFromText(() => doc) },
    }),
    docFrontmatterSchema,
  );
