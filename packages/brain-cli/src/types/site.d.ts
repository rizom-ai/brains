/**
 * ⚠️ TEMPORARY HAND-WRITTEN PUBLIC API SURFACE ⚠️
 *
 * This file is the **public API contract** for `@rizom/brain/site`.
 *
 * It is hand-maintained as a stopgap because both auto-bundlers we
 * tried (`dts-bundle-generator` and `rollup-plugin-dts`) choke on the
 * size and edge cases of the internal `@brains/*` workspace type
 * graph. See `docs/plans/library-exports.md` "Open questions" for
 * the longer story.
 *
 * **Sync rules:**
 * - When the runtime shape of `SitePackage`, `personalSitePlugin`,
 *   `PersonalLayout`, or `routes` changes, this file MUST be updated
 *   in the same commit.
 * - The opaque types (`Plugin`, `RouteDefinitionInput`,
 *   `EntityDisplayEntry`) are deliberately under-specified — they
 *   are pass-through values from the consumer's perspective. Do NOT
 *   expand them to mirror internal shapes; that's the design.
 * - The runtime side (`../entries/site.ts`) re-exports the real
 *   implementations from `@brains/*`. The .js bundle produced by
 *   `scripts/build.ts` is what consumers actually execute. This
 *   .d.ts file is what their tsc sees. They live in separate
 *   directories so TypeScript doesn't shadow one with the other.
 *
 * **Replacement plan:** when the type graph stabilizes (post-v0.1.0)
 * and a robust .d.ts bundling story exists (api-extractor with
 * curated entry points, or first-party tooling), this file is
 * deleted and the build script generates it from `site.ts` instead.
 *
 * Tracked in `docs/plans/library-exports.md` Tier 1.
 */

import type { ComponentType } from "preact";

/**
 * Opaque plugin marker. Consumers receive plugin instances via
 * `personalSitePlugin(config)` and pass them along to brain.yaml /
 * brain definitions; they do not introspect the shape themselves.
 */
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly type: "core" | "entity" | "service" | "interface";
  readonly packageName: string;
}

/**
 * Opaque route definition. Consumers receive `routes` from
 * `@rizom/brain/site` and place them on the `SitePackage.routes`
 * field verbatim — they do not construct or modify the shape.
 */
export interface RouteDefinitionInput {
  readonly path: string;
  readonly [key: string]: unknown;
}

/**
 * Per-entity-type display metadata. Used by the dynamic route
 * generator to produce auto-generated list/detail pages for
 * registered entity plugins.
 *
 * Field names mirror the canonical `EntityDisplayEntry` in
 * `@brains/plugins`; keep them in sync.
 */
export interface EntityDisplayEntry {
  /** Human-readable singular label, e.g. "Post" */
  label: string;
  /** Plural name override (defaults to `${label}s`) */
  pluralName?: string;
  /** Layout name override (defaults to "default") */
  layout?: string;
  /** Enable pagination for list pages */
  paginate?: boolean;
  /** Items per page (default: 10) */
  pageSize?: number;
  navigation?: {
    /** Whether to show this entity in navigation */
    show?: boolean;
    /** Which navigation slot to render in */
    slot?: "primary" | "secondary";
    /** Sort priority within the slot (lower comes first) */
    priority?: number;
  };
}

/**
 * A site package bundles everything the site-builder needs:
 * theme CSS, layout components, hand-written routes, the site
 * plugin factory, and per-entity display metadata.
 *
 * @example
 * ```ts
 * import {
 *   personalSitePlugin,
 *   PersonalLayout,
 *   routes,
 * } from "@rizom/brain/site";
 * import type { Plugin, SitePackage } from "@rizom/brain/site";
 * import themeCSS from "./theme.css" with { type: "text" };
 *
 * const site: SitePackage = {
 *   theme: themeCSS,
 *   layouts: { default: PersonalLayout },
 *   routes,
 *   plugin: (config) => personalSitePlugin(config ?? {}),
 *   entityDisplay: {
 *     post: { label: "Post" },
 *   },
 * };
 *
 * export default site;
 * ```
 */
export interface SitePackage {
  /** Composed theme CSS string */
  theme: string;
  /** Layout components keyed by name — at minimum "default" is required */
  layouts: Record<string, unknown>;
  /** Hand-written route definitions */
  routes: RouteDefinitionInput[];
  /** Site plugin factory */
  plugin: (config?: Record<string, unknown>) => Plugin;
  /** Per-entity display metadata */
  entityDisplay: Record<string, EntityDisplayEntry>;
  /** Static assets to write to the output directory */
  staticAssets?: Record<string, string>;
}

/**
 * Personal site layout — a Preact component used as the default
 * layout in a `SitePackage.layouts` map. Renders a clean
 * blog-focused page structure with header, content, and footer.
 */
export const PersonalLayout: ComponentType<Record<string, unknown>>;

/**
 * Personal site plugin factory. Registers templates, datasources,
 * and schema extensions needed by the personal layout. Pass the
 * returned plugin via `SitePackage.plugin`.
 */
export function personalSitePlugin(config?: Record<string, unknown>): Plugin;

/**
 * Hand-written route definitions for the personal layout
 * (homepage, about, etc.). Place verbatim on `SitePackage.routes`.
 */
export const routes: RouteDefinitionInput[];
