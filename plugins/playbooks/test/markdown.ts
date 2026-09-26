import { generateMarkdown, parseMarkdown } from "@brains/utils/markdown";
import {
  playbookBodyFormatter,
  playbookMetadataOf,
  type PlaybookBody,
  type PlaybookFrontmatter,
  type PlaybookMetadata,
} from "../src";

/**
 * A playbook file, as someone would author one.
 *
 * The package used to build this itself, because its adapter owned the
 * frontmatter. The runtime writes files now, so composing one is a thing
 * only a test needs.
 */
export function createPlaybookContent(
  frontmatter: PlaybookFrontmatter,
  body: PlaybookBody,
): string {
  return generateMarkdown(frontmatter, playbookBodyFormatter.format(body));
}

export function playbookMetadataFromMarkdown(
  markdown: string,
): PlaybookMetadata {
  return playbookMetadataOf(parseMarkdown(markdown).frontmatter);
}
