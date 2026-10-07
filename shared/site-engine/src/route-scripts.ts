import type { RouteDefinition } from "@brains/site-composition";
import { sha256Hex } from "@brains/utils/hash";

export interface SiteRuntimeScript {
  src: string;
  defer?: boolean;
  module?: boolean;
}

export interface RouteScriptTemplate {
  runtimeScripts?: SiteRuntimeScript[];
  /** Files behind runtimeScripts srcs, keyed by output-relative path. */
  staticAssets?: Record<string, string>;
}

export interface RouteScriptContext {
  getViewTemplate(name: string): RouteScriptTemplate | undefined;
}

/**
 * Walk a route's sections, look up each template, accumulate its
 * `runtimeScripts` declarations, dedupe by `src`, and render them as
 * ready-to-inject <script> tag strings. A src the build serves from
 * `assets` carries a fingerprint of that content, changing the requested URL
 * when those bytes change. Cache behavior still depends on the serving host.
 */
export function collectRouteScripts(
  route: RouteDefinition,
  context: RouteScriptContext,
  assets: Record<string, string>,
): string[] {
  const seen = new Map<string, { script: SiteRuntimeScript; src: string }>();
  for (const section of route.sections) {
    const template = context.getViewTemplate(section.template);
    if (!template?.runtimeScripts) continue;
    for (const script of template.runtimeScripts) {
      if (seen.has(script.src)) continue;
      const content = Object.hasOwn(assets, script.src)
        ? assets[script.src]
        : undefined;
      const src =
        content === undefined
          ? script.src
          : `${script.src}?v=${sha256Hex(content).slice(0, 12)}`;
      seen.set(script.src, { script, src });
    }
  }
  return [...seen.values()].map(({ script, src }) => {
    const attrs: string[] = [`src="${src}"`];
    if (script.defer) attrs.push("defer");
    if (script.module) attrs.push('type="module"');
    return `<script ${attrs.join(" ")}></script>`;
  });
}

/**
 * Gather the static assets declared by templates actually used on the given
 * routes — the files behind their `runtimeScripts` srcs. Deduped by output
 * path; the first declaration wins. Unused templates contribute nothing.
 */
export function collectRouteAssets(
  routes: RouteDefinition[],
  context: RouteScriptContext,
): Record<string, string> {
  const assets: Record<string, string> = {};
  for (const route of routes) {
    for (const section of route.sections) {
      const template = context.getViewTemplate(section.template);
      if (!template?.staticAssets) continue;
      for (const [path, content] of Object.entries(template.staticAssets)) {
        assets[path] ??= content;
      }
    }
  }
  return assets;
}
