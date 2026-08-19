import type { Plugin, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { KnowledgeMapDataSource } from "./knowledge-map-datasource";
import { getKnowledgeMapTemplate } from "./knowledge-map-template";
import { registerKnowledgeMapDashboardWidget } from "./knowledge-map-widget";
import packageJson from "../package.json";

/**
 * The knowledge map: the whole corpus arranged in semantic space.
 *
 * Lived in `@brains/topics` until 2026-08-19, because topics is the package
 * that feels like it is about the shape of the knowledge base. It is not
 * about topics — `semantic.project({})` takes no type filter, so the map
 * spans every entity type in the brain. Topics contributes zones to it and
 * nothing more.
 *
 * Two consumers: the site section `sites/rizom-ai` puts on its home page,
 * and a dashboard widget.
 */
export class KnowledgeMapPlugin extends ServicePlugin<
  Record<string, never>,
  Record<string, never>
> {
  constructor() {
    super("knowledge-map", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    context.entities.registerDataSource(new KnowledgeMapDataSource());
    context.templates.register({ map: getKnowledgeMapTemplate() }, this.id);
    registerKnowledgeMapDashboardWidget({ context });
  }
}

export function createKnowledgeMapPlugin(): Plugin {
  return new KnowledgeMapPlugin();
}

export const knowledgeMapPlugin: typeof createKnowledgeMapPlugin =
  createKnowledgeMapPlugin;
