import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import { type ObsidianVaultConfig, obsidianVaultConfigSchema } from "./config";
import { introspectSchema } from "./lib/schema-introspector";
import { generateTemplate } from "./lib/template-generator";
import { generateFileClass } from "./lib/fileclass-generator";
import {
  generateBase,
  generatePipelineBase,
  generateSettingsBase,
} from "./lib/base-generator";

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

export interface ObsidianSyncReport {
  generated: string[];
  skipped: string[];
  fileClasses: string[];
  bases: string[];
}

interface ObsidianShapeReader {
  frontmatterSchema(
    entityType: string,
  ): Parameters<typeof introspectSchema>[0] | undefined;
  isSingleton(entityType: string): boolean;
  bodyTemplate(entityType: string): string;
}

interface ObsidianSyncInput {
  entityTypes: string[];
  shapes: ObsidianShapeReader;
  dataDir: string;
  config: ObsidianVaultConfig;
  deps: ObsidianVaultDeps;
  log: (message: string) => void;
}

/**
 * Render the brain's entity types into Obsidian's vocabulary: a template, a
 * fileClass and a base per type, plus Settings and Pipeline bases. Bases are
 * only written where missing, so a vault someone tuned stays theirs.
 */
export function syncObsidianArtifacts(
  input: ObsidianSyncInput,
): ObsidianSyncReport {
  const { entityTypes, shapes, dataDir, config, deps, log } = input;

  const baseDir = join(dataDir, config.baseFolder);
  const templateDir = join(baseDir, "templates");
  const fileClassDir = join(baseDir, "fileClasses");
  const basesDir = join(baseDir, "bases");
  deps.mkdir(templateDir, { recursive: true });
  deps.mkdir(fileClassDir, { recursive: true });
  deps.mkdir(basesDir, { recursive: true });

  const generated: string[] = [];
  const skipped: string[] = [];
  const fileClasses: string[] = [];
  const bases: string[] = [];
  const singletonTypes: string[] = [];
  const statusBearingTypes: {
    entityType: string;
    fields: ReturnType<typeof introspectSchema>;
  }[] = [];

  for (const entityType of entityTypes) {
    const schema = shapes.frontmatterSchema(entityType);
    if (!schema) {
      log(`Skipping ${entityType}: no frontmatter schema`);
      skipped.push(entityType);
      continue;
    }

    const fields = introspectSchema(schema);

    // Generate fileClass (for all entity types)
    deps.writeFile(
      join(fileClassDir, `${entityType}.md`),
      generateFileClass(entityType, fields),
    );
    fileClasses.push(entityType);

    if (shapes.isSingleton(entityType)) {
      singletonTypes.push(entityType);
      log(`Generated fileClass (singleton): ${entityType}`);
      continue;
    }

    // Generate template (non-singletons only)
    deps.writeFile(
      join(templateDir, `${entityType}.md`),
      generateTemplate(entityType, fields, shapes.bodyTemplate(entityType)),
    );
    generated.push(entityType);

    // Generate base (non-singletons only, if missing)
    const baseResult = generateBase(entityType, fields);
    const basePath = join(basesDir, baseResult.filename);
    if (!deps.existsFile(basePath)) {
      deps.writeFile(basePath, baseResult.content);
      bases.push(entityType);
      log(`Generated base: ${baseResult.filename}`);
    }

    if (baseResult.hasStatus) {
      statusBearingTypes.push({ entityType, fields });
    }

    log(`Generated template + fileClass: ${entityType}`);
  }

  // Generate Settings.base for singletons (only if missing)
  const settingsContent = generateSettingsBase(singletonTypes);
  if (settingsContent) {
    const settingsPath = join(basesDir, "Settings.base");
    if (!deps.existsFile(settingsPath)) {
      deps.writeFile(settingsPath, settingsContent);
      bases.push("Settings");
      log("Generated Settings.base");
    }
  }

  // Generate Pipeline.base (only if missing)
  const pipelineContent = generatePipelineBase(statusBearingTypes);
  if (pipelineContent) {
    const pipelinePath = join(basesDir, "Pipeline.base");
    if (!deps.existsFile(pipelinePath)) {
      deps.writeFile(pipelinePath, pipelineContent);
      bases.push("Pipeline");
      log("Generated Pipeline.base");
    }
  }

  return { generated, skipped, fileClasses, bases };
}

/**
 * The vault sync, as a declared service.
 *
 * Dependencies are closed over rather than injected through a constructor:
 * the package default-exports `obsidianVault()`, and a test calls it with
 * fakes.
 */
export function obsidianVault(
  dependencies: Partial<ObsidianVaultDeps> = {},
): ServicePackageDefinition<typeof obsidianVaultConfigSchema> {
  const deps: ObsidianVaultDeps = { ...defaultDeps, ...dependencies };

  return defineServicePlugin({
    id: "obsidian-vault",
    config: obsidianVaultConfigSchema,

    // Every type must exist before its shape can be rendered, which is what
    // `ready` is for — registration order does not matter beyond that.
    ready: ({ config, entities, dataDir, entityShapes, logger }) => {
      logger.info("Auto-syncing Obsidian templates, fileClasses, and bases");
      const report = syncObsidianArtifacts({
        entityTypes: entities.getEntityTypes(),
        shapes: entityShapes,
        dataDir,
        config,
        deps,
        log: (message) => logger.debug(message),
      });
      logger.info(
        `Synced ${report.generated.length} templates, ${report.fileClasses.length} fileClasses, ${report.bases.length} bases (${report.skipped.length} skipped)`,
      );
    },
  });
}

const obsidianVaultPackage: ServicePackageDefinition<
  typeof obsidianVaultConfigSchema
> = obsidianVault();

export default obsidianVaultPackage;
