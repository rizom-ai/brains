import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  serviceRuntime,
  withTools,
} from "@brains/sdk/internal/service-runtime";
import { ensureArray } from "@brains/utils/array";
import { siteContentEntity } from "./schemas/site-content";
import { SiteContentService } from "./lib/site-content-service";
import { createSiteContentTemplates } from "./lib/site-content-definitions";
import { siteContentPluginConfigSchema } from "./schemas/config";
import { createSiteContentTools } from "./tools";

/** What the package holds once set up: the service its tool generates through. */
interface SiteContentState {
  readonly service: SiteContentService;
}

/**
 * The site's content sections: the site-content type, the section
 * templates each of the config's definitions declares under its
 * namespace, and the tool that generates a section for each route the site
 * builder serves.
 */
export function createSiteContentPackage(): ServicePackageDefinition<
  typeof siteContentPluginConfigSchema
> {
  const service = defineServicePlugin({
    // A service and the type it owns cannot share an id; a brain installs
    // it under site-content, the id its class had, and its type apart.
    id: "site-content-generation",
    config: siteContentPluginConfigSchema,
    entities: [siteContentEntity],
    setup: (context): SiteContentState => {
      const runtime = serviceRuntime(context);
      for (const definition of ensureArray(context.config.definitions)) {
        const templates = createSiteContentTemplates(definition);
        for (const [name, template] of Object.entries(templates)) {
          runtime.template(name, template, {
            namespace: definition.namespace,
          });
        }
      }
      return {
        service: new SiteContentService({
          logger: runtime.logger,
          entities: runtime.entityReads,
          messaging: runtime.messaging,
          generateContent: runtime.generateContent,
        }),
      };
    },
  });
  return withTools<typeof siteContentPluginConfigSchema, SiteContentState>(
    service,
    (context) =>
      createSiteContentTools(() => context.state.service, "site-content"),
  );
}
