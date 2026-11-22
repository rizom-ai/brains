import { relative } from "node:path";
import {
  CONFLICT_ENTITY_TYPE,
  recordConflictRequestSchema,
  type RecordConflictRequest,
} from "@brains/contracts";
import { isRecord } from "@brains/utils/is-record";
import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import type { PullConflict } from "../types/results";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import {
  internalFullScope,
  type ServiceEntityMirrorClient,
} from "@brains/sdk/internal/service-runtime";
import { computeContentHash } from "@brains/utils/hash";
import type { FileOperations } from "./file-operations";
import type { SyncConflicts } from "./sync-base";

/** The visibility a text's frontmatter declares, if it declares one. */
function declaredVisibility(
  text: string,
): RecordConflictRequest["targetVisibility"] | undefined {
  const { data } = readMarkdownFrontmatter(text);
  const declared = recordConflictRequestSchema.shape.targetVisibility.safeParse(
    isRecord(data) ? data["visibility"] : undefined,
  );
  return declared.success ? declared.data : undefined;
}

/** What became of an entity whose file was removed. */
export type RemovedFileOutcome = "deleted" | "kept" | "missing";

export interface SyncGuardDeps {
  entityService: Pick<
    ServiceEntityMirrorClient,
    "getEntityRaw" | "deleteEntity" | "getEntityTypeConfig" | "serializeEntity"
  >;
  fileOperations: Pick<
    FileOperations,
    | "deleteEntityFiles"
    | "writeEntity"
    | "resolveEntityFilePath"
    | "fileExists"
    | "readStoredText"
    | "parseEntityFromPath"
  >;
  syncPath: string;
  conflicts?: SyncConflicts | undefined;
  /** Import files now, as the watcher would have. */
  importPaths(paths: string[]): Promise<unknown>;
}

/**
 * The two writes directory-sync makes on a file's behalf that must not pass
 * over a newer version: exporting an entity over its file, and deleting an
 * entity whose file was removed. Both go by the version the file and the
 * entity last agreed on.
 */
export class SyncGuard {
  private readonly deps: SyncGuardDeps;
  constructor(deps: SyncGuardDeps) {
    this.deps = deps;
  }

  /**
   * Write an entity's file and record that version. A file edited since the
   * two last agreed is imported first, so its text becomes a conflict before
   * the export replaces it.
   */
  async writeEntityFile(entity: BaseEntity): Promise<void> {
    const { conflicts, fileOperations } = this.deps;
    if (!conflicts) {
      await fileOperations.writeEntity(entity);
      return;
    }
    if (await this.fileHoldsUnkeptEdit(entity, conflicts)) return;
    await fileOperations.writeEntity(entity);
    await conflicts.base.set(
      entity.entityType,
      entity.id,
      entity.contentHash,
      await this.textFileHash(entity),
    );
  }

  /** The hash of a text entity's file as it is on disk now. */
  private async textFileHash(entity: BaseEntity): Promise<string | undefined> {
    const { entityService, fileOperations } = this.deps;
    if (
      entityService.getEntityTypeConfig(entity.entityType).binaryStorage ===
      "asset"
    )
      return undefined;
    const filePath = await fileOperations.resolveEntityFilePath(entity);
    if (!(await fileOperations.fileExists(filePath))) return undefined;
    return computeContentHash(await fileOperations.readStoredText(filePath));
  }

  /**
   * Remove the files of an entity that is gone from the brain, deleted or
   * renamed, and the version recorded for it: there is no file left to
   * compare with, and the id may be given to another entity later.
   */
  async removeEntityFiles(entityType: string, id: string): Promise<void> {
    await this.deps.fileOperations.deleteEntityFiles(entityType, id);
    await this.deps.conflicts?.base.delete(entityType, id);
  }

  /**
   * Delete the entity of a removed file, unless it changed since the file
   * and the entity last agreed: then it stays and its file is written back.
   * A conflict is never deleted this way.
   */
  async deleteForRemovedFile(
    entityType: string,
    id: string,
  ): Promise<RemovedFileOutcome> {
    const { conflicts, entityService } = this.deps;
    const base =
      entityType === CONFLICT_ENTITY_TYPE
        ? undefined
        : await conflicts?.base.get(entityType, id);
    const deleted =
      entityType !== CONFLICT_ENTITY_TYPE &&
      (await entityService.deleteEntity({
        entityType,
        id,
        options: {
          persistenceOrigin: "directory-sync",
          ...(base !== undefined && { expectedContentHash: base }),
        },
      }));
    if (deleted) {
      await conflicts?.base.delete(entityType, id);
      return "deleted";
    }
    const entity = await entityService.getEntityRaw({
      entityType,
      id,
      visibilityScope: internalFullScope(
        "write back the file of an entity that outlived its removal",
      ),
      source: true,
    });
    if (!entity) {
      await conflicts?.base.delete(entityType, id);
      return "missing";
    }
    await this.deps.fileOperations.writeEntity(entity);
    await conflicts?.base.set(
      entityType,
      id,
      entity.contentHash,
      await this.textFileHash(entity),
    );
    return "kept";
  }

  /**
   * Keep the remote texts a pull did not take as conflicts on the entities
   * the brain kept. Answers the ids that need no further keeping: recorded,
   * or of a file that belongs to no entity.
   */
  async recordPullConflicts(pulled: PullConflict[]): Promise<string[]> {
    const { conflicts, entityService, fileOperations } = this.deps;
    if (!conflicts) return [];
    const settled = await Promise.all(
      pulled.map(async ({ path, text }) => {
        const target = fileOperations.parseEntityFromPath(path);
        const entity = await entityService.getEntityRaw({
          entityType: target.entityType,
          id: target.id,
          visibilityScope: internalFullScope(
            "keep a pulled text as a conflict on its entity",
          ),
          source: true,
        });
        if (!entity) return true;
        const declared = declaredVisibility(text);
        return conflicts.record({
          entityType: entity.entityType,
          entityId: entity.id,
          origin: "git",
          current: entity.contentHash,
          text,
          targetVisibility: entity.visibility,
          ...(declared !== undefined &&
            declared !== entity.visibility && { declaredVisibility: declared }),
        });
      }),
    );
    return pulled.flatMap(({ id }, index) => (settled[index] ? [id] : []));
  }

  /**
   * Whether the entity's file holds an edit that could not be kept as a
   * conflict, and so must not be overwritten. An edited file is imported
   * here; that import settles it against the base.
   */
  private async fileHoldsUnkeptEdit(
    entity: BaseEntity,
    conflicts: SyncConflicts,
  ): Promise<boolean> {
    const { entityService, fileOperations } = this.deps;
    if (entity.entityType === CONFLICT_ENTITY_TYPE) return false;
    // A binary file keeps winning or losing whole; it has no text to hold.
    if (
      entityService.getEntityTypeConfig(entity.entityType).binaryStorage ===
      "asset"
    )
      return false;
    const base = await conflicts.base.get(entity.entityType, entity.id);
    if (base === undefined || base === entity.contentHash) return false;
    const filePath = await fileOperations.resolveEntityFilePath(entity);
    if (!(await fileOperations.fileExists(filePath))) return false;
    const fileHash = computeContentHash(
      await fileOperations.readStoredText(filePath),
    );
    const lastSeen =
      (await conflicts.base.fileBytes(entity.entityType, entity.id)) ?? base;
    if (
      fileHash === lastSeen ||
      fileHash === computeContentHash(entityService.serializeEntity(entity))
    )
      return false;

    await this.deps.importPaths([relative(this.deps.syncPath, filePath)]);
    // Settled when the import recorded this version as the base. A file
    // the import set aside as unreadable is gone, and the export may write.
    return (
      (await conflicts.base.get(entity.entityType, entity.id)) !==
        entity.contentHash && (await fileOperations.fileExists(filePath))
    );
  }
}
