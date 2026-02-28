import type { FieldInfo } from "./schema-introspector";

/**
 * Get the default YAML value for a field in an Obsidian template.
 */
function getDefaultValue(field: FieldInfo, entityType: string): string {
  // entityType literal — use the actual entity type name
  if (field.name === "entityType") {
    return String(field.defaultValue ?? entityType);
  }

  // title — use Obsidian template variable
  if (field.name === "title") {
    return '"{{title}}"';
  }

  // created/updated dates — use Obsidian date variable
  if (
    field.type === "date" &&
    (field.name === "created" || field.name === "updated")
  ) {
    return '"{{date}}"';
  }

  // Use explicit default if present
  if (field.defaultValue !== undefined) {
    if (Array.isArray(field.defaultValue)) return "[]";
    if (typeof field.defaultValue === "boolean")
      return String(field.defaultValue);
    if (typeof field.defaultValue === "number")
      return String(field.defaultValue);
    return String(field.defaultValue);
  }

  // Enums — use first value
  if (
    field.type === "enum" &&
    field.enumValues &&
    field.enumValues.length > 0
  ) {
    return field.enumValues[0] ?? "";
  }

  // Type-based defaults
  switch (field.type) {
    case "string":
      return '""';
    case "number":
      return "";
    case "boolean":
      return "false";
    case "array":
      return "[]";
    case "date":
      return '""';
    default:
      return '""';
  }
}

/**
 * Generate an Obsidian template markdown file for an entity type.
 * The template has YAML frontmatter with sensible defaults and
 * Obsidian template variables ({{title}}, {{date}}).
 *
 * When a bodyTemplate is provided (from the adapter's formatter),
 * it is used as the body content. Otherwise the body is left empty.
 */
export function generateTemplate(
  entityType: string,
  fields: FieldInfo[],
  bodyTemplate = "",
): string {
  const lines: string[] = ["---"];

  for (const field of fields) {
    const value = getDefaultValue(field, entityType);
    if (value === "") {
      lines.push(`${field.name}:`);
    } else {
      lines.push(`${field.name}: ${value}`);
    }
  }

  lines.push("---");
  lines.push("");

  if (bodyTemplate) {
    lines.push(bodyTemplate);
  } else {
    lines.push("<!-- Write your content here -->");
    lines.push("");
  }

  return lines.join("\n");
}
