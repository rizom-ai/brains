import { and, eq, inArray, sql } from "drizzle-orm";
import { computeContentHash } from "@brains/utils/hash";
import type { EntityDB } from "./db";
import type { EntityExportStore } from "./entity-export-store";
import type { EntityMutationAdmission } from "./mutation-admission";
import type { ProjectionWriteIntent } from "./projection-contracts";
import { entities } from "./schema/entities";
import {
  projectionEntityOwners,
  type ProjectionChangedTarget,
} from "./schema/projection-state";
import type { SqliteAssetRepository } from "./sqlite-asset-repository";

type EntityTransaction = Parameters<Parameters<EntityDB["transaction"]>[0]>[0];

// Leave room for the type predicate even with SQLite's conservative
// 999-variable limit, rather than relying on a build-specific higher limit.
const WRITE_TARGET_QUERY_BATCH_SIZE = 500;

export interface ProjectionEntityStoragePolicy {
  assetRepository: SqliteAssetRepository;
  isAssetBacked(entityType: string): boolean;
  isFullTextSearchable(entityType: string): boolean;
}

export interface ProjectionWriteIntentOwner {
  ruleId: string;
  ruleVersion: string;
  inputFingerprint: string;
}

export interface ProjectionWriteIntentApplierOptions {
  entityExportStore: EntityExportStore;
  mutationAdmission?: EntityMutationAdmission;
  storagePolicy?: ProjectionEntityStoragePolicy;
}

export function canonicalProjectionJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalProjectionJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${canonicalProjectionJson(item)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

interface ExistingProjectionTarget {
  readonly content: string;
  readonly contentHash: string;
  readonly metadata: Record<string, unknown>;
  readonly visibility: "public" | "shared" | "restricted";
}

function projectionTargetKey(entityType: string, entityId: string): string {
  return JSON.stringify([entityType, entityId]);
}

export class ProjectionWriteIntentApplier {
  private readonly entityExportStore: EntityExportStore;
  private readonly mutationAdmission: EntityMutationAdmission | undefined;
  private readonly storagePolicy: ProjectionEntityStoragePolicy | undefined;

  public constructor(options: ProjectionWriteIntentApplierOptions) {
    this.entityExportStore = options.entityExportStore;
    this.mutationAdmission = options.mutationAdmission;
    this.storagePolicy = options.storagePolicy;
  }

  /** Prefetch targets in bounded batches, retaining sequential intent semantics. */
  public async applyAll(
    transaction: EntityTransaction,
    writeIntents: readonly ProjectionWriteIntent[],
    completedAt: number,
    key: ProjectionWriteIntentOwner,
  ): Promise<ProjectionChangedTarget[]> {
    const existingTargets = await this.prefetchWriteTargets(
      transaction,
      writeIntents,
    );
    const changedTargets: ProjectionChangedTarget[] = [];
    for (const intent of writeIntents) {
      const entityType =
        intent.operation === "upsert"
          ? intent.entity.entityType
          : intent.entityType;
      const entityId =
        intent.operation === "upsert" ? intent.entity.id : intent.id;
      const targetKey = projectionTargetKey(entityType, entityId);
      const target = await this.apply(
        transaction,
        intent,
        completedAt,
        key,
        existingTargets.get(targetKey),
      );
      if (target) changedTargets.push(target);
      if (intent.operation === "delete") {
        existingTargets.delete(targetKey);
      } else {
        existingTargets.set(targetKey, {
          content: intent.entity.content,
          contentHash: computeContentHash(intent.entity.content),
          metadata: intent.entity.metadata,
          visibility: intent.entity.visibility,
        });
      }
    }

    return changedTargets;
  }

  private async prefetchWriteTargets(
    transaction: EntityTransaction,
    intents: readonly ProjectionWriteIntent[],
  ): Promise<Map<string, ExistingProjectionTarget>> {
    const first = intents[0];
    if (!first) return new Map();
    const entityType =
      first.operation === "upsert" ? first.entity.entityType : first.entityType;
    const ids = [
      ...new Set(
        intents.map((intent) =>
          intent.operation === "upsert" ? intent.entity.id : intent.id,
        ),
      ),
    ];
    const targets = new Map<string, ExistingProjectionTarget>();
    for (
      let offset = 0;
      offset < ids.length;
      offset += WRITE_TARGET_QUERY_BATCH_SIZE
    ) {
      const rows = await transaction
        .select({
          id: entities.id,
          entityType: entities.entityType,
          content: entities.content,
          contentHash: entities.contentHash,
          metadata: entities.metadata,
          visibility: entities.visibility,
        })
        .from(entities)
        .where(
          and(
            eq(entities.entityType, entityType),
            inArray(
              entities.id,
              ids.slice(offset, offset + WRITE_TARGET_QUERY_BATCH_SIZE),
            ),
          ),
        );
      for (const { id, entityType: rowType, ...entity } of rows) {
        targets.set(projectionTargetKey(rowType, id), entity);
      }
    }
    return targets;
  }

  private async apply(
    transaction: EntityTransaction,
    intent: ProjectionWriteIntent,
    changedAt: number,
    owner: ProjectionWriteIntentOwner,
    existing: ExistingProjectionTarget | undefined,
  ): Promise<ProjectionChangedTarget | null> {
    const entityType =
      intent.operation === "upsert"
        ? intent.entity.entityType
        : intent.entityType;
    const entityId =
      intent.operation === "upsert" ? intent.entity.id : intent.id;

    if (intent.operation === "delete") {
      await transaction
        .delete(projectionEntityOwners)
        .where(
          and(
            eq(projectionEntityOwners.entityType, entityType),
            eq(projectionEntityOwners.entityId, entityId),
          ),
        );
      if (!existing) return null;
      await this.mutationAdmission?.assertMutationAdmission({
        operation: "delete",
        entityType,
        entityId,
      });
      await transaction
        .delete(entities)
        .where(
          and(eq(entities.entityType, entityType), eq(entities.id, entityId)),
        );
      await transaction.run(
        sql`DELETE FROM entity_fts WHERE entity_id = ${entityId} AND entity_type = ${entityType}`,
      );
      await this.entityExportStore.record(transaction, {
        entityType,
        entityId,
        operation: "delete",
        markedAt: changedAt,
      });
      return { entityType, entityId, operation: "delete" };
    }

    const contentHash = computeContentHash(intent.entity.content);
    await transaction
      .insert(projectionEntityOwners)
      .values({
        entityType,
        entityId,
        ruleId: owner.ruleId,
        ruleVersion: owner.ruleVersion,
        inputFingerprint: owner.inputFingerprint,
        claimedAt: changedAt,
      })
      .onConflictDoUpdate({
        target: [
          projectionEntityOwners.entityType,
          projectionEntityOwners.entityId,
        ],
        set: {
          ruleId: owner.ruleId,
          ruleVersion: owner.ruleVersion,
          inputFingerprint: owner.inputFingerprint,
          claimedAt: changedAt,
        },
      });
    if (this.storagePolicy?.isAssetBacked(entityType)) {
      await this.storagePolicy.assetRepository.bindEntityContent(
        transaction,
        intent.entity.content,
      );
    }

    if (
      existing?.contentHash === contentHash &&
      existing.content === intent.entity.content &&
      existing.visibility === intent.entity.visibility &&
      canonicalProjectionJson(existing.metadata) ===
        canonicalProjectionJson(intent.entity.metadata)
    ) {
      if (this.storagePolicy?.isFullTextSearchable(entityType) === false) {
        await transaction.run(
          sql`DELETE FROM entity_fts WHERE entity_id = ${entityId} AND entity_type = ${entityType}`,
        );
      }
      return null;
    }

    await this.mutationAdmission?.assertMutationAdmission({
      operation: existing ? "update" : "create",
      entityType,
      entityId,
    });

    if (existing) {
      await transaction
        .update(entities)
        .set({
          content: intent.entity.content,
          contentHash,
          metadata: intent.entity.metadata,
          visibility: intent.entity.visibility,
          updated: changedAt,
        })
        .where(
          and(eq(entities.entityType, entityType), eq(entities.id, entityId)),
        );
    } else {
      await transaction.insert(entities).values({
        id: entityId,
        entityType,
        content: intent.entity.content,
        contentHash,
        metadata: intent.entity.metadata,
        visibility: intent.entity.visibility,
        created: changedAt,
        updated: changedAt,
      });
    }

    await transaction.run(
      sql`DELETE FROM entity_fts WHERE entity_id = ${entityId} AND entity_type = ${entityType}`,
    );
    if (this.storagePolicy?.isFullTextSearchable(entityType) !== false) {
      await transaction.run(
        sql`INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (${entityId}, ${entityType}, ${intent.entity.content})`,
      );
    }
    await this.entityExportStore.record(transaction, {
      entityType,
      entityId,
      operation: "upsert",
      markedAt: changedAt,
    });
    return {
      entityType,
      entityId,
      operation: "upsert",
      contentHash,
    };
  }
}
