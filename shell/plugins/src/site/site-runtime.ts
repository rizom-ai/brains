import type { BusContract, BusResult } from "@brains/contracts";
import type { BaseDataSourceContext, DataSource } from "@brains/entity-service";
import { requestContract } from "@brains/messaging-service";
import {
  attachSiteRuntime,
  derivePreviewDomain,
  siteRuntimeOf,
} from "@brains/site-composition";
import { isRecord } from "@brains/utils/is-record";
import type { Template } from "@brains/templates";
import type { z } from "@brains/utils/zod";
import type { DataSourceDefinition } from "../entity/entity-definition-contract";
import type { IShell } from "../interfaces";
import { createDeclaredDataSource } from "../public/entity-data-source";
import type { SiteDataSourceRuntime } from "./site-data-source-runtime";

export {
  attachSiteDataSourceRuntime,
  siteDataSourceRuntime,
  type SiteDataSourceRuntime,
} from "./site-data-source-runtime";

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
interface ResolvedSiteRuntime {
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

function isSiteRuntimeMarker(value: unknown): value is SiteRuntimeMarker {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "kind") === "rizom-site-runtime"
  );
}

/**
 * Register what a first-party site carries: its templates under its id, and
 * its sources as `<id>:<local id>`, read by other packages as
 * `<site package>:<local id>`. A site that carries none registers nothing.
 */
export function registerSiteRuntime(
  shell: IShell,
  packageName: string,
  carried: unknown,
  rawConfig: unknown,
): void {
  if (carried === undefined) return;
  if (!isSiteRuntimeMarker(carried)) {
    throw new Error(
      `Site package "${packageName}" carries a runtime that withSiteRuntime did not declare`,
    );
  }
  const declaration = carried.resolve(rawConfig);
  shell.registerTemplates({ ...declaration.templates }, declaration.id);

  const registry = shell.getDataSourceRegistry();
  const logger = shell.getLogger().child(declaration.id);
  const domain = shell.getDomain();
  const urls = {
    siteUrl: domain ? `https://${domain}` : undefined,
    previewUrl: domain ? `https://${derivePreviewDomain(domain)}` : undefined,
    localSiteUrl: shell.getLocalSiteUrl(),
    preferLocalUrls: shell.shouldPreferLocalUrls(),
  };
  const messageBus = shell.getMessageBus();
  const siteRuntime = (context: BaseDataSourceContext): SiteDataSourceRuntime =>
    Object.freeze({
      entityService: context.entityService,
      ...urls,
      webRoutes: () => shell.getPluginWebRoutes(),
      messaging: Object.freeze({
        request: <TRequest extends z.ZodType, TResponse extends z.ZodType>(
          contract: BusContract<TRequest, TResponse, "request">,
          payload: z.input<TRequest>,
        ): Promise<BusResult<z.output<TResponse>>> =>
          requestContract(messageBus, contract, payload, declaration.id),
      }),
      logger,
    });
  for (const source of declaration.dataSources) {
    const dataSource: DataSource = createDeclaredDataSource(
      source,
      `${declaration.id}:${source.id}`,
      logger,
      {
        publicId: `${packageName}:${source.id}`,
        runtimeState: shell.getRuntimeState(),
        dataSources: registry,
        siteRuntime,
      },
    );
    registry.register(dataSource);
  }
}
