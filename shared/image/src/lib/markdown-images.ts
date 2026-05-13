import { remark } from "remark";
import type { Image } from "mdast";
import { visit } from "unist-util-visit";

const remarkProcessor = remark();

export interface ExtractedImage {
  url: string;
  alt: string;
  title?: string | undefined;
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
    });
  });

  return images;
}
