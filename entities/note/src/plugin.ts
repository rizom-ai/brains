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
import { z } from "@brains/utils/zod-v4";
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

const generateNoteEvalInputSchema = z.object({
  prompt: z.string(),
});

type GenerateNoteEvalInput = z.output<typeof generateNoteEvalInputSchema>;

export class NotePlugin extends EntityPlugin<
  Note,
  NoteConfig,
  NoteConfigInput
> {
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
      const jobId = await context.jobs.enqueue({
        type: "upload-import",
        data: {
          uploadId,
          ...(input.title !== undefined ? { title: input.title } : {}),
        },
      });

      return {
        kind: "handled",
        result: {
          success: true,
          data: { entityId: identity.id, status: "generating", jobId },
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
      const parsed: GenerateNoteEvalInput =
        generateNoteEvalInputSchema.parse(input);
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
    return 'To turn an uploaded text or PDF file into an editable markdown note, call system_create with entityType: "base", the exact upload object from the current turn or conversation upload refs hint, and transform: "extract-markdown". Use this only when the user explicitly asks to import, extract, or turn the upload into a note/markdown. Do not use this note-import pattern for raw file saves/promotions such as saving a PDF as a document or saving an image as an image; those use the raw upload with entityType "document" or "image" and no transform. Omit transform for ordinary direct note creates.';
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterAtprotoProjection?.();
    this.unregisterAtprotoProjection = undefined;
  }
}

export function notePlugin(config: NoteConfigInput = {}): Plugin {
  return new NotePlugin(config);
}
