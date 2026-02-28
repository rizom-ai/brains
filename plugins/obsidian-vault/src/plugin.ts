import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  ServicePlugin,
  createTypedTool,
  toolSuccess,
  toolError,
} from "@brains/plugins";
import type {
  ServicePluginContext,
  PluginTool,
  ToolResult,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { obsidianVaultConfigSchema, type ObsidianVaultConfig } from "./config";
import { introspectSchema } from "./lib/schema-introspector";
import { generateTemplate } from "./lib/template-generator";
import packageJson from "../package.json";

export interface ObsidianVaultDeps {
  mkdir: (path: string, options?: { recursive: boolean }) => void;
  writeFile: (path: string, content: string) => void;
}

const defaultDeps: ObsidianVaultDeps = {
  mkdir: mkdirSync,
  writeFile: writeFileSync,
};

const syncTemplatesInputSchema = z.object({
  entityTypes: z
    .array(z.string())
    .optional()
    .describe("Entity types to generate templates for (default: all)"),
});

export class ObsidianVaultPlugin extends ServicePlugin<ObsidianVaultConfig> {
  private readonly deps: ObsidianVaultDeps;

  constructor(
    config: Partial<ObsidianVaultConfig> = {},
    deps: Partial<ObsidianVaultDeps> = {},
  ) {
    super("obsidian-vault", packageJson, config, obsidianVaultConfigSchema);
    this.deps = { ...defaultDeps, ...deps };
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    if (this.config.autoSync) {
      context.messaging.subscribe("system:plugins:ready", async () => {
        this.logger.info("Auto-syncing Obsidian templates");
        await this.syncTemplates(context);
        return { success: true };
      });
    }
  }

  protected override async getTools(): Promise<PluginTool[]> {
    const context = this.getContext();
    return [
      createTypedTool(
        this.id,
        "sync-templates",
        "Generate Obsidian templates for all registered entity types and write them to the vault's templates folder. Each template has the correct YAML frontmatter so 'Create from template' in Obsidian produces import-ready files.",
        syncTemplatesInputSchema,
        async (input) => {
          return this.syncTemplates(context, input.entityTypes);
        },
      ),
    ];
  }

  private async syncTemplates(
    context: ServicePluginContext,
    filterTypes?: string[],
  ): Promise<ToolResult<{ generated: string[]; skipped: string[] }>> {
    try {
      const allTypes = context.entityService.getEntityTypes();
      const targetTypes = filterTypes
        ? allTypes.filter((t) => filterTypes.includes(t))
        : allTypes;

      const templateDir = join(context.dataDir, this.config.templateFolder);
      this.deps.mkdir(templateDir, { recursive: true });

      const generated: string[] = [];
      const skipped: string[] = [];

      for (const entityType of targetTypes) {
        const schema =
          context.entities.getEffectiveFrontmatterSchema(entityType);
        if (!schema) {
          this.logger.debug(`Skipping ${entityType}: no frontmatter schema`);
          skipped.push(entityType);
          continue;
        }

        const fields = introspectSchema(schema);
        const adapter = context.entities.getAdapter(entityType);
        const bodyTemplate = adapter?.getBodyTemplate() ?? "";
        const content = generateTemplate(entityType, fields, bodyTemplate);
        const filePath = join(templateDir, `${entityType}.md`);

        this.deps.writeFile(filePath, content);
        generated.push(entityType);
        this.logger.debug(`Generated template: ${filePath}`);
      }

      this.logger.info(
        `Synced ${generated.length} templates (${skipped.length} skipped)`,
      );

      return toolSuccess({ generated, skipped });
    } catch (error) {
      this.logger.error("Failed to sync templates", { error });
      return toolError(
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }
}

export function obsidianVaultPlugin(
  config?: Partial<ObsidianVaultConfig>,
  deps?: Partial<ObsidianVaultDeps>,
): ObsidianVaultPlugin {
  return new ObsidianVaultPlugin(config, deps);
}
