import type { ImageRenderer, RenderedImageRef } from "@brains/contracts";
import { escapeHtml } from "@brains/utils/string-utils";
import type { SiteImageMap } from "./site-image-contracts";

/** Create a markdown image renderer from a prepared, serializable image map. */
export function createSiteImageRenderer(imageMap: SiteImageMap): ImageRenderer {
  return ({ href, title, alt }: RenderedImageRef): string | undefined => {
    const entityMatch = /^entity:\/\/image\/(.+)$/.exec(href);
    if (!entityMatch?.[1]) return undefined;

    const resolved = imageMap[entityMatch[1]];
    if (!resolved) return undefined;

    const attrs: string[] = [
      `src="${escapeHtml(resolved.src)}"`,
      `alt="${escapeHtml(alt)}"`,
    ];
    if (resolved.srcset) {
      attrs.push(`srcset="${escapeHtml(resolved.srcset)}"`);
    }
    if (resolved.sizes) {
      attrs.push(`sizes="${escapeHtml(resolved.sizes)}"`);
    }
    if (resolved.width) attrs.push(`width="${resolved.width}"`);
    if (resolved.height) attrs.push(`height="${resolved.height}"`);
    if (title) attrs.push(`title="${escapeHtml(title)}"`);
    attrs.push('loading="lazy"');
    attrs.push('decoding="async"');

    return `<img ${attrs.join(" ")}>`;
  };
}
