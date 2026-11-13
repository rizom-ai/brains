import type { BusContract, BusResult } from "@brains/contracts";
import type { BaseDataSourceContext } from "@brains/entity-service";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import type { RegisteredWebRoute } from "../types/web-routes";

/**
 * Internal, first-party only: what a first-party site's data source reads
 * through `siteDataSourceRuntime(context)`, beside the public read context.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-site-runtime).
 */

/** What a first-party site's data source reads beyond public sources. */
export interface SiteDataSourceRuntime {
  /** The build's entity reads, at its scope, as the site's classes read. */
  readonly entityService: BaseDataSourceContext["entityService"];
  readonly siteUrl: string | undefined;
  readonly previewUrl: string | undefined;
  readonly localSiteUrl: string | undefined;
  readonly preferLocalUrls: boolean;
  /** The web routes the brain's packages serve. */
  webRoutes(): RegisteredWebRoute[];
  /** Asks a contract's owner as the site, under its id. */
  readonly messaging: {
    request<TRequest extends z.ZodType, TResponse extends z.ZodType>(
      contract: BusContract<TRequest, TResponse, "request">,
      payload: z.input<TRequest>,
    ): Promise<BusResult<z.output<TResponse>>>;
  };
  readonly logger: Logger;
}

/**
 * Where a read context carries its site's runtime: a key shared by every
 * copy of this module, since a published site bundles its own copy and reads
 * the context the brain's copy built.
 */
const siteDataSourceRuntimeKey = Symbol.for(
  "@brains/plugins:site-data-source-runtime",
);

/** Attach a site's runtime to a read context the runtime builds, before it is frozen. */
export function attachSiteDataSourceRuntime(
  target: object,
  runtime: SiteDataSourceRuntime,
): void {
  Object.defineProperty(target, siteDataSourceRuntimeKey, {
    value: runtime,
    enumerable: false,
  });
}

function isSiteDataSourceRuntime(
  value: unknown,
): value is SiteDataSourceRuntime {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "webRoutes") === "function" &&
    typeof Reflect.get(value, "messaging") === "object"
  );
}

/** The site runtime of a first-party site's data source read context. */
export function siteDataSourceRuntime(context: object): SiteDataSourceRuntime {
  const runtime: unknown = Reflect.get(context, siteDataSourceRuntimeKey);
  if (!isSiteDataSourceRuntime(runtime)) {
    throw new Error(
      "This context carries no site runtime: siteDataSourceRuntime() reaches internal capabilities of a first-party site's data source, which the brain's runtime binds",
    );
  }
  return runtime;
}
