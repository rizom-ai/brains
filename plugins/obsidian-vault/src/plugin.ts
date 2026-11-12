import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import {
  defineServicePlugin,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  serviceRuntime,
  type ServiceEntityShapes,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import { type ObsidianVaultConfig, obsidianVaultConfigSchema } from "./config";
import { introspectSchema } from "./lib/schema-introspector";
import { generateTemplate } from "./lib/template-generator";
import { generateFileClass } from "./lib/fileclass-generator";
import {
  generateBase,
  previousDisplayName,
  generatePipelineBase,
  generateSettingsBase,
} from "./lib/base-generator";

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

/** What a sync wrote, by entity type, and what it left out. */
export interface ObsidianSyncReport {
  generated: string[];
  skipped: string[];
  fileClasses: string[];
  bases: string[];
}

export interface ObsidianSyncInput {
  /** The shape of every registered entity type, as the vault reads it. */
  shapes: Pick<
    ServiceEntityShapes,
    "types" | "frontmatterSchema" | "isSingleton" | "bodyTemplate"
  >;
  dataDir: string;
  config: ObsidianVaultConfig;
  deps: ObsidianVaultDeps;
  logger: Logger;
  /** Only these types, when given; every registered type otherwise. */
  filterTypes?: string[] | undefined;
}

/**
 * Move a base written under its previous name ("Faqs.base") to the current
 * one. An untouched base is regenerated; an edited one keeps its content.
 */
function renamePreviousBase(
  input: ObsidianSyncInput,
  entityType: string,
  fields: ReturnType<typeof introspectSchema>,
  basesDir: string,
  basePath: string,
): void {
  const { deps, logger } = input;
  const before = generateBase(
    entityType,
    fields,
    previousDisplayName(entityType),
  );
  const beforePath = join(basesDir, before.filename);
  if (
    beforePath === basePath ||
    !deps.existsFile(beforePath) ||
    deps.existsFile(basePath)
  )
    return;
  if (deps.readFile(beforePath) === before.content) {
    deps.writeFile(basePath, generateBase(entityType, fields).content);
    deps.removeFile(beforePath);
  } else {
    deps.renameFile(beforePath, basePath);
  }
  logger.info(`Renamed base ${before.filename} to its current name`);
}

/**
 * Render the brain's entity types into Obsidian's vocabulary: a template, a
 * fileClass and a base per type, plus Settings and Pipeline bases. Bases are
 * only written where missing, so a vault someone tuned stays theirs.
 */
export function syncObsidianVault(
  input: ObsidianSyncInput,
): ObsidianSyncReport {
  const { shapes, dataDir, config, deps, logger, filterTypes } = input;
  const allTypes = shapes.types();
  const targetTypes = filterTypes
    ? allTypes.filter((t) => filterTypes.includes(t))
    : allTypes;

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

  for (const entityType of targetTypes) {
    const schema = shapes.frontmatterSchema(entityType);
    if (!schema) {
      logger.debug(`Skipping ${entityType}: no frontmatter schema`);
      skipped.push(entityType);
      continue;
    }

    const fields = introspectSchema(schema);

    // Generate fileClass (for all entity types)
    const fileClassContent = generateFileClass(entityType, fields);
    deps.writeFile(join(fileClassDir, `${entityType}.md`), fileClassContent);
    fileClasses.push(entityType);

    if (shapes.isSingleton(entityType)) {
      singletonTypes.push(entityType);
      logger.debug(`Generated fileClass (singleton): ${entityType}`);
      continue;
    }

    // Generate template (non-singletons only)
    const templateContent = generateTemplate(
      entityType,
      fields,
      shapes.bodyTemplate(entityType),
    );
    deps.writeFile(join(templateDir, `${entityType}.md`), templateContent);
    generated.push(entityType);

    // Generate base (non-singletons only, if missing)
    const baseResult = generateBase(entityType, fields);
    const basePath = join(basesDir, baseResult.filename);
    renamePreviousBase(input, entityType, fields, basesDir, basePath);
    if (!deps.existsFile(basePath)) {
      deps.writeFile(basePath, baseResult.content);
      bases.push(entityType);
      logger.debug(`Generated base: ${baseResult.filename}`);
    }

    if (baseResult.hasStatus) {
      statusBearingTypes.push({ entityType, fields });
    }

    logger.debug(`Generated template + fileClass: ${entityType}`);
  }

  // Generate Settings.base for singletons (only if missing)
  const settingsContent = generateSettingsBase(singletonTypes);
  if (settingsContent) {
    const settingsPath = join(basesDir, "Settings.base");
    if (!deps.existsFile(settingsPath)) {
      deps.writeFile(settingsPath, settingsContent);
      bases.push("Settings");
      logger.debug("Generated Settings.base");
    }
  }

  // Generate Pipeline.base (only if missing)
  const pipelineContent = generatePipelineBase(statusBearingTypes);
  if (pipelineContent) {
    const pipelinePath = join(basesDir, "Pipeline.base");
    if (!deps.existsFile(pipelinePath)) {
      deps.writeFile(pipelinePath, pipelineContent);
      bases.push("Pipeline");
      logger.debug("Generated Pipeline.base");
    }
  }

  logger.info(
    `Synced ${generated.length} templates, ${fileClasses.length} fileClasses, ${bases.length} bases (${skipped.length} skipped)`,
  );

  return { generated, skipped, fileClasses, bases };
}

/**
 * The vault sync, as a declared service. A test calls this with fakes for
 * the file system; the package default-exports it with the real one.
 */
export function obsidianVault(
  dependencies: Partial<ObsidianVaultDeps> = {},
): ServicePackageDefinition<typeof obsidianVaultConfigSchema> {
  const deps: ObsidianVaultDeps = { ...defaultDeps, ...dependencies };
  return defineServicePlugin(
    { id: "obsidian-vault", config: obsidianVaultConfigSchema },
    {
      subscriptions: (context) => {
        const { config } = context;
        const { logger, entityShapes, dataDir, ready } =
          serviceRuntime(context);
        // Every type has registered by the time the brain is ready.
        ready(() => {
          logger.info(
            "Auto-syncing Obsidian templates, fileClasses, and bases",
          );
          try {
            syncObsidianVault({
              shapes: entityShapes,
              dataDir,
              config,
              deps,
              logger,
            });
          } catch (error) {
            // A vault that cannot be written does not keep the brain from
            // starting; the class logged it and went on.
            logger.error("Failed to sync", { error });
          }
        });
        return [];
      },
    },
  );
}

const obsidianVaultPackage: ServicePackageDefinition<
  typeof obsidianVaultConfigSchema
> = obsidianVault();

export default obsidianVaultPackage;
