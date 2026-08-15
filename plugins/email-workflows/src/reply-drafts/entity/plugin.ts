import {
  EntityPlugin,
  type EntityPluginContext,
  type EntityTypeConfig,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../../../package.json";
import { emailReplyDraftAdapter, type EmailReplyDraftAdapter } from "./adapter";
import { emailReplyDraftSchema, type EmailReplyDraftEntity } from "./schema";

const configSchema: z.ZodObject<Record<string, never>> = z.object({});
type Config = z.output<typeof configSchema>;
type ConfigInput = z.input<typeof configSchema>;

export class EmailReplyDraftEntityPlugin extends EntityPlugin<
  EmailReplyDraftEntity,
  Config,
  ConfigInput
> {
  readonly entityType = "email-reply-draft" as const;
  readonly schema: typeof emailReplyDraftSchema = emailReplyDraftSchema;
  readonly adapter: EmailReplyDraftAdapter = emailReplyDraftAdapter;

  constructor() {
    super("email-reply-draft", packageJson, {}, configSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return { projectionSource: false, projectionSourceRole: "excluded" };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.entities.registerPersistValidator(
      "email-reply-draft",
      async (entity) => {
        if (entity.visibility !== "restricted") {
          throw new Error("Email reply drafts must have restricted visibility");
        }
        emailReplyDraftAdapter.parseContent(entity.content);
      },
    );
  }
}
