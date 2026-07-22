import type {
  EntityPluginContext,
  EntityTypeConfig,
  Plugin,
} from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import packageJson from "../package.json";
import { styleGuideAdapter, type StyleGuideAdapter } from "./adapter";
import { styleGuideEntitySchema, type StyleGuideEntity } from "./schema";

export class StyleGuidePlugin extends EntityPlugin<
  StyleGuideEntity,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType = "style-guide" as const;
  readonly schema: typeof styleGuideEntitySchema = styleGuideEntitySchema;
  readonly adapter: StyleGuideAdapter = styleGuideAdapter;

  constructor() {
    super("style-guide", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return { embeddable: false };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    context.messaging.subscribe("sync:initial:completed", async () => {
      const existing = await context.entityService.getEntity<StyleGuideEntity>({
        entityType: "style-guide",
        id: "style-guide",
      });
      if (existing) return { success: true };

      await context.entityService.createEntity({
        entity: {
          id: "style-guide",
          entityType: "style-guide",
          content: styleGuideAdapter.createStyleGuideContent({
            name: "Default style guide",
          }),
          metadata: {},
        },
      });
      return { success: true };
    });
  }
}

export function styleGuidePlugin(): Plugin {
  return new StyleGuidePlugin();
}
