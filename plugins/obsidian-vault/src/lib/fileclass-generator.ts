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

function formatField(field: FieldInfo): string {
  const lines: string[] = [];
  lines.push(`  - name: ${field.name}`);
  lines.push(`    type: ${typeMap[field.type]}`);

  if (field.type === "enum" && field.enumValues) {
    lines.push("    options:");
    for (let i = 0; i < field.enumValues.length; i++) {
      lines.push(`      "${i}": ${field.enumValues[i]}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a Metadata Menu fileClass definition for an entity type.
 * The fileClass declares field types and enum options so Obsidian
 * shows dropdowns for Select fields instead of free-text inputs.
 */
export function generateFileClass(fields: FieldInfo[]): string {
  const lines: string[] = ["---"];

  lines.push("fields:");
  for (const field of fields) {
    lines.push(formatField(field));
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}
