import {
  generateBase,
  generatePipelineBase,
  generateSettingsBase,
} from "./base-generator";
import type {
  FieldInfo,
  GeneratedFile,
  GeneratedFiles,
  VaultShape,
} from "@brains/vault-sync";
import { generateFileClass } from "./fileclass-generator";
import { generateTemplate } from "./template-generator";

/** Where the plugin writes the brain's templates, fileClasses and bases. */
export const OBSIDIAN_FILES_FOLDER = "_obsidian";

export const TEMPLATES_FOLDER: string = `${OBSIDIAN_FILES_FOLDER}/templates`;

const BASES_FOLDER = `${OBSIDIAN_FILES_FOLDER}/bases`;

export type VaultFile = GeneratedFile;

/** Obsidian's Templates setting: the folder it takes templates from. */
export interface TemplatesSetting {
  getTemplateFolder(): Promise<string | undefined>;
  setTemplateFolder(folder: string): Promise<void>;
}

/**
 * The templates, fileClasses and bases, as the sync engine writes them. The
 * bases are the person's once changed. The first time, Obsidian's Templates
 * is pointed at the templates when the person has not chosen a folder; a
 * person who clears it afterwards keeps it cleared.
 */
export function obsidianFiles(templates: TemplatesSetting): GeneratedFiles {
  return {
    folder: OBSIDIAN_FILES_FOLDER,
    files: vaultFiles,
    ownerOf: (path) =>
      path.startsWith(`${BASES_FOLDER}/`) ? "person" : "brain",
    written: async (first): Promise<void> => {
      if (first && (await templates.getTemplateFolder()) === undefined) {
        await templates.setTemplateFolder(TEMPLATES_FOLDER);
      }
    },
  };
}

/**
 * The templates, fileClasses and bases a vault holds for the brain's types:
 * a fileClass per type; a template and a base per type that is not a
 * singleton; a Settings base for the singletons and a Pipeline base across
 * the types with a status.
 */
export function vaultFiles(shapes: readonly VaultShape[]): VaultFile[] {
  const files: VaultFile[] = [];
  const singletons: string[] = [];
  const withStatus: { entityType: string; fields: FieldInfo[] }[] = [];
  for (const shape of shapes) {
    const { entityType, fields } = shape;
    files.push({
      path: `${OBSIDIAN_FILES_FOLDER}/fileClasses/${entityType}.md`,
      content: generateFileClass(entityType, fields),
      owner: "brain",
    });
    if (shape.singleton) {
      singletons.push(entityType);
      continue;
    }
    files.push({
      path: `${TEMPLATES_FOLDER}/${entityType}.md`,
      content: generateTemplate(entityType, fields, shape.bodyTemplate),
      owner: "brain",
    });
    const base = generateBase(entityType, fields);
    files.push({
      path: `${BASES_FOLDER}/${base.filename}`,
      content: base.content,
      owner: "person",
    });
    if (base.hasStatus) withStatus.push({ entityType, fields });
  }
  const settings = generateSettingsBase(singletons);
  if (settings !== null) {
    files.push({
      path: `${BASES_FOLDER}/Settings.base`,
      content: settings,
      owner: "person",
    });
  }
  const pipeline = generatePipelineBase(withStatus);
  if (pipeline !== null) {
    files.push({
      path: `${BASES_FOLDER}/Pipeline.base`,
      content: pipeline,
      owner: "person",
    });
  }
  return files;
}
