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
    const dedupKey = await this.getDedupKey(generationData, context);
    const existing =
      generationData.replace === true
        ? undefined
        : await this.findExistingDocument(dedupKey, context);
    const documentId = existing?.id ?? getDocumentId(generationData, dedupKey);
    const jobId = await context.jobs.enqueue({
      type: "generate",
      data: { ...generationData, dedupKey, documentId },
    });

    const filename = `${documentId}.pdf`;
    return {
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: documentId,
          jobId,
          status: "generating",
          attachment: {
            mediaType: "application/pdf",
            url: `/api/chat/attachments/document?id=${encodeURIComponent(documentId)}`,
            downloadUrl: `/api/chat/attachments/document?id=${encodeURIComponent(documentId)}&download=1`,
            filename,
            source: {
              entityType: "document",
              entityId: documentId,
              attachmentType: generationData.attachmentType,
            },
          },
        },
      },
    };
  }

  private async getDedupKey(
    data: z.infer<typeof documentGenerationJobSchema>,
    context: ServicePluginContext,
  ): Promise<string> {
    if (data.dedupKey !== undefined) return data.dedupKey;
    if (data.renderUrl !== undefined) {
      return `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:${data.renderUrl}`;
    }

    const base = `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:resolved-attachment`;
    const source = await context.entityService.getEntity({
      entityType: data.sourceEntityType,
      id: data.sourceEntityId,
    });
    return source ? `${base}:${source.contentHash}` : base;
  }

  private async findExistingDocument(
    dedupKey: string,
    context: ServicePluginContext,
  ): Promise<DocumentEntity | undefined> {
    const documents = await context.entityService.listEntities<DocumentEntity>({
      entityType: "document",
      options: { filter: { metadata: { dedupKey } } },
    });
    return documents[0];
  }

  protected override async getInstructions(): Promise<string> {
    return `For durable PDF saves, call system_create with entityType: "document" and a source attachment in from. Deck carousel PDFs use from: { sourceEntityType: "deck", sourceEntityId: <deck ID>, attachmentType: "carousel" }. Printable PDFs for blog posts, projects, and products use attachmentType: "printable" with sourceEntityType "post", "project", or "product". Include targetEntityType/targetEntityId when the user asks to attach the saved document to another entity. Use replace: true when they ask to regenerate or replace a saved PDF. Only use document_generate for explicit preview/prepare requests where they need an immediate PDF attachment. Do not use generic attachment types like "document".`;
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
