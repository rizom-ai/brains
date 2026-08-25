import {
  frontmatterInContent,
  generateMarkdownWithFrontmatter,
} from "@brains/sdk/entities";
import type { SkillFrontmatter } from "../schemas/skill";

/**
 * Both directory types store their frontmatter inside `content` as well as in
 * metadata — an agent card is frontmatter plus a body a person can edit, and
 * a skill is frontmatter alone. The file is what gets synced.
 *
 * Preserved rather than corrected: this is the local record of who the brain
 * has met, already on disk, and moving where the bytes live would be a
 * migration disguised as a boundary refactor.
 */
export const directoryMarkdown: typeof frontmatterInContent =
  frontmatterInContent;

/** A skill's stored content: frontmatter and nothing else. */
export function createSkillContent(input: SkillFrontmatter): string {
  return generateMarkdownWithFrontmatter("", { ...input });
}
