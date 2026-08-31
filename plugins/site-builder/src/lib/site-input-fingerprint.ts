import type { LayoutComponent, PreparedSiteBuild } from "@brains/site-engine";
import { sha256Hex } from "@brains/utils/hash";
import type { SiteBuilderServices } from "./site-builder-services";
import type { SiteViewTemplate } from "./site-view-template";
import type { StaticSiteBuilderFactory } from "./static-site-builder";

export interface SiteInputFingerprintOptions {
  preparedBuild: PreparedSiteBuild;
  layouts: Record<string, LayoutComponent>;
  getViewTemplate(name: string): SiteViewTemplate | undefined;
  staticSiteBuilderFactory: StaticSiteBuilderFactory;
  sendMessage: SiteBuilderServices["sendMessage"];
}

/** Hash all serializable renderer inputs plus the selected renderer functions.
 *  Functions are hashed by source text (`String(fn)`), which cannot see
 *  closure-captured state — a renderer must derive its output from the
 *  prepared build and its own source, never from captured mutable data,
 *  or an unchanged fingerprint could skip a build whose output would differ. */
export function computeSiteInputFingerprint(
  options: SiteInputFingerprintOptions,
): string {
  const {
    buildId: _buildId,
    preparedAt: _preparedAt,
    ...preparedInput
  } = options.preparedBuild;
  const templateNames = Array.from(
    new Set(
      options.preparedBuild.routes.flatMap((route) =>
        route.sections.map((section) => section.template),
      ),
    ),
  ).sort();

  return sha256Hex(
    stableSerialize({
      version: 1,
      preparedInput,
      layouts: Object.fromEntries(
        Object.entries(options.layouts)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, layout]) => [name, String(layout)]),
      ),
      rendererRuntime: {
        staticSiteBuilderFactory: String(options.staticSiteBuilderFactory),
        stagingMessageSender: String(options.sendMessage),
      },
      templates: Object.fromEntries(
        templateNames.map((name) => {
          const template = options.getViewTemplate(name);
          return [
            name,
            template
              ? {
                  renderer: String(template.renderers.web),
                  renderVersion: template.renderVersion,
                  fullscreen: template.fullscreen ?? false,
                  runtimeScripts: template.runtimeScripts ?? [],
                  staticAssets: template.staticAssets ?? {},
                }
              : null,
          ];
        }),
      ),
    }),
  );
}

function stableSerialize(
  value: unknown,
  ancestors: Set<object> = new Set(),
): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Cannot fingerprint non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "function") return JSON.stringify(String(value));
  if (typeof value !== "object") {
    throw new Error(`Cannot fingerprint ${typeof value} value`);
  }
  if (ancestors.has(value)) {
    throw new Error("Cannot fingerprint circular site inputs");
  }

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item, nextAncestors)).join(",")}]`;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Cannot fingerprint non-plain site input objects");
  }

  return `{${Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, child]) =>
        `${JSON.stringify(key)}:${stableSerialize(child, nextAncestors)}`,
    )
    .join(",")}}`;
}
