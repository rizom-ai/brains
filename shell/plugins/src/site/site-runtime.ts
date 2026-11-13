import type { BusContract, BusResult } from "@brains/contracts";
import type { BaseDataSourceContext, DataSource } from "@brains/entity-service";
import { requestContract } from "@brains/messaging-service";
import { derivePreviewDomain } from "@brains/site-composition";
import type { z } from "@brains/utils/zod";
import type { IShell } from "../interfaces";
import { createDeclaredDataSource } from "../public/entity-data-source";
import type { SiteDataSourceRuntime } from "./site-data-source-runtime";
import { isSiteRuntimeMarker } from "./site-declaration";

export {
  withSiteRuntime,
  withSiteRuntimeDefaults,
  type SiteRuntimeDeclaration,
} from "./site-declaration";

export {
  attachSiteDataSourceRuntime,
  siteDataSourceRuntime,
  type SiteDataSourceRuntime,
} from "./site-data-source-runtime";

/**
 * Register what a first-party site carries: its templates under its id, and
 * its sources as `<id>:<local id>`, read by other packages as
 * `<site package>:<local id>`. A site that carries none registers nothing.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-site-runtime).
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
