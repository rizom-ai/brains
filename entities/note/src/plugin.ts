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
import { z } from "@brains/utils";
import { noteSchema, type Note } from "./schemas/note";
import { noteAdapter } from "./adapters/note-adapter";
import type { NoteConfig, NoteConfigInput } from "./config";
import { noteConfigSchema } from "./config";
import { noteGenerationTemplate } from "./templates/generation-template";
import { NoteGenerationJobHandler } from "./handlers/noteGenerationJobHandler";
import { extractMarkdownFromUpload } from "./lib/upload-markdown-import";
import { createNoteAtprotoProjection } from "./atproto-projection";
import packageJson from "../package.json";

const webChatUploadsScope = {
  namespace: "web-chat",
  refKind: "web-chat-upload",
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

    let upload;
    try {
      upload = await context.uploads
        .scoped(webChatUploadsScope)
        .read(input.from.id);
    } catch {
      return {
        kind: "handled",
        result: { success: false, error: "Upload ref not found" },
      };
    }

    try {
      const imported = await extractMarkdownFromUpload({
        upload,
        ...(input.title !== undefined ? { title: input.title } : {}),
      });
      const now = new Date().toISOString();
      const entity = noteAdapter.fromMarkdown(imported.content);
      const result = await context.entityService.createEntity({
        entity: {
          id: imported.id,
          entityType: "base",
          content: imported.content,
          metadata: { title: imported.title, ...entity.metadata },
          created: now,
          updated: now,
        },
        options: { deduplicateId: true },
      });

      return {
        kind: "handled",
        result: {
          success: true,
          data: { entityId: result.entityId, status: "created" },
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
    return 'To turn an uploaded text or PDF file into an editable markdown note, call system_create with entityType: "base", the exact upload object from the current turn, and transform: "extract-markdown". Use this only when the user explicitly asks to import, extract, or turn the upload into a note/markdown; omit transform for ordinary direct note creates.';
  }

  protected override async onShutdown(): Promise<void> {
    this.unregisterAtprotoProjection?.();
    this.unregisterAtprotoProjection = undefined;
  }
}

export function notePlugin(config: NoteConfigInput = {}): Plugin {
  return new NotePlugin(config);
}
