import type { DataSource, Plugin, Template } from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { docSchema, type Doc } from "./schemas/doc";
import { docAdapter, type DocAdapter } from "./adapters/doc-adapter";
import { DocDataSource } from "./datasources/doc-datasource";
import { getTemplates } from "./lib/register-templates";
import packageJson from "../package.json";

export class DocsPlugin extends EntityPlugin<
  Doc,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType: typeof docAdapter.entityType = docAdapter.entityType;
  readonly schema: typeof docSchema = docSchema;
  readonly adapter: DocAdapter = docAdapter;

  constructor() {
    super("docs", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [new DocDataSource(this.logger.child("DocDataSource"))];
  }
}

export function docsPlugin(): Plugin {
  return new DocsPlugin();
}
