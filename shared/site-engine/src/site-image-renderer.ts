import type { ImageRenderer } from "@brains/ui-library";
import { escapeHtmlAttr } from "./image-utils";
import type { SiteImageMap } from "./site-image-contracts";

/** Create a markdown image renderer from a prepared, serializable image map. */
export function createSiteImageRenderer(imageMap: SiteImageMap): ImageRenderer {
  return (
    href: string,
    title: string | null,
    text: string,
  ): string | undefined => {
    const entityMatch = /^entity:\/\/image\/(.+)$/.exec(href);
    if (!entityMatch?.[1]) return undefined;

    const resolved = imageMap[entityMatch[1]];
    if (!resolved) return undefined;

    const attrs: string[] = [
      `src="${escapeHtmlAttr(resolved.src)}"`,
      `alt="${escapeHtmlAttr(text)}"`,
    ];
    if (resolved.srcset) {
      attrs.push(`srcset="${escapeHtmlAttr(resolved.srcset)}"`);
    }
    if (resolved.sizes) {
      attrs.push(`sizes="${escapeHtmlAttr(resolved.sizes)}"`);
    }
    if (resolved.width) attrs.push(`width="${resolved.width}"`);
    if (resolved.height) attrs.push(`height="${resolved.height}"`);
    if (title) attrs.push(`title="${escapeHtmlAttr(title)}"`);
    attrs.push('loading="lazy"');
    attrs.push('decoding="async"');

    return `<img ${attrs.join(" ")}>`;
  };
}
