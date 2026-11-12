import type { ServicePluginContext } from "@brains/plugins";
import type { SiteContentOperationsDeps } from "../src/lib/site-content-operations";

/**
 * What the package's runtime hands its operations, read through a test's
 * plugin context as the runtime reads the brain: the context's logger,
 * entity reads, bus and content generation, each reached when called so a
 * spy set on the context later is the one asked.
 */
export function siteContentDepsOf(
  context: ServicePluginContext,
): SiteContentOperationsDeps {
  return {
    logger: context.logger,
    entities: {
      getEntity: (request) => context.entityService.getEntity(request),
    },
    messaging: {
      request: (contract, payload) =>
        context.messaging.request(contract, payload),
    },
    generateContent: (request) => context.content.generate(request),
  };
}
