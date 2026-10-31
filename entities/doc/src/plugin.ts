import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
  DataSource,
  EntityPluginContext,
  EntityTypeConfig,
  Plugin,
  Template,
} from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { docSchema, type Doc } from "./schemas/doc";
import { docAdapter, type DocAdapter } from "./adapters/doc-adapter";
import { DocDataSource } from "./datasources/doc-datasource";
import { getTemplates } from "./lib/register-templates";
import { createDocFromText } from "./lib/create-from-text";
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

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    // sourcePath was written by the docs sync script and read by nothing.
    return { projectionSourceRole: "primary", retiredFields: ["sourcePath"] };
  }

  protected override async getInstructions(): Promise<string> {
    return [
      'Docs (entityType "doc") are this brain\'s reference documentation.',
      "For a question about how something works, how to set it up or how to use it, run system_search before answering from general knowledge or asking the network, and answer from the docs it finds.",
      "When you answer from the docs, name each doc you answer from by its title, so the reply links to it.",
    ].join("\n");
  }

  protected override async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    return createDocFromText(input, context);
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
