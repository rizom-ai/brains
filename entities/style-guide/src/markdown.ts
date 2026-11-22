import {
  styleGuideFrontmatterSchema,
  type StyleGuideFrontmatter,
} from "@brains/contracts";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";
import { styleGuideBody } from "./stored-form";

/**
 * A style guide's markdown in its stored form (docs/plans/one-stored-form.md):
 * its name as frontmatter, its structured guidance as body sections above
 * the free-form guidance.
 */
export function createStyleGuideContent(
  frontmatter: StyleGuideFrontmatter,
  guidance = "",
): string {
  const fields = Object.fromEntries(
    Object.entries(styleGuideFrontmatterSchema.parse(frontmatter)).filter(
      ([, value]) => value !== undefined,
    ),
  );
  const written = styleGuideBody.write(fields, guidance);
  return generateMarkdown(written.header, written.body);
}
