import {
  generateMarkdownWithFrontmatter,
  parseTypedFrontmatter,
} from "@brains/sdk/internal/entity-runtime";
import { swotFrontmatterSchema, type SwotFrontmatter } from "../schemas/swot";

/*
 * A SWOT's markdown, written and read as the swot adapter wrote and read
 * it: the analysis is all header, with no body.
 */

/** A SWOT document: its quadrants and the time it was derived, as header. */
export function createSwotContent(input: SwotFrontmatter): string {
  return generateMarkdownWithFrontmatter("", input);
}

/** A SWOT's quadrants and the time it was derived, from its document. */
export function parseSwotContent(content: string): {
  frontmatter: SwotFrontmatter;
} {
  return {
    frontmatter: parseTypedFrontmatter("swot", content, swotFrontmatterSchema),
  };
}
