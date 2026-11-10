import {
  styleGuideFrontmatterSchema,
  type StyleGuideFrontmatter,
} from "@brains/contracts";
import { generateMarkdown } from "@brains/utils/markdown-frontmatter";

/** A style guide's markdown: its structured guidance as frontmatter. */
export function createStyleGuideContent(
  frontmatter: StyleGuideFrontmatter,
  guidance = "",
): string {
  const fields = Object.fromEntries(
    Object.entries(styleGuideFrontmatterSchema.parse(frontmatter)).filter(
      ([, value]) => value !== undefined,
    ),
  );
  return generateMarkdown(fields, guidance);
}
