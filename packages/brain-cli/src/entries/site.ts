/** Curated public site authoring surface for @rizom/brain/site. */

import type { ComponentType } from "preact";
import {
  personalSitePlugin as createPersonalSitePlugin,
  PersonalLayout as RuntimePersonalLayout,
  routes as runtimePersonalRoutes,
} from "@brains/site-personal";
import {
  professionalSitePlugin as createProfessionalSitePlugin,
  ProfessionalLayout as RuntimeProfessionalLayout,
  routes as runtimeProfessionalRoutes,
} from "@brains/site-professional";

/**
 * Opaque plugin marker. Consumers receive plugin instances via
 * `personalSitePlugin(config)` / `professionalSitePlugin(config)` and pass
 * them along to brain definitions; they do not introspect the shape.
 */
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly type: "core" | "entity" | "service" | "interface";
  readonly packageName: string;
}

/**
 * Opaque route definition. Consumers receive route exports from
 * `@rizom/brain/site` and place them on `SitePackage.routes` verbatim.
 */
export interface SectionDefinitionInput {
  readonly id: string;
  readonly template: string;
  readonly content?: unknown;
  readonly dataQuery?:
    | {
        readonly entityType?: string | undefined;
        readonly template?: string | undefined;
        readonly query?: Record<string, unknown> | undefined;
        readonly [key: string]: unknown;
      }
    | undefined;
  readonly order?: number | undefined;
}

export interface RouteDefinitionInput {
  readonly id: string;
  readonly path: string;
  readonly title?: string | undefined;
  readonly pageLabel?: string | undefined;
  readonly description?: string | undefined;
  readonly sections?: SectionDefinitionInput[] | undefined;
  readonly layout?: string | undefined;
  readonly fullscreen?: boolean | undefined;
  readonly pluginId?: string | undefined;
  readonly sourceEntityType?: string | undefined;
  readonly external?: boolean | undefined;
  readonly navigation?:
    | {
        readonly show?: boolean | undefined;
        readonly label?: string | undefined;
        readonly slot?: "primary" | "secondary" | undefined;
        readonly priority?: number | undefined;
      }
    | undefined;
}

/**
 * Per-entity-type display metadata used by generated list/detail routes.
 */
export interface EntityDisplayEntry {
  /** Human-readable singular label, e.g. "Post". */
  label: string;
  /** Plural name override; defaults to `${label}s`. */
  pluralName?: string;
  /** Layout name override; defaults to "default". */
  layout?: string;
  /** Enable pagination for list pages. */
  paginate?: boolean;
  /** Items per page; defaults to 10. */
  pageSize?: number;
  navigation?: {
    /** Whether to show this entity in navigation. */
    show?: boolean;
    /** Which navigation slot to render in. */
    slot?: "primary" | "secondary";
    /** Sort priority within the slot; lower comes first. */
    priority?: number;
  };
}

/**
 * A site package bundles layout components, hand-written routes, the site
 * plugin factory, and per-entity display metadata. Themes are resolved
 * separately by the framework.
 */
export interface SitePackage<TPluginConfig = Record<string, unknown>> {
  /** Layout components keyed by name — at minimum "default" is required. */
  layouts: Record<string, unknown>;
  /** Hand-written route definitions. */
  routes: RouteDefinitionInput[];
  /** Site plugin factory. */
  plugin: (config?: TPluginConfig) => Plugin;
  /** Per-entity display metadata. */
  entityDisplay: Record<string, EntityDisplayEntry>;
  /** Static assets to write to the output directory. */
  staticAssets?: Record<string, string>;
}

interface RuntimePluginShape {
  readonly id: string;
  readonly version: string;
  readonly type: Plugin["type"];
  readonly packageName: string;
}

function toPublicPlugin(plugin: RuntimePluginShape): Plugin {
  return {
    id: plugin.id,
    version: plugin.version,
    type: plugin.type,
    packageName: plugin.packageName,
  };
}

export const PersonalLayout: ComponentType<Record<string, unknown>> =
  RuntimePersonalLayout as unknown as ComponentType<Record<string, unknown>>;

export function personalSitePlugin(config?: Record<string, unknown>): Plugin {
  return toPublicPlugin(createPersonalSitePlugin(config));
}

export const routes: RouteDefinitionInput[] =
  runtimePersonalRoutes as RouteDefinitionInput[];

export const personalRoutes: RouteDefinitionInput[] = routes;

export const ProfessionalLayout: ComponentType<Record<string, unknown>> =
  RuntimeProfessionalLayout as unknown as ComponentType<
    Record<string, unknown>
  >;

export function professionalSitePlugin(
  config?: Record<string, unknown>,
): Plugin {
  return toPublicPlugin(createProfessionalSitePlugin(config));
}

export const professionalRoutes: RouteDefinitionInput[] =
  runtimeProfessionalRoutes as RouteDefinitionInput[];
