import type { FieldInfo } from "./shapes";

/** States the brain sets while it writes an entry, and no person does. */
const BRAIN_SET_STATES: ReadonlySet<string> = new Set(["generating", "failed"]);

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

  // Enums — a draft when the type has one, else the first value a person
  // sets: never a state only the brain sets while it writes an entry.
  if (
    field.type === "enum" &&
    field.enumValues &&
    field.enumValues.length > 0
  ) {
    const values = field.enumValues;
    if (values.includes("draft")) return "draft";
    return (
      values.find((value) => !BRAIN_SET_STATES.has(value)) ?? values[0] ?? ""
    );
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
    // An optional choice with no default is left to the type: its first
    // value is not a starting point (a note's status is set only while the
    // AI writes it, and a post without one is a draft).
    if (
      field.type === "enum" &&
      !field.required &&
      field.defaultValue === undefined
    ) {
      continue;
    }
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
