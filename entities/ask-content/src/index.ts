import { bodyFields } from "@brains/content-formatters";
import {
  askContentFrontmatterSchema,
  askContentFromRecord,
  type AskContent,
  type AskContentFrontmatter,
} from "@brains/contracts";
import { bodyFieldsCodec } from "@brains/sdk/internal/entity-runtime";
import {
  defineEntity,
  defineEntityPackage,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";

/**
 * The copy the next stored form (docs/external-plugin-authoring.md, The stored format) states in
 * the body, under the introduction: the contact note and the refusal.
 */
const BODY_FIELDS = ["contactNote", "refusal"] as const;

const askContentBody = bodyFields(askContentFrontmatterSchema, BODY_FIELDS);

/**
 * The authored welcome and suggested topics public Ask surfaces share: one
 * record, its copy in frontmatter, read as metadata, and its introduction
 * as the body. Not model instructions or access policy, and kept out of
 * search embeddings.
 */
export const askContent: EntityDefinition<
  "ask-content",
  typeof askContentFrontmatterSchema
> = defineEntity({
  type: "ask-content",
  purpose:
    "Authored welcome and suggested topics shared by public Ask surfaces. Not model instructions or access policy.",
  metadata: askContentFrontmatterSchema,
  singleton: true,
  hasBody: true,
  markdown: bodyFieldsCodec({
    metadata: askContentFrontmatterSchema,
    bodyFields: BODY_FIELDS,
  }),
  config: { embeddable: false },
});

export type AskContentEntity = EntityOf<typeof askContent>;

export const askContentPackage: EntityPackageDefinition<
  readonly [typeof askContent],
  readonly []
> = defineEntityPackage({ id: "ask-content", entities: [askContent] });

export default askContentPackage;

/** An Ask copy's markdown: its copy as frontmatter, its introduction below. */
export function createAskContent(
  frontmatter: AskContentFrontmatter,
  introduction = "",
): string {
  const fields = Object.fromEntries(
    Object.entries(askContentFrontmatterSchema.parse(frontmatter)).filter(
      ([, value]) => value !== undefined,
    ),
  );
  return Object.keys(fields).length > 0
    ? generateMarkdown(fields, introduction)
    : introduction;
}

/**
 * Server-side authoring parser: the Ask presentation an ask-content
 * document holds, in either stored form.
 */
export function parseAskContent(markdown: string): AskContent {
  const { frontmatter, content } = parseMarkdown(markdown);
  const read = askContentBody.read(frontmatter, content);
  return askContentFromRecord({ content: read.lead, metadata: read.header });
}

export { type AskContent, type AskContentFrontmatter };
