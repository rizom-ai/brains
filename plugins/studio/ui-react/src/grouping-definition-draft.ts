import { isRecord } from "@brains/utils/is-record";
import {
  groupingDefinitionsFrontmatterSchema,
  GROUPING_DEFINITIONS_TYPE,
  type GroupingDefinitionIssue,
} from "../../src/grouping-definitions-contract";

export interface GroupingDefinitionDraftRow {
  id: number;
  key: string;
  value: unknown;
  savedKey?: string;
}
export interface GroupingDefinitionDraft {
  rows: GroupingDefinitionDraftRow[];
  nextId: number;
  /** Keep malformed top-level source intact until an explicit reset. */
  malformed?: { value: unknown };
}
export interface GroupingDefinitionDraftResult {
  value: Record<string, unknown> | undefined;
  issues: GroupingDefinitionIssue[];
  /** Duplicate keys cannot be represented losslessly in the document map. */
  pendingChanges: boolean;
}
export function createGroupingDefinitionDraft(
  value: unknown,
  savedKeys: readonly string[] = [],
): GroupingDefinitionDraft {
  if (value !== undefined && !isRecord(value))
    return { rows: [], nextId: 0, malformed: { value } };
  const rows = Object.entries(value ?? {}).map(([key, entry], id) => ({
    id,
    key,
    value: entry,
    ...(savedKeys.includes(key) ? { savedKey: key } : {}),
  }));
  return { rows, nextId: rows.length };
}
export function addGroupingDefinition(
  draft: GroupingDefinitionDraft,
): GroupingDefinitionDraft {
  return {
    ...draft,
    rows: [
      ...draft.rows,
      {
        id: draft.nextId,
        key: "",
        value: { label: "", types: [], multiple: true },
      },
    ],
    nextId: draft.nextId + 1,
  };
}
export function replaceGroupingDefinitionRow(
  draft: GroupingDefinitionDraft,
  id: number,
  update: Partial<Pick<GroupingDefinitionDraftRow, "key" | "value">>,
): GroupingDefinitionDraft {
  return {
    ...draft,
    rows: draft.rows.map((row) => {
      if (row.id !== id) return row;
      if (
        row.savedKey !== undefined &&
        update.key !== undefined &&
        update.key !== row.savedKey
      )
        throw new Error("Saved grouping keys cannot be renamed.");
      return { ...row, ...update };
    }),
  };
}
export function removeGroupingDefinition(
  draft: GroupingDefinitionDraft,
  id: number,
): GroupingDefinitionDraft {
  return { ...draft, rows: draft.rows.filter((row) => row.id !== id) };
}
/** Validate drafts without normalizing, stripping unknown fields or collapsing duplicate keys. */
export function inspectGroupingDefinitionDraft(
  draft: GroupingDefinitionDraft,
  eligibleTypes: ReadonlySet<string>,
): GroupingDefinitionDraftResult {
  if (draft.malformed)
    return {
      value: undefined,
      issues: [
        {
          path: ["groupings"],
          message:
            "Groupings must be a mapping. Repair the source or explicitly replace it.",
        },
      ],
      pendingChanges: false,
    };
  const duplicates = draft.rows.filter((row, index) =>
    draft.rows.some((other, at) => at < index && other.key === row.key),
  );
  if (duplicates.length)
    return {
      value: undefined,
      issues: duplicates.map((row) => ({
        path: ["groupings", row.key],
        message: `The key “${row.key}” is already used. Choose a different key.`,
      })),
      pendingChanges: true,
    };
  const value = Object.fromEntries(
    draft.rows.map((row) => [row.key, row.value]),
  );
  const parsed = groupingDefinitionsFrontmatterSchema.safeParse({
    groupings: value,
  });
  const issues: GroupingDefinitionIssue[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        path: issue.path.map((part) =>
          typeof part === "symbol" ? String(part) : part,
        ),
        message: issue.message,
      }));
  for (const row of draft.rows) {
    if (!isRecord(row.value) || !Array.isArray(row.value["types"])) continue;
    for (const type of row.value["types"])
      if (
        typeof type === "string" &&
        type !== GROUPING_DEFINITIONS_TYPE &&
        !eligibleTypes.has(type)
      )
        issues.push({
          path: ["groupings", row.key, "types"],
          message: `Unavailable contributor type: ${type}. Choose an available type.`,
        });
  }
  return { value, issues, pendingChanges: false };
}
