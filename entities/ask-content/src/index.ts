import {
  askContentFrontmatterSchema,
  parseAskContent,
  type AskContent,
  type AskContentFrontmatter,
} from "@brains/contracts";
import {
  defineEntity,
  defineEntityPackage,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";

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

export { parseAskContent, type AskContent, type AskContentFrontmatter };
