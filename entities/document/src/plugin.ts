import type {
  CreateInput,
  CreateInterceptionResult,
  Plugin,
  ServicePluginContext,
  Tool,
} from "@brains/plugins";
import { createPendingEntity, ServicePlugin } from "@brains/plugins";
import { slugify, z } from "@brains/utils";
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

const PENDING_PDF_DATA_URL = `data:application/pdf;base64,${Buffer.from(
  "%PDF-1.4\n% Pending document placeholder\n%%EOF\n",
).toString("base64")}`;

const documentPluginConfigSchema = z.object({});

type DocumentPluginConfig = z.infer<typeof documentPluginConfigSchema>;

const webChatUploadsScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

function getUploadTitle(input: CreateInput, filename: string): string {
  const title = input.title?.trim();
  if (title) return title;
  const withoutExt = filename.replace(/\.[^.]+$/, "").trim();
  return withoutExt || filename;
}

function toDataUrl(mediaType: string, content: Buffer): string {
  return `data:${mediaType};base64,${content.toString("base64")}`;
}

function buildUploadedDocumentAttachment(input: {
  entityId: string;
  filename: string;
}): {
  mediaType: "application/pdf";
  url: string;
  downloadUrl: string;
  filename: string;
  source: {
    entityType: "document";
    entityId: string;
    attachmentType: "uploaded";
  };
} {
  const encodedId = encodeURIComponent(input.entityId);
  return {
    mediaType: "application/pdf",
    url: `/api/chat/attachments/document?id=${encodedId}`,
    downloadUrl: `/api/chat/attachments/document?id=${encodedId}&download=1`,
    filename: input.filename,
    source: {
      entityType: "document",
      entityId: input.entityId,
      attachmentType: "uploaded",
    },
  };
}

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
    context.entities.registerUploadSaveHandler({
      entityType: this.entityType,
      mediaTypes: ["application/pdf"],
      handler: async (input) => {
        const interception = await this.promoteUpload(
          {
            entityType: this.entityType,
            ...(input.title !== undefined ? { title: input.title } : {}),
            from: input.upload,
          },
          context,
        );
        return interception.kind === "handled"
          ? interception.result
          : { success: false, error: "Document upload save was not handled" };
      },
    });
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
    const context = this.pluginContext;
    if (input.from?.kind === webChatUploadsScope.refKind) {
      if (!context) {
        return {
          kind: "handled",
          result: { success: false, error: "Plugin context not initialized" },
        };
      }
      return this.promoteUpload(input, context);
    }

    if (!input.from || input.from.kind !== "entity-attachment") {
      return { kind: "continue", input };
    }

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
    if (!existing) {
      await this.createPendingDocument(context, {
        id: documentId,
        title: generationData.title ?? documentId,
        filename: `${documentId}.pdf`,
        sourceEntityType: generationData.sourceEntityType,
        sourceEntityId: generationData.sourceEntityId,
        attachmentType: generationData.attachmentType,
        dedupKey,
      });
    }
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

  private async promoteUpload(
    input: CreateInput,
    context: ServicePluginContext,
  ): Promise<CreateInterceptionResult> {
    const uploadRef = input.from;
    if (uploadRef?.kind !== webChatUploadsScope.refKind) {
      return {
        kind: "handled",
        result: { success: false, error: "Unsupported upload ref kind" },
      };
    }

    let upload;
    try {
      upload = await context.uploads
        .scoped(webChatUploadsScope)
        .read(uploadRef.id);
    } catch {
      return {
        kind: "handled",
        result: { success: false, error: "Upload ref not found" },
      };
    }

    if (upload.record.mediaType !== "application/pdf") {
      return {
        kind: "handled",
        result: {
          success: false,
          error: "Only PDF uploads can be promoted to document entities",
        },
      };
    }

    const title = getUploadTitle(input, upload.record.filename);
    const id = slugify(title);
    if (!id) {
      return {
        kind: "handled",
        result: {
          success: false,
          error:
            "Could not derive a document id from the uploaded filename. Provide a title.",
        },
      };
    }

    const now = new Date().toISOString();
    const documentEntity = documentAdapter.createDocumentEntity({
      dataUrl: toDataUrl(upload.record.mediaType, upload.content),
      filename: upload.record.filename,
      title,
      status: "draft",
      sourceUploadId: uploadRef.id,
      sourceFilename: upload.record.filename,
      sourceMediaType: upload.record.mediaType,
      attachmentType: "uploaded",
      dedupKey: `upload:${uploadRef.kind}:${uploadRef.id}`,
    });
    const result = await context.entityService.createEntity({
      entity: {
        id,
        ...documentEntity,
        created: now,
        updated: now,
      },
      options: { deduplicateId: true },
    });

    return {
      kind: "handled",
      result: {
        success: true,
        data: {
          entityId: result.entityId,
          status: "created",
          attachment: buildUploadedDocumentAttachment({
            entityId: result.entityId,
            filename: upload.record.filename,
          }),
        },
      },
    };
  }

  private async createPendingDocument(
    context: ServicePluginContext,
    input: {
      id: string;
      title: string;
      filename: string;
      sourceEntityType: string;
      sourceEntityId: string;
      attachmentType: string;
      dedupKey: string;
    },
  ): Promise<void> {
    const now = new Date().toISOString();
    const entityData = documentAdapter.createDocumentEntity({
      dataUrl: PENDING_PDF_DATA_URL,
      filename: input.filename,
      title: input.title,
      status: "pending",
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      attachmentType: input.attachmentType,
      dedupKey: input.dedupKey,
    });

    await createPendingEntity({
      entityService: context.entityService,
      entity: {
        id: input.id,
        ...entityData,
        created: now,
        updated: now,
      },
    });
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
    return `For durable raw PDF saves/promotions from uploaded PDFs, call system_upload_save with the exact upload object shown in the current turn or conversation "Available upload refs" hint. Do this only after the user explicitly asks to save/import/promote the raw PDF as a document. If that hint is absent, omit upload entirely; never invent upload IDs or placeholder upload refs. Uploaded PDFs are not decks; raw upload promotion preserves the PDF as a document. Do not use entityType: "note" or transform: "extract-markdown" unless the user asks to turn the upload into a note/markdown. For generated/source-derived PDFs, call system_create with entityType: "document" and sourceAttachment. Deck carousel PDFs use sourceAttachment: { sourceEntityType: "deck", sourceEntityId: <deck ID>, attachmentType: "carousel" }. Printable PDFs for blog posts, projects, and products use sourceAttachment with attachmentType: "printable" and sourceEntityType "post", "project", or "product". Omit upload and sourceAttachment entirely for ordinary direct document creates that use content, prompt, or url. Include targetEntityType/targetEntityId when the user asks to attach the saved document to another entity. Use replace: true when they ask to regenerate or replace a saved PDF. Only use document_generate for explicit preview/prepare requests where they need an immediate PDF attachment. Do not use generic attachment types like "document".`;
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
