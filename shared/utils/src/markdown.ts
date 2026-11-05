export {
  parseMarkdown,
  generateMarkdown,
  updateFrontmatterField,
} from "./markdown-frontmatter";
import { remark } from "remark";
import { toString } from "mdast-util-to-string";
const remarkProcessor = remark();

/**
 * Strip markdown formatting from text to get plain text
 */
export function stripMarkdown(text: string): string {
  const tree = remarkProcessor.parse(text);
  return toString(tree);
}

/**
 * First top-level Markdown heading as plain text, excluding code and HTML.
 * `depth` keeps only headings of that level, e.g. 1 for a `#` title.
 */
export function firstMarkdownHeading(
  markdown: string,
  options: { depth?: number } = {},
): string | undefined {
  const heading = remarkProcessor
    .parse(markdown)
    .children.find(
      (node) =>
        node.type === "heading" &&
        (options.depth === undefined || node.depth === options.depth),
    );
  const title = heading ? toString(heading).trim() : "";
  return title || undefined;
}
