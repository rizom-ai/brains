import type {
  Plugin,
  EntityPluginContext,
  JobHandler,
  Template,
  CreateInput,
  CreateExecutionContext,
  CreateInterceptionResult,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { z } from "@brains/utils/zod";
import { noteSchema, type Note } from "./schemas/note";
import { noteAdapter } from "./adapters/note-adapter";
import type { NoteConfig, NoteConfigInput } from "./config";
import { noteConfigSchema } from "./config";
import { noteGenerationTemplate } from "./templates/generation-template";
import { NoteGenerationJobHandler } from "./handlers/noteGenerationJobHandler";
import { UploadMarkdownImportJobHandler } from "./handlers/uploadMarkdownImportJobHandler";
import {
  getMarkdownImportIdentity,
  isSupportedMarkdownUploadMediaType,
} from "./lib/upload-markdown-import";
import { createNoteAtprotoProjection } from "./atproto-projection";
import packageJson from "../package.json";

const webChatUploadsScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

export class NotePlugin extends EntityPlugin<Note, NoteConfig> {
  readonly entityType = noteAdapter.entityType;
  readonly schema = noteSchema;
  readonly adapter = noteAdapter;
  private unregisterAtprotoProjection: (() => void) | undefined;

  constructor(config: NoteConfigInput = {}) {
    super("note", packageJson, config, noteConfigSchema);
  }

  protected override async interceptCreate(
    input: CreateInput,
    _executionContext: CreateExecutionContext,
    context: EntityPluginContext,
  ): Promise<CreateInterceptionResult> {
    if (input.from?.kind !== webChatUploadsScope.refKind) {
      return { kind: "continue", input };
    }

    if (input.transform !== "extract-markdown") {
      return {
        kind: "handled",
        result: {
          success: false,
          error:
            'Importing an upload as a note requires transform: "extract-markdown"',
        },
      };
    }

    const uploadId = input.from.id;
    let uploadRecord;
    try {
      uploadRecord = await context.uploads
        .scoped(webChatUploadsScope)
        .readRecord(uploadId);
    } catch {
      return {
        kind: "handled",
        result: { success: false, error: "Upload ref not found" },
      };
    }

    try {
      if (!isSupportedMarkdownUploadMediaType(uploadRecord.mediaType)) {
        return {
          kind: "handled",
          result: {
            success: false,
            error:
              "Only text, JSON, and PDF uploads can be imported as markdown notes",
          },
        };
      }

      const identity = getMarkdownImportIdentity({
        filename: uploadRecord.filename,
        ...(input.title !== undefined ? { title: input.title } : {}),
      });
      // Create the stub before enqueueing so the returned entityId is the
      // real (possibly deduplicated) id and exists while "generating".
      const stub = noteAdapter.buildStub({
        id: identity.id,
        title: identity.title,
      });
      const now = new Date().toISOString();
      const created = await context.entityService.createEntity({
        entity: {
          id: identity.id,
          entityType: "note",
          content: stub.content,
          metadata: stub.metadata,
          created: now,
          updated: now,
        },
        options: { deduplicateId: true },
      });
      const jobId = await context.jobs.enqueue({
        type: "upload-import",
        data: {
          uploadId,
          entityId: created.entityId,
          ...(input.title !== undefined ? { title: input.title } : {}),
        },
      });

      return {
        kind: "handled",
        result: {
          success: true,
          data: { entityId: created.entityId, status: "generating", jobId },
        },
      };
    } catch (error) {
      return {
        kind: "handled",
        result: {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to import upload as markdown",
        },
      };
    }
  }

  protected override createGenerationHandler(
    context: EntityPluginContext,
  ): JobHandler | null {
    return new NoteGenerationJobHandler(
      this.logger.child("NoteGenerationJobHandler"),
      context,
    );
  }

  protected override getTemplates(): Record<string, Template> {
    return { generation: noteGenerationTemplate };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.jobs.registerHandler(
      "upload-import",
      new UploadMarkdownImportJobHandler(
        this.logger.child("UploadMarkdownImportJobHandler"),
        context,
      ),
    );

    context.eval.registerHandler("generateNote", async (input: unknown) => {
      const parsed = z.object({ prompt: z.string() }).parse(input);
      return context.ai.generate<{ title: string; body: string }>({
        prompt: parsed.prompt,
        templateName: "note:generation",
      });
    });

    this.unregisterAtprotoProjection =
      AtprotoProjectionRegistry.getInstance().register(
        createNoteAtprotoProjection(),
      );
  }

  protected override async getInstructions(): Promise<string> {
    return "Note entities are editable markdown notes. Use them for durable text captures, summaries, and imported markdown; raw files remain document or image entities instead of notes.";
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterAtprotoProjection?.();
    this.unregisterAtprotoProjection = undefined;
  }
}

export function notePlugin(config: NoteConfigInput = {}): Plugin {
  return new NotePlugin(config);
}
