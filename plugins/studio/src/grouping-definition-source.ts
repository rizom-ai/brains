import { entityGroupingSchema, type EntityGrouping } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { isRecord } from "@brains/utils/is-record";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import {
  groupingDefinitionSchema,
  MAX_GROUPING_DEFINITIONS,
  type GroupingDefinition,
  type GroupingDefinitionsSnapshot,
} from "./grouping-definitions-contract";

interface DefinitionRow {
  content: string;
  contentHash: string;
}
interface DefinitionSourceDependencies {
  read(): Promise<DefinitionRow | null>;
  validate(groupings: readonly EntityGrouping[]): void;
  replace(groupings: readonly EntityGrouping[]): void;
}

/**
 * Refreshes only in-memory schemas. In particular this never starts a database
 * write or reprojection from a persist validator or projection transaction.
 */
export class GroupingDefinitionSource {
  private previous: DefinitionRow | null | undefined;
  private snapshot: GroupingDefinitionsSnapshot = { groupings: {}, issues: [] };
  private pending: Promise<void> = Promise.resolve();
  private readonly dependencies: DefinitionSourceDependencies;

  constructor(dependencies: DefinitionSourceDependencies) {
    this.dependencies = dependencies;
  }

  public ensureCurrent(): Promise<void> {
    // Each caller gets its own read; a failed predecessor must not poison the
    // queue or make an older completion overwrite a newer installed revision.
    const current = this.pending.then(() => this.refresh());
    this.pending = current.catch(() => {
      // The caller still observes the rejection through current. Only the
      // serialization tail recovers, so the next operation can retry.
    });
    return current;
  }

  public getSnapshot(): GroupingDefinitionsSnapshot {
    return structuredClone(this.snapshot);
  }

  public validateDefinitions(
    groupings: Record<string, GroupingDefinition>,
  ): GroupingDefinitionsSnapshot {
    return this.selectDefinitions(groupings);
  }

  private async refresh(): Promise<void> {
    const row = await this.dependencies.read();
    if (
      this.previous !== undefined &&
      row?.contentHash === this.previous?.contentHash &&
      row?.content === this.previous?.content
    )
      return;
    const snapshot = row
      ? this.parseStored(row.content)
      : { groupings: {}, issues: [] };
    this.dependencies.replace(declarations(snapshot.groupings));
    // Publication follows successful replacement; a failure remains retryable.
    this.snapshot = snapshot;
    this.previous = row ? { ...row } : null;
  }

  private parseStored(content: string): GroupingDefinitionsSnapshot {
    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = parseMarkdown(content, { cache: false }).frontmatter;
    } catch {
      // Invalid YAML must remain repairable; only malformed content fails open,
      // never a failed database read or failed registry replacement.
      return {
        groupings: {},
        issues: [
          {
            path: ["groupings"],
            message:
              "Cannot parse grouping definitions. Repair the source Markdown.",
          },
        ],
      };
    }
    const entries =
      frontmatter["groupings"] === undefined ? {} : frontmatter["groupings"];
    if (!isRecord(entries))
      return {
        groupings: {},
        issues: [
          {
            path: ["groupings"],
            message: "Groupings must be a mapping of keys to definitions.",
          },
        ],
      };
    return this.selectDefinitions(entries);
  }

  private selectDefinitions(
    entries: Record<string, unknown>,
  ): GroupingDefinitionsSnapshot {
    const snapshot: GroupingDefinitionsSnapshot = { groupings: {}, issues: [] };
    for (const [key, value] of Object.entries(entries)) {
      const parsedKey = entityGroupingSchema.shape.key.safeParse(key);
      const parsed = groupingDefinitionSchema.safeParse(value);
      if (!parsedKey.success || !parsed.success) {
        const issues = [
          ...(!parsedKey.success ? parsedKey.error.issues : []),
          ...(!parsed.success ? parsed.error.issues : []),
        ];
        snapshot.issues.push(
          ...issues.map((issue) => ({
            path: [
              "groupings",
              key,
              ...issue.path.map((part) =>
                typeof part === "symbol" ? String(part) : part,
              ),
            ],
            message: issue.message,
          })),
        );
        continue;
      }
      if (Object.keys(snapshot.groupings).length >= MAX_GROUPING_DEFINITIONS) {
        snapshot.issues.push({
          path: ["groupings", key],
          message: `Define at most ${MAX_GROUPING_DEFINITIONS} groupings.`,
        });
        continue;
      }
      const candidate = { ...snapshot.groupings, [key]: parsed.data };
      try {
        this.dependencies.validate(declarations(candidate));
      } catch (error) {
        snapshot.issues.push({
          path: ["groupings", key],
          message: getErrorMessage(error),
        });
        continue;
      }
      snapshot.groupings = candidate;
    }
    return snapshot;
  }
}

function declarations(
  groupings: Record<string, GroupingDefinition>,
): EntityGrouping[] {
  return Object.entries(groupings).map(([key, definition]) => ({
    key,
    field: key,
    label: definition.label,
    types: [...definition.types],
  }));
}
