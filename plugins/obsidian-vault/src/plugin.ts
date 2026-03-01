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
import { generateFileClass } from "./lib/fileclass-generator";
import packageJson from "../package.json";

export interface ObsidianVaultDeps {
  mkdir: (path: string, options?: { recursive: boolean }) => void;
  writeFile: (path: string, content: string) => void;
}

const defaultDeps: ObsidianVaultDeps = {
  mkdir: mkdirSync,
  writeFile: writeFileSync,
};

const syncInputSchema = z.object({
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
    context.messaging.subscribe("system:plugins:ready", async () => {
      this.logger.info("Auto-syncing Obsidian templates and fileClasses");
      await this.sync(context);
      return { success: true };
    });
  }

  protected override async getTools(): Promise<PluginTool[]> {
    const context = this.getContext();
    return [
      createTypedTool(
        this.id,
        "sync-templates",
        "Generate Obsidian templates and Metadata Menu fileClass definitions for all registered entity types. Templates go to _obsidian/templates/, fileClasses to _obsidian/fileClasses/.",
        syncInputSchema,
        async (input) => {
          return this.sync(context, input.entityTypes);
        },
      ),
    ];
  }

  private async sync(
    context: ServicePluginContext,
    filterTypes?: string[],
  ): Promise<
    ToolResult<{
      generated: string[];
      skipped: string[];
      fileClasses: string[];
    }>
  > {
    try {
      const allTypes = context.entityService.getEntityTypes();
      const targetTypes = filterTypes
        ? allTypes.filter((t) => filterTypes.includes(t))
        : allTypes;

      const baseDir = join(context.dataDir, this.config.baseFolder);
      const templateDir = join(baseDir, "templates");
      const fileClassDir = join(baseDir, "fileClasses");
      this.deps.mkdir(templateDir, { recursive: true });
      this.deps.mkdir(fileClassDir, { recursive: true });

      const generated: string[] = [];
      const skipped: string[] = [];
      const fileClasses: string[] = [];

      for (const entityType of targetTypes) {
        const schema =
          context.entities.getEffectiveFrontmatterSchema(entityType);
        if (!schema) {
          this.logger.debug(`Skipping ${entityType}: no frontmatter schema`);
          skipped.push(entityType);
          continue;
        }

        const fields = introspectSchema(schema);

        // Generate template
        const adapter = context.entities.getAdapter(entityType);
        const bodyTemplate = adapter?.getBodyTemplate() ?? "";
        const templateContent = generateTemplate(
          entityType,
          fields,
          bodyTemplate,
        );
        this.deps.writeFile(
          join(templateDir, `${entityType}.md`),
          templateContent,
        );
        generated.push(entityType);

        // Generate fileClass
        const fileClassContent = generateFileClass(entityType, fields);
        this.deps.writeFile(
          join(fileClassDir, `${entityType}.md`),
          fileClassContent,
        );
        fileClasses.push(entityType);

        this.logger.debug(`Generated template + fileClass: ${entityType}`);
      }

      this.logger.info(
        `Synced ${generated.length} templates, ${fileClasses.length} fileClasses (${skipped.length} skipped)`,
      );

      return toolSuccess({ generated, skipped, fileClasses });
    } catch (error) {
      this.logger.error("Failed to sync", { error });
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
