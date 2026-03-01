import { toYaml, toDisplayName } from "@brains/utils";
import type { FieldInfo } from "./schema-introspector";

const EXCLUDED_COLUMNS = new Set(["entityType"]);

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  base: "Notes",
};

/** Entity types stored at vault root rather than in a subfolder */
const ROOT_ENTITY_TYPES = new Set(["base"]);

export interface BaseGeneratorResult {
  filename: string;
  content: string;
  hasStatus: boolean;
}

function buildColumnOrder(fields: FieldInfo[]): string[] {
  const columns = ["file.name"];
  for (const field of fields) {
    if (!EXCLUDED_COLUMNS.has(field.name)) {
      columns.push(field.name);
    }
  }
  return columns;
}

function hasStatusField(fields: FieldInfo[]): boolean {
  return fields.some((f) => f.name === "status" && f.type === "enum");
}

/**
 * Generate a .base file for a single entity type.
 * Creates a table view with all schema fields as columns.
 * If the entity has a status enum, adds a second view grouped by status.
 */
export function generateBase(
  entityType: string,
  fields: FieldInfo[],
): BaseGeneratorResult {
  const displayName =
    DISPLAY_NAME_OVERRIDES[entityType] ?? toDisplayName(entityType);
  const status = hasStatusField(fields);
  const columns = buildColumnOrder(fields);

  const views: Record<string, unknown>[] = [
    {
      type: "table",
      name: `All ${displayName}`,
      order: columns,
    },
  ];

  if (status) {
    views.push({
      type: "table",
      name: "By Status",
      groupBy: { property: "status", direction: "ASC" },
      order: columns,
    });
  }

  const filter = ROOT_ENTITY_TYPES.has(entityType)
    ? 'file.folder == "/"'
    : `file.inFolder("${entityType}")`;

  const data: Record<string, unknown> = {
    filters: { and: [filter] },
    views,
  };

  return {
    filename: `${displayName}.base`,
    content: toYaml(data),
    hasStatus: status,
  };
}

/**
 * Generate a Pipeline.base file combining all entity types with status fields.
 * Shows non-published items grouped by status.
 * Returns null if no entries provided.
 */
export function generatePipelineBase(
  entries: { entityType: string; fields: FieldInfo[] }[],
): string | null {
  if (entries.length === 0) return null;

  const folderFilters = entries.map((e) => `file.inFolder("${e.entityType}")`);

  const data: Record<string, unknown> = {
    filters: {
      and: [
        folderFilters.length === 1 ? folderFilters[0] : { or: folderFilters },
        'status != "published"',
      ],
    },
    views: [
      {
        type: "table",
        name: "Pipeline",
        groupBy: { property: "status", direction: "ASC" },
        order: ["file.name", "file.folder", "status"],
      },
    ],
  };

  return toYaml(data);
}
