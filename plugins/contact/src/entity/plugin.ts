import {
  defineEntity,
  generateMarkdownWithFrontmatter,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { contactRequestAdapter } from "./adapter";
import { contactFrontmatterSchema, contactMetadataSchema } from "./schema";

/** Installing this declaration alone never exposes intake or public knowledge. */
export const contactRequest: EntityDefinition<
  "contact-request",
  typeof contactMetadataSchema
> = defineEntity({
  type: "contact-request",
  purpose:
    "A restricted contact request for the owner. Never public knowledge or model input.",
  metadata: contactMetadataSchema,
  config: {
    embeddable: false,
    fullTextSearchable: false,
    projectionSource: false,
    projectionSourceRole: "excluded",
  },
  validatePersist: (entity) => {
    if (entity.visibility !== "restricted") {
      throw new Error("Contact requests must have restricted visibility");
    }
    contactRequestAdapter.parseContent(entity.content);
  },
  markdown: {
    frontmatter: contactFrontmatterSchema,
    decode: ({ content, frontmatter }) => {
      const markdown = generateMarkdownWithFrontmatter(content, {
        ...frontmatter,
      });
      return {
        content: markdown,
        metadata: contactRequestAdapter.fromMarkdown(markdown).metadata ?? {},
      };
    },
    encode: ({ content }) => {
      const parsed = contactRequestAdapter.parseContent(content);
      return { content: parsed.message, frontmatter: parsed.frontmatter };
    },
  },
});
