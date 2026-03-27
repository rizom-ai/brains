import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  ServicePlugin,
  createTool,
  toolSuccess,
  toolError,
} from "@brains/plugins";
import type { ServicePluginContext, Tool, ToolResult } from "@brains/plugins";
import { z } from "@brains/utils";
import { obsidianVaultConfigSchema, type ObsidianVaultConfig } from "./config";
import { introspectSchema } from "./lib/schema-introspector";
import { generateTemplate } from "./lib/template-generator";
import { generateFileClass } from "./lib/fileclass-generator";
import {
  generateBase,
  generatePipelineBase,
  generateSettingsBase,
} from "./lib/base-generator";
import packageJson from "../package.json";

export interface ObsidianVaultDeps {
  mkdir: (path: string, options?: { recursive: boolean }) => void;
  writeFile: (path: string, content: string) => void;
  existsFile: (path: string) => boolean;
}

const defaultDeps: ObsidianVaultDeps = {
  mkdir: mkdirSync,
  writeFile: writeFileSync,
  existsFile: existsSync,
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
      this.logger.info(
        "Auto-syncing Obsidian templates, fileClasses, and bases",
      );
      await this.sync(context);
      return { success: true };
    });
  }

  protected override async getTools(): Promise<Tool[]> {
    const context = this.getContext();
    return [
      createTool(
        this.id,
        "sync-templates",
        "Generate Obsidian templates, Metadata Menu fileClass definitions, and Bases views for all registered entity types.",
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
      bases: string[];
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
      const basesDir = join(baseDir, "bases");
      this.deps.mkdir(templateDir, { recursive: true });
      this.deps.mkdir(fileClassDir, { recursive: true });
      this.deps.mkdir(basesDir, { recursive: true });

      const generated: string[] = [];
      const skipped: string[] = [];
      const fileClasses: string[] = [];
      const bases: string[] = [];
      const singletonTypes: string[] = [];
      const statusBearingTypes: {
        entityType: string;
        fields: ReturnType<typeof introspectSchema>;
      }[] = [];

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
        const isSingleton = adapter?.isSingleton === true;

        // Generate fileClass (for all entity types)
        const fileClassContent = generateFileClass(entityType, fields);
        this.deps.writeFile(
          join(fileClassDir, `${entityType}.md`),
          fileClassContent,
        );
        fileClasses.push(entityType);

        if (isSingleton) {
          singletonTypes.push(entityType);
          this.logger.debug(`Generated fileClass (singleton): ${entityType}`);
          continue;
        }

        // Generate template (non-singletons only)
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

        // Generate base (non-singletons only, if missing)
        const baseResult = generateBase(entityType, fields);
        const basePath = join(basesDir, baseResult.filename);
        if (!this.deps.existsFile(basePath)) {
          this.deps.writeFile(basePath, baseResult.content);
          bases.push(entityType);
          this.logger.debug(`Generated base: ${baseResult.filename}`);
        }

        if (baseResult.hasStatus) {
          statusBearingTypes.push({ entityType, fields });
        }

        this.logger.debug(`Generated template + fileClass: ${entityType}`);
      }

      // Generate Settings.base for singletons (only if missing)
      const settingsContent = generateSettingsBase(singletonTypes);
      if (settingsContent) {
        const settingsPath = join(basesDir, "Settings.base");
        if (!this.deps.existsFile(settingsPath)) {
          this.deps.writeFile(settingsPath, settingsContent);
          bases.push("Settings");
          this.logger.debug("Generated Settings.base");
        }
      }

      // Generate Pipeline.base (only if missing)
      const pipelineContent = generatePipelineBase(statusBearingTypes);
      if (pipelineContent) {
        const pipelinePath = join(basesDir, "Pipeline.base");
        if (!this.deps.existsFile(pipelinePath)) {
          this.deps.writeFile(pipelinePath, pipelineContent);
          bases.push("Pipeline");
          this.logger.debug("Generated Pipeline.base");
        }
      }

      this.logger.info(
        `Synced ${generated.length} templates, ${fileClasses.length} fileClasses, ${bases.length} bases (${skipped.length} skipped)`,
      );

      return toolSuccess({ generated, skipped, fileClasses, bases });
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
