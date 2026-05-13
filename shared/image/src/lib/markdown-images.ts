import { parseMarkdown, updateFrontmatterField } from "@brains/utils";
import { remark } from "remark";
import type { Image } from "mdast";
import { visit } from "unist-util-visit";

const remarkProcessor = remark();

/**
 * Extracted image info from markdown content
 */
export interface ExtractedImage {
  /** The image URL */
  url: string;
  /** The alt text (empty string if not provided) */
  alt: string;
  /** Optional title attribute */
  title?: string | undefined;
  /** Start position in the original content */
  position?:
    | {
        start: { line: number; column: number; offset: number };
        end: { line: number; column: number; offset: number };
      }
    | undefined;
}

/**
 * Extract all images from markdown content using AST parsing.
 * Automatically excludes images inside code blocks.
 */
export function extractMarkdownImages(markdown: string): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const tree = remarkProcessor.parse(markdown);

  visit(tree, "image", (node: Image) => {
    images.push({
      url: node.url,
      alt: node.alt ?? "",
      title: node.title ?? undefined,
      position: node.position
        ? {
            start: {
              line: node.position.start.line,
              column: node.position.start.column,
              offset: node.position.start.offset ?? 0,
            },
            end: {
              line: node.position.end.line,
              column: node.position.end.column,
              offset: node.position.end.offset ?? 0,
            },
          }
        : undefined,
    });
  });

  return images;
}

/**
 * Get cover image ID from any entity that stores it in frontmatter.
 */
export function getCoverImageId(entity: { content: string }): string | null {
  const { frontmatter } = parseMarkdown(entity.content);
  const coverImageId = frontmatter["coverImageId"];
  return typeof coverImageId === "string" ? coverImageId : null;
}

/**
 * Set cover image ID on any entity, returns new entity with updated content.
 */
export function setCoverImageId<T extends { content: string }>(
  entity: T,
  imageId: string | null,
): T {
  const updatedContent = updateFrontmatterField(
    entity.content,
    "coverImageId",
    imageId,
  );
  return { ...entity, content: updatedContent };
}
