import type { RecordConflictRequest } from "@brains/contracts";
import type { ClassRuntimeState } from "@brains/sdk/internal/service-runtime";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";

/**
 * The version a file and its entity last agreed on, per entity: the content
 * hash recorded whenever the file was imported or the entity exported. It is
 * what tells an edited file from a stale one. A file that differs from its
 * base was edited; an entity that differs from it was too.
 *
 * The hash is of the entity's stored form, which the import computes for a
 * file as well, so a file that differs only in bytes (CRLF from a checkout,
 * a missing final newline) has the hash of its base and is no edit.
 */
export interface SyncBaseStore {
  get(entityType: string, id: string): Promise<string | undefined>;
  /**
   * The hash of the file's bytes when that version was recorded, where
   * directory-sync knew them: what tells an untouched file from one that
   * may have been edited, before it is read as its type reads it.
   */
  fileBytes(entityType: string, id: string): Promise<string | undefined>;
  set(
    entityType: string,
    id: string,
    hash: string,
    fileBytes?: string,
  ): Promise<void>;
  delete(entityType: string, id: string): Promise<void>;
}

/** What directory-sync needs to keep an edit that lost instead of dropping it. */
export interface SyncConflicts {
  base: SyncBaseStore;
  /**
   * Hand a losing edit to whoever keeps conflicts. False when nobody holds
   * it now: the caller then leaves the file, the edit's only copy, alone.
   */
  record(request: RecordConflictRequest): Promise<boolean>;
}

export type BaseVerdict =
  /** The file was edited over an entity that did not change, or no base is recorded. */
  | "import"
  /** The entity changed and the file did not: the file is stale, not an edit. */
  | "stale-file"
  /** Both changed since they last agreed. */
  | "conflict";

/** What a file that differs from its entity is, given the version they last agreed on. */
export function compareWithBase(versions: {
  base: string | undefined;
  fileHash: string;
  entityHash: string;
}): BaseVerdict {
  const { base, fileHash, entityHash } = versions;
  if (base === undefined || entityHash === base) return "import";
  return fileHash === base ? "stale-file" : "conflict";
}

const NAMESPACE = "directory-sync.base";
const MAX_KEY = 512;
const baseSchema: z.ZodObject<{
  hash: z.ZodString;
  fileBytes: z.ZodOptional<z.ZodString>;
}> = z.object({
  hash: z.string().min(1),
  fileBytes: z.string().min(1).optional(),
});

function keyOf(entityType: string, id: string): string {
  const key = `${entityType}:${id}`;
  return key.length <= MAX_KEY ? key : `sha256:${computeContentHash(key)}`;
}

/**
 * Bases in runtime-state, which every process of the brain shares: imports
 * run on the worker and exports on the web process.
 */
export function runtimeStateSyncBase(
  runtimeState: ClassRuntimeState,
): SyncBaseStore {
  const store = runtimeState.scoped({
    namespace: NAMESPACE,
    schema: baseSchema,
  });
  return {
    get: async (entityType, id) =>
      (await store.get(keyOf(entityType, id)))?.hash,
    fileBytes: async (entityType, id) =>
      (await store.get(keyOf(entityType, id)))?.fileBytes,
    set: async (entityType, id, hash, fileBytes): Promise<void> => {
      await store.set(keyOf(entityType, id), {
        hash,
        ...(fileBytes !== undefined && { fileBytes }),
      });
    },
    delete: async (entityType, id): Promise<void> => {
      await store.delete(keyOf(entityType, id));
    },
  };
}

/** Bases held in memory, for a directory-sync run on its own. */
export function memorySyncBase(): SyncBaseStore {
  const bases = new Map<string, { hash: string; fileBytes?: string }>();
  return {
    get: async (entityType, id) => bases.get(keyOf(entityType, id))?.hash,
    fileBytes: async (entityType, id) =>
      bases.get(keyOf(entityType, id))?.fileBytes,
    set: async (entityType, id, hash, fileBytes): Promise<void> => {
      bases.set(keyOf(entityType, id), {
        hash,
        ...(fileBytes !== undefined && { fileBytes }),
      });
    },
    delete: async (entityType, id): Promise<void> => {
      bases.delete(keyOf(entityType, id));
    },
  };
}
