import type {
  Plugin,
  EntityPluginContext,
  JobHandler,
  Template,
} from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { noteSchema, type Note } from "./schemas/note";
import { noteAdapter } from "./adapters/note-adapter";
import type { NoteConfig, NoteConfigInput } from "./config";
import { noteConfigSchema } from "./config";
import { noteGenerationTemplate } from "./templates/generation-template";
import { NoteGenerationJobHandler } from "./handlers/noteGenerationJobHandler";
import packageJson from "../package.json";

export class NotePlugin extends EntityPlugin<Note, NoteConfig> {
  readonly entityType = noteAdapter.entityType;
  readonly schema = noteSchema;
  readonly adapter = noteAdapter;

  constructor(config: NoteConfigInput = {}) {
    super("note", packageJson, config, noteConfigSchema);
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
  }
}

export function notePlugin(config: NoteConfigInput = {}): Plugin {
  return new NotePlugin(config);
}
