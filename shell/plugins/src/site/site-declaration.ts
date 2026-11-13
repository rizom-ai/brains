import { attachSiteRuntime, siteRuntimeOf } from "@brains/site-composition";
import type { Template } from "@brains/templates";
import { isRecord } from "@brains/utils/is-record";
import type { z } from "@brains/utils/zod";
import type { DataSourceDefinition } from "../entity/entity-definition-contract";

/**
 * Internal, first-party only: what a first-party site registers for the
 * brain beside its structural definition, in place of the runtime plugin a
 * site package embedded. Its templates and data sources read the site's
 * config: its `entityDisplay` and the brain's site settings, parsed by
 * `config`. Public sites declare `dataSources` on the site instead.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-site-runtime).
 */
export interface SiteRuntimeDeclaration<
  TConfigSchema extends z.ZodType<object, object>,
> {
  /** The namespace its templates are registered under, and its sources. */
  readonly id: string;
  readonly config: TConfigSchema;
  readonly templates:
    | Readonly<Record<string, Template>>
    | ((context: {
        readonly config: z.output<TConfigSchema>;
      }) => Readonly<Record<string, Template>>);
  readonly dataSources?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
      }) => readonly DataSourceDefinition[])
    | undefined;
}

/** A declaration resolved against the config the runtime hands the site. */
export interface ResolvedSiteRuntime {
  readonly id: string;
  readonly templates: Readonly<Record<string, Template>>;
  readonly dataSources: readonly DataSourceDefinition[];
}

interface SiteRuntimeMarker {
  readonly kind: "rizom-site-runtime";
  resolve(rawConfig: unknown): ResolvedSiteRuntime;
}

/** The site, carrying what the brain registers for it. */
export function withSiteRuntime<
  TSite extends object,
  TConfigSchema extends z.ZodType<object, object>,
>(site: TSite, declaration: SiteRuntimeDeclaration<TConfigSchema>): TSite {
  const marker: SiteRuntimeMarker = Object.freeze({
    kind: "rizom-site-runtime",
    resolve: (rawConfig: unknown): ResolvedSiteRuntime => {
      const config = declaration.config.parse(rawConfig);
      return {
        id: declaration.id,
        templates:
          typeof declaration.templates === "function"
            ? declaration.templates({ config })
            : declaration.templates,
        dataSources: declaration.dataSources?.({ config }) ?? [],
      };
    },
  });
  return attachSiteRuntime(site, marker);
}

/**
 * The site, its carried runtime configured with `defaults` under whatever
 * the brain's site settings name, as a conventional site's `pluginConfig`
 * configured the plugin it embedded. A site that carries none is unchanged.
 */
export function withSiteRuntimeDefaults<TSite extends object>(
  site: TSite,
  defaults: Readonly<Record<string, unknown>>,
): TSite {
  const carried = siteRuntimeOf(site);
  if (!isSiteRuntimeMarker(carried)) return site;
  const configured: SiteRuntimeMarker = Object.freeze({
    kind: "rizom-site-runtime",
    resolve: (rawConfig: unknown): ResolvedSiteRuntime =>
      carried.resolve({
        ...defaults,
        ...(isRecord(rawConfig) ? rawConfig : {}),
      }),
  });
  return attachSiteRuntime(site, configured);
}

export function isSiteRuntimeMarker(
  value: unknown,
): value is SiteRuntimeMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "kind") === "rizom-site-runtime"
  );
}
