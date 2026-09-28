import {
  entityGroupingSchema,
  type EntityGrouping,
} from "@brains/entity-service";
import { getErrorMessage } from "@brains/utils/error";
import { isRecord } from "@brains/utils/is-record";
import {
  groupingDefinitionSchema,
  MAX_GROUPING_DEFINITIONS,
  type GroupingDefinition,
  type GroupingDefinitionsSnapshot,
} from "./grouping-source-contract";

interface DefinitionRow {
  content: string;
  contentHash: string;
  created?: string;
  updated?: string;
}
interface DefinitionSourceDependencies {
  signal?: AbortSignal;
  entityType: string;
  decode(content: string): unknown;
  getContributorTypes(): readonly string[];
  read(): Promise<DefinitionRow | null>;
  validate(groupings: readonly EntityGrouping[]): void;
  replace(
    groupings: readonly EntityGrouping[],
    options?: { reprojectExisting?: boolean },
  ): void;
}

/**
 * Refreshes only in-memory schemas. In particular this never starts a database
 * write or reprojection from a persist validator or projection transaction.
 */
export class GroupingDefinitionSource {
  private previous: DefinitionRow | null | undefined;
  private previousTypes: string | undefined;
  private snapshot: GroupingDefinitionsSnapshot = { groupings: {}, issues: [] };
  private pending: Promise<void> = Promise.resolve();
  private readonly dependencies: DefinitionSourceDependencies;

  constructor(dependencies: DefinitionSourceDependencies) {
    this.dependencies = dependencies;
  }

  public ensureCurrent(options?: { afterWrite?: boolean }): Promise<void> {
    // Each caller gets its own read; a failed predecessor must not poison the
    // queue or make an older completion overwrite a newer installed revision.
    const current = this.pending.then(() =>
      this.refresh(options?.afterWrite === true),
    );
    this.pending = current.catch(() => {
      // The caller still observes the rejection through current. Only the
      // serialization tail recovers, so the next operation can retry.
    });
    return current;
  }

  public getSnapshot(): GroupingDefinitionsSnapshot {
    return structuredClone(this.snapshot);
  }

  public validateContent(content: string): GroupingDefinitionsSnapshot {
    return this.parseStored(content);
  }

  public validateDefinitions(groupings: unknown): GroupingDefinitionsSnapshot {
    return this.selectDefinitions(groupings);
  }

  private async refresh(afterWrite: boolean): Promise<void> {
    this.dependencies.signal?.throwIfAborted();
    const row = await this.dependencies.read();
    this.dependencies.signal?.throwIfAborted();
    const contributorTypes = this.contributorTypes();
    const typeRevision = JSON.stringify(contributorTypes);
    if (
      this.previousTypes === typeRevision &&
      this.previous !== undefined &&
      row?.contentHash === this.previous?.contentHash &&
      row?.content === this.previous?.content &&
      row?.created === this.previous?.created &&
      row?.updated === this.previous?.updated
    )
      return;
    const snapshot = row
      ? this.parseStored(row.content)
      : { groupings: {}, issues: [] };
    // An observer may have missed intermediate removals. Recheck retained
    // fields too; only the saving process can use its immediate before/after
    // view to limit a normal edit to added pairs. These are existing document
    // timestamps, not a persisted readiness marker.
    this.dependencies.replace(
      declarations(snapshot.groupings, contributorTypes),
      {
        reprojectExisting: !afterWrite,
      },
    );
    // Publication follows successful replacement; a failure remains retryable.
    this.snapshot = snapshot;
    this.previous = row ? { ...row } : null;
    this.previousTypes = typeRevision;
  }

  private contributorTypes(): string[] {
    return [...new Set(this.dependencies.getContributorTypes())]
      .filter((type) => type !== this.dependencies.entityType)
      .sort();
  }

  private parseStored(content: string): GroupingDefinitionsSnapshot {
    let entries: unknown;
    try {
      entries = this.dependencies.decode(content);
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
    return this.selectDefinitions(entries);
  }

  private selectDefinitions(entries: unknown): GroupingDefinitionsSnapshot {
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
        this.dependencies.validate(
          declarations(candidate, this.contributorTypes()),
        );
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
  contributorTypes: readonly string[],
): EntityGrouping[] {
  return Object.entries(groupings).flatMap(([key, definition]) => {
    const types = contributorTypes.filter(
      (type) => !definition.excludeTypes?.includes(type),
    );
    // A definition may intentionally exclude every currently installed type.
    // Keep its source intact; it has no active schema/projection declaration.
    return types.length
      ? [{ key, field: key, label: definition.label, types }]
      : [];
  });
}
