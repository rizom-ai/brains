import type { DataSource, Plugin, Template } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { docSchema, type Doc } from "./schemas/doc";
import { docAdapter } from "./adapters/doc-adapter";
import { DocDataSource } from "./datasources/doc-datasource";
import { getTemplates } from "./lib/register-templates";
import packageJson from "../package.json";

export class DocsPlugin extends EntityPlugin<Doc> {
  readonly entityType = docAdapter.entityType;
  readonly schema = docSchema;
  readonly adapter = docAdapter;

  constructor() {
    super("docs", packageJson, {}, undefined);
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
