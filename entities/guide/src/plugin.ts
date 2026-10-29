import type {
  DataSource,
  EntityTypeConfig,
  Plugin,
  Template,
} from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { guideSchema, type Guide } from "./schemas/guide";
import { guideAdapter, type GuideAdapter } from "./adapters/guide-adapter";
import { GuideDataSource } from "./datasources/guide-datasource";
import { getTemplates } from "./lib/register-templates";
import packageJson from "../package.json";

export class GuidesPlugin extends EntityPlugin<
  Guide,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType: typeof guideAdapter.entityType = guideAdapter.entityType;
  readonly schema: typeof guideSchema = guideSchema;
  readonly adapter: GuideAdapter = guideAdapter;

  constructor() {
    super("guides", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { projectionSourceRole: "primary" };
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [new GuideDataSource(this.logger.child("GuideDataSource"))];
  }
}

export function guidesPlugin(): Plugin {
  return new GuidesPlugin();
}
