import type { Plugin, ServicePluginContext, Tool } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import {
  documentAdapter,
  documentSchema,
  type DocumentEntity,
} from "@brains/document";
import { DocumentGenerationJobHandler } from "./handlers/documentGenerationHandler";
import { createDocumentTools } from "./tools";
import packageJson from "../package.json";

const documentPluginConfigSchema = z.object({});

type DocumentPluginConfig = z.infer<typeof documentPluginConfigSchema>;

export class DocumentPlugin extends ServicePlugin<DocumentPluginConfig> {
  readonly entityType = documentAdapter.entityType;
  readonly schema = documentSchema;
  readonly adapter = documentAdapter;
  private pluginContext: ServicePluginContext | undefined;

  constructor() {
    super("document", packageJson, {}, documentPluginConfigSchema);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;
    context.entities.register(this.entityType, this.schema, this.adapter, {
      embeddable: false,
    });
    context.jobs.registerHandler(
      "generate",
      new DocumentGenerationJobHandler(
        this.logger.child("DocumentGenerationJobHandler"),
        context,
      ),
    );
  }

  protected override async getTools(): Promise<Tool[]> {
    const context = this.pluginContext;
    if (!context) {
      throw new Error("Plugin context not initialized");
    }
    return createDocumentTools(this.id, (input, toolContext) =>
      context.jobs.enqueue({
        type: "generate",
        data: input,
        toolContext,
      }),
    );
  }
}

export function documentPlugin(): Plugin {
  return new DocumentPlugin();
}

export type { DocumentEntity };
