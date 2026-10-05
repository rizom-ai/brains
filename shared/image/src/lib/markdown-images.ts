import { remark } from "remark";
import type { Image, Definition } from "mdast";
import { visit } from "unist-util-visit";

const remarkProcessor = remark();

/** Rewrite image destinations structurally, never code, raw HTML or ordinary
 * links. Reference-style images become inline images so shared definitions
 * (which may also serve ordinary links) are not modified. */
export function mapMarkdownImageUrls(
  markdown: string,
  map: (url: string) => string,
): string {
  const tree = remarkProcessor.parse(markdown);
  const definitions = new Map<string, Definition>();
  visit(tree, "definition", (node: Definition) => {
    if (!definitions.has(node.identifier))
      definitions.set(node.identifier, node);
  });
  const changed = new Set<string>();
  visit(tree, (node, index, parent) => {
    if (node.type !== "image" && node.type !== "imageReference") return;
    const source =
      node.type === "image" ? node : definitions.get(node.identifier);
    if (!source) return;
    const url = map(source.url);
    if (url === source.url) return;
    changed.add(source.url);
    if (node.type === "image") node.url = url;
    else if (parent && index !== undefined) {
      parent.children[index] = {
        type: "image",
        url,
        alt: node.alt,
        title: source.title,
      };
    }
  });
  return changed.size > 0 ? remarkProcessor.stringify(tree) : markdown;
}

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
