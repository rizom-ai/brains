import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { ServicePlugin, toolSuccess, toolError } from "@brains/plugins";
import type { ServicePluginContext, ToolResult } from "@brains/plugins";
import {
  type ObsidianVaultConfig,
  type ObsidianVaultConfigInput,
  obsidianVaultConfigSchema,
} from "./config";
import { introspectSchema } from "./lib/schema-introspector";
import { generateTemplate } from "./lib/template-generator";
import { generateFileClass } from "./lib/fileclass-generator";
import {
  generateBase,
  previousDisplayName,
  generatePipelineBase,
  generateSettingsBase,
} from "./lib/base-generator";
import packageJson from "../package.json";
import { getErrorMessage } from "@brains/utils/error";

export interface ObsidianVaultDeps {
  mkdir: (path: string, options?: { recursive: boolean }) => void;
  writeFile: (path: string, content: string) => void;
  existsFile: (path: string) => boolean;
  readFile: (path: string) => string;
  renameFile: (from: string, to: string) => void;
  removeFile: (path: string) => void;
}

const defaultDeps: ObsidianVaultDeps = {
  mkdir: mkdirSync,
  writeFile: writeFileSync,
  existsFile: existsSync,
  readFile: (path) => readFileSync(path, "utf8"),
  renameFile: renameSync,
  removeFile: (path) => rmSync(path, { force: true }),
};

export class ObsidianVaultPlugin extends ServicePlugin<
  ObsidianVaultConfig,
  ObsidianVaultConfigInput
> {
  private readonly deps: ObsidianVaultDeps;

  /**
   * Move a base written under its previous name ("Faqs.base") to the current
   * one. An untouched base is regenerated; an edited one keeps its content.
   */
  private renamePreviousBase(
    entityType: string,
    fields: ReturnType<typeof introspectSchema>,
    basesDir: string,
    basePath: string,
  ): void {
    const before = generateBase(
      entityType,
      fields,
      previousDisplayName(entityType),
    );
    const beforePath = join(basesDir, before.filename);
    if (
      beforePath === basePath ||
      !this.deps.existsFile(beforePath) ||
      this.deps.existsFile(basePath)
    )
      return;
    if (this.deps.readFile(beforePath) === before.content) {
      this.deps.writeFile(basePath, generateBase(entityType, fields).content);
      this.deps.removeFile(beforePath);
    } else {
      this.deps.renameFile(beforePath, basePath);
    }
    this.logger.info(`Renamed base ${before.filename} to its current name`);
  }

  constructor(
    config: ObsidianVaultConfigInput = {},
    deps: Partial<ObsidianVaultDeps> = {},
  ) {
    super("obsidian-vault", packageJson, config, obsidianVaultConfigSchema);
    this.deps = { ...defaultDeps, ...deps };
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    this.logger.info("Auto-syncing Obsidian templates, fileClasses, and bases");
    await this.sync(context);
  }

  public async syncTemplates(filterTypes?: string[]): Promise<
    ToolResult<{
      generated: string[];
      skipped: string[];
      fileClasses: string[];
      bases: string[];
    }>
  > {
    return this.sync(this.getContext(), filterTypes);
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
        this.renamePreviousBase(entityType, fields, basesDir, basePath);
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
      return toolError(getErrorMessage(error, "Unknown error"));
    }
  }
}

export function obsidianVaultPlugin(
  config: ObsidianVaultConfigInput = {},
  deps?: Partial<ObsidianVaultDeps>,
): ObsidianVaultPlugin {
  return new ObsidianVaultPlugin(config, deps);
}
