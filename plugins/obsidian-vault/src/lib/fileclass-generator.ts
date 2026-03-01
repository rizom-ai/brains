import { toYaml } from "@brains/utils";
import type { FieldInfo } from "./schema-introspector";

const typeMap: Record<FieldInfo["type"], string> = {
  string: "Input",
  number: "Number",
  boolean: "Boolean",
  date: "Date",
  enum: "Select",
  array: "Multi",
  unknown: "Input",
};

function buildField(field: FieldInfo): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name: field.name,
    id: field.name,
    type: typeMap[field.type],
  };

  if (field.type === "enum" && field.enumValues) {
    const options: Record<string, string> = {};
    field.enumValues.forEach((value, i) => {
      options[String(i)] = value;
    });
    entry["options"] = options;
  }

  return entry;
}

/**
 * Generate a Metadata Menu fileClass definition for an entity type.
 * The fileClass declares field types and enum options so Obsidian
 * shows dropdowns for Select fields instead of free-text inputs.
 *
 * Includes a "filesPaths" mapping so all files in the entity type's
 * folder are automatically associated with this fileClass.
 */
export function generateFileClass(
  entityType: string,
  fields: FieldInfo[],
): string {
  const data: Record<string, unknown> = {
    filesPaths: entityType,
    fields: fields.map(buildField),
  };

  return `---\n${toYaml(data)}---\n`;
}
