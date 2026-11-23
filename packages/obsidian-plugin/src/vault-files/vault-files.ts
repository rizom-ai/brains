import {
  generateBase,
  generatePipelineBase,
  generateSettingsBase,
} from "./base-generator";
import { generateFileClass } from "./fileclass-generator";
import type { FieldInfo, VaultShape } from "./shapes";
import { generateTemplate } from "./template-generator";

import { OBSIDIAN_FILES_FOLDER } from "../engine/paths";

export const TEMPLATES_FOLDER: string = `${OBSIDIAN_FILES_FOLDER}/templates`;

export interface VaultFile {
  path: string;
  content: string;
  /**
   * The brain's file is kept as the brain writes it; the person's is written
   * once, when missing, and is theirs to change from then on.
   */
  owner: "brain" | "person";
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
      path: `${OBSIDIAN_FILES_FOLDER}/bases/${base.filename}`,
      content: base.content,
      owner: "person",
    });
    if (base.hasStatus) withStatus.push({ entityType, fields });
  }
  const settings = generateSettingsBase(singletons);
  if (settings !== null) {
    files.push({
      path: `${OBSIDIAN_FILES_FOLDER}/bases/Settings.base`,
      content: settings,
      owner: "person",
    });
  }
  const pipeline = generatePipelineBase(withStatus);
  if (pipeline !== null) {
    files.push({
      path: `${OBSIDIAN_FILES_FOLDER}/bases/Pipeline.base`,
      content: pipeline,
      owner: "person",
    });
  }
  return files;
}
