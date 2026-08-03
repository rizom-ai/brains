import {
  EntityPlugin,
  type EntityPluginContext,
  type EntityTypeConfig,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../../package.json";
import { mailItemAdapter } from "./adapters/mail-item-adapter";
import type { MailItemAdapter } from "./adapters/mail-item-adapter";
import { mailItemSchema, type MailItemEntity } from "./schemas/mail-item";

const mailItemPluginConfigSchema: z.ZodObject<Record<string, never>> = z.object(
  {},
);

type MailItemPluginConfig = z.output<typeof mailItemPluginConfigSchema>;
type MailItemPluginConfigInput = z.input<typeof mailItemPluginConfigSchema>;

export class MailItemPlugin extends EntityPlugin<
  MailItemEntity,
  MailItemPluginConfig,
  MailItemPluginConfigInput
> {
  readonly entityType = "mail-item" as const;
  readonly schema: typeof mailItemSchema = mailItemSchema;
  readonly adapter: MailItemAdapter = mailItemAdapter;

  constructor() {
    super("mail-item", packageJson, {}, mailItemPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return { projectionSource: false, projectionSourceRole: "excluded" };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.entities.registerPersistValidator("mail-item", async (entity) => {
      if (entity.visibility !== "restricted") {
        throw new Error("Mail items must have restricted visibility");
      }
      const { frontmatter } = mailItemAdapter.parseMailItemContent(
        entity.content,
      );
      if (
        frontmatter.category === null &&
        (frontmatter.title !== "Unclassified email" ||
          frontmatter.priority !== "high")
      ) {
        throw new Error(
          "Only the system fallback may have an unclassified category",
        );
      }
    });
  }
}
