import { askContentFrontmatterSchema } from "@brains/contracts";
import {
  defineEntity,
  defineEntityPackage,
  generateMarkdownWithFrontmatter,
  parseMarkdown,
  z,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";

const metadataSchema: z.ZodObject<Record<string, never>> = z.object({});

/** Authored presentation lives in the markdown, not searchable metadata. */
export const askContent: EntityDefinition<
  "ask-content",
  typeof metadataSchema
> = defineEntity({
  type: "ask-content",
  purpose:
    "Authored welcome and suggested topics shared by public Ask surfaces. Not model instructions or access policy.",
  metadata: metadataSchema,
  singleton: true,
  config: { embeddable: false },
  markdown: {
    frontmatter: askContentFrontmatterSchema,
    decode: ({ content, frontmatter }) => ({
      content: generateMarkdownWithFrontmatter(content, { ...frontmatter }),
      metadata: {},
    }),
    encode: ({ content }) => {
      const parsed = parseMarkdown(content);
      return { content: parsed.content, frontmatter: parsed.frontmatter };
    },
  },
});
export type AskContentEntity = EntityOf<typeof askContent>;

const askContentPackage: EntityPackageDefinition<
  readonly [typeof askContent],
  readonly []
> = defineEntityPackage({
  id: "ask-content",
  entities: [askContent],
});
export default askContentPackage;
