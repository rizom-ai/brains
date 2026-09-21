import {
  EntityPlugin,
  emptyEntityPluginConfigSchema,
  type EntityPluginContext,
  type EntityTypeConfig,
} from "@brains/plugins";
import packageJson from "../../package.json";
import { contactRequestAdapter, type ContactRequestAdapter } from "./adapter";
import { contactRequestSchema, type ContactRequest } from "./schema";

/** Entity half of the contact feature. Installing it alone does not expose intake. */
export class ContactRequestPlugin extends EntityPlugin<
  ContactRequest,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType = "contact-request" as const;
  readonly schema: typeof contactRequestSchema = contactRequestSchema;
  readonly adapter: ContactRequestAdapter = contactRequestAdapter;

  constructor() {
    super("contact-request", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return {
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.entities.registerPersistValidator(
      this.entityType,
      async (entity) => {
        if (entity.visibility !== "restricted") {
          throw new Error("Contact requests must have restricted visibility");
        }
        contactRequestAdapter.parseContent(entity.content);
      },
    );
  }
}
