import type { RouteDefinition } from "@brains/site-composition";

export interface SiteRuntimeScript {
  src: string;
  defer?: boolean;
  module?: boolean;
}

export interface RouteScriptTemplate {
  runtimeScripts?: SiteRuntimeScript[];
}

export interface RouteScriptContext {
  getViewTemplate(name: string): RouteScriptTemplate | undefined;
}

/**
 * Walk a route's sections, look up each template, accumulate its
 * `runtimeScripts` declarations, dedupe by `src`, and render them as
 * ready-to-inject <script> tag strings.
 */
export function collectRouteScripts(
  route: RouteDefinition,
  context: RouteScriptContext,
): string[] {
  const seen = new Map<string, SiteRuntimeScript>();
  for (const section of route.sections) {
    const template = context.getViewTemplate(section.template);
    if (!template?.runtimeScripts) continue;
    for (const script of template.runtimeScripts) {
      if (!seen.has(script.src)) seen.set(script.src, script);
    }
  }
  return [...seen.values()].map((script) => {
    const attrs: string[] = [`src="${script.src}"`];
    if (script.defer) attrs.push("defer");
    if (script.module) attrs.push('type="module"');
    return `<script ${attrs.join(" ")}></script>`;
  });
}
