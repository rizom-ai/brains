/** What a store needs of an entity to tell its versions apart. */
export interface VersionedEntity {
  id: string;
  entityType: string;
  contentHash: string;
}

export interface RacingUpdateResult {
  entityId: string;
  jobId: string;
  skipped: boolean;
  skipReason?: "content-conflict";
}

/**
 * Entities another writer can change at any moment, for tests of writers
 * that read an entity and write it back. An update that names the version
 * it read is refused once that version has moved on, as the entity service
 * refuses it; one that names none overwrites whatever is there.
 */
export interface RacingStore<T extends VersionedEntity> {
  get(entityType: string, id: string): T | null;
  /** Another writer's edit: stored as a new version. */
  edit(entityType: string, id: string, change: (current: T) => T): void;
  /** Runs once, just before the next update is applied. */
  beforeNextUpdate(race: () => void): void;
  update(entity: T, expectedContentHash?: string): RacingUpdateResult;
  /** Every update that was applied, with the version it named. */
  readonly applied: Array<{ entity: T; expectedContentHash?: string }>;
}

export function createRacingStore<T extends VersionedEntity>(
  initial: T[],
): RacingStore<T> {
  const key = (entityType: string, id: string): string => `${entityType}:${id}`;
  const entities = new Map(
    initial.map((entity) => [key(entity.entityType, entity.id), entity]),
  );
  const state: { race: (() => void) | undefined; version: number } = {
    race: undefined,
    version: 0,
  };
  const nextHash = (): string => {
    state.version += 1;
    return `version-${state.version}`;
  };
  const applied: RacingStore<T>["applied"] = [];
  return {
    applied,
    get: (entityType, id) => entities.get(key(entityType, id)) ?? null,
    edit: (entityType, id, change): void => {
      const current = entities.get(key(entityType, id));
      if (!current) throw new Error(`No ${entityType} ${id} to edit`);
      entities.set(key(entityType, id), {
        ...change(current),
        contentHash: nextHash(),
      });
    },
    beforeNextUpdate: (race): void => {
      state.race = race;
    },
    update: (entity, expectedContentHash): RacingUpdateResult => {
      const race = state.race;
      state.race = undefined;
      race?.();
      const stored = entities.get(key(entity.entityType, entity.id));
      if (!stored) throw new Error(`No ${entity.entityType} ${entity.id}`);
      if (
        expectedContentHash !== undefined &&
        stored.contentHash !== expectedContentHash
      ) {
        return {
          entityId: entity.id,
          jobId: "",
          skipped: true,
          skipReason: "content-conflict",
        };
      }
      entities.set(key(entity.entityType, entity.id), {
        ...entity,
        contentHash: nextHash(),
      });
      applied.push({
        entity,
        ...(expectedContentHash !== undefined && { expectedContentHash }),
      });
      return { entityId: entity.id, jobId: "job", skipped: false };
    },
  };
}
