import {
  generateMarkdownWithFrontmatter,
  parseMarkdown,
} from "@brains/sdk/entities";
import { swotFrontmatterSchema, type SwotFrontmatter } from "../schemas/swot";

/**
 * Reads and writes the markdown a SWOT is stored as.
 *
 * This used to be a full `BaseEntityAdapter`. The declarative entity builds
 * its adapter from the `markdown` codec on `swot`, so the class's
 * `toMarkdown`/`fromMarkdown` stopped running once the package converted.
 * The analysis lives entirely in frontmatter, so both directions are one
 * call.
 */
export class SwotAdapter {
  public createSwotContent(input: SwotFrontmatter): string {
    return generateMarkdownWithFrontmatter("", input);
  }

  public parseSwotContent(content: string): { frontmatter: SwotFrontmatter } {
    return {
      frontmatter: swotFrontmatterSchema.parse(
        parseMarkdown(content).frontmatter,
      ),
    };
  }
}

export const swotAdapter: SwotAdapter = new SwotAdapter();
