import { toDisplayName } from "@brains/utils/string-utils";
import { toYaml } from "@brains/utils/yaml";
import type { FieldInfo } from "./shapes";

const EXCLUDED_COLUMNS = new Set(["entityType"]);

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  base: "Notes",
};

/** A type's name as people read it, e.g. "FAQs" or "Site Content". */
export function displayNameFor(entityType: string): string {
  return DISPLAY_NAME_OVERRIDES[entityType] ?? toDisplayName(entityType);
}

/** Entity types stored at vault root rather than in a subfolder */
const ROOT_ENTITY_TYPES = new Set(["note"]);

/** The filter that finds a type's files: its folder, or the root for notes. */
function folderFilter(entityType: string): string {
  return ROOT_ENTITY_TYPES.has(entityType)
    ? 'file.folder == "/"'
    : `file.inFolder("${entityType}")`;
}

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
  const displayName = displayNameFor(entityType);
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

  const filter = folderFilter(entityType);

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
 * Generate a Settings.base file grouping all singleton entity types.
 * Returns null if no entries provided.
 */
export function generateSettingsBase(singletonTypes: string[]): string | null {
  if (singletonTypes.length === 0) return null;

  const folderFilters = singletonTypes.map((t) => `file.inFolder("${t}")`);

  const data: Record<string, unknown> = {
    filters: {
      and: [
        folderFilters.length === 1 ? folderFilters[0] : { or: folderFilters },
      ],
    },
    views: [
      {
        type: "table",
        name: "Settings",
        order: ["file.name", "file.folder"],
      },
    ],
  };

  return toYaml(data);
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

  const folderFilters = entries.map((e) => folderFilter(e.entityType));

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
