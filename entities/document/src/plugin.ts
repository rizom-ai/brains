import type {
  CreateInput,
  CreateInterceptionResult,
  Plugin,
  ServicePluginContext,
  Tool,
} from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import {
  documentAdapter,
  documentSchema,
  type DocumentEntity,
} from "@brains/document";
import {
  DocumentGenerationJobHandler,
  documentGenerationJobSchema,
  getDocumentId,
} from "./handlers/documentGenerationHandler";
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
    context.entities.registerCreateInterceptor(this.entityType, (input) =>
      this.interceptCreate(input),
    );
    context.jobs.registerHandler(
      "generate",
      new DocumentGenerationJobHandler(
        this.logger.child("DocumentGenerationJobHandler"),
        context,
      ),
    );
  }

  private async interceptCreate(
    input: CreateInput,
  ): Promise<CreateInterceptionResult> {
    if (!input.from) {
      return { kind: "continue", input };
    }

    const context = this.pluginContext;
    if (!context) {
      return {
        kind: "handled",
        result: { success: false, error: "Plugin context not initialized" },
      };
    }

    const generationData = documentGenerationJobSchema.parse({
      sourceEntityType: input.from.sourceEntityType,
      sourceEntityId: input.from.sourceEntityId,
      attachmentType: input.from.attachmentType,
      ...(input.title && { title: input.title }),
      ...(input.replace === true && { replace: true }),
      ...(input.targetEntityType && {
        targetEntityType: input.targetEntityType,
      }),
      ...(input.targetEntityId && { targetEntityId: input.targetEntityId }),
    });
    const documentId = getDocumentId(generationData);
    const jobId = await context.jobs.enqueue({
      type: "generate",
      data: { ...generationData, documentId },
    });

    return {
      kind: "handled",
      result: {
        success: true,
        data: { entityId: documentId, jobId, status: "generating" },
      },
    };
  }

  protected override async getInstructions(): Promise<string> {
    return `When a user asks to save, regenerate, or replace a deck carousel PDF as a durable document, call system_create with entityType: "document" and from: { sourceEntityType: "deck", sourceEntityId: <deck ID>, attachmentType: "carousel" }. Include targetEntityType/targetEntityId when they ask to attach it to another entity. Use replace: true when they ask to regenerate or replace a saved carousel document. Only use document_generate for explicit preview/prepare requests where they need an immediate PDF attachment. Do not use generic attachment types like "document" for deck carousel PDFs.`;
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
