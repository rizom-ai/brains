import type { RecordConflictRequest } from "@brains/contracts";
import { memoryMountBases } from "../src/dav-mounts";
import type { AppendAuthAuditEventInput } from "@brains/contracts";
import {
  EntityValidationError,
  type BaseEntity,
} from "@brains/sdk/internal/entity-runtime";
import type { DavRoutesOptions } from "../src/dav-routes";
import { fakeReader } from "./fake-reader";

/** Writes for a test that makes none: every one of them fails loudly. */
export const noWrites: DavRoutesOptions["writes"] = {
  maxFileBytes: 1024,
  maxAssetBytes: 4096,
  stageAsset: async () => {
    throw new Error("No writes expected");
  },
  discardStagedAsset: async () => {
    throw new Error("No writes expected");
  },
  deserializeEntity: () => {
    throw new Error("No writes expected");
  },
  updateEntity: async () => {
    throw new Error("No writes expected");
  },
  createEntity: async () => {
    throw new Error("No writes expected");
  },
  deleteEntity: async () => {
    throw new Error("No writes expected");
  },
  permissions: {
    assertEntityActionAllowed: () => {
      throw new Error("No writes expected");
    },
  },
  recordAudit: async () => {
    throw new Error("No writes expected");
  },
};

/** What a save handed the entity service. */
export interface RecordedUpdate {
  entity: BaseEntity;
  expectedContentHash: string | undefined;
  interfaceType: string | undefined;
  actorUserId: string | undefined;
}

export interface FakeBrain {
  options: Pick<
    DavRoutesOptions,
    "reader" | "writes" | "mounts" | "recordConflict"
  >;
  /** Losing saves the drive handed over to be kept. */
  conflicts: RecordConflictRequest[];
  /** Whether anything holds a conflict; a brain without it refuses. */
  conflictsAvailable: boolean;
  entities: BaseEntity[];
  updates: RecordedUpdate[];
  creates: RecordedUpdate[];
  deletes: Array<{ entityType: string; id: string }>;
  /** Published asset bytes by reference: what the drive can read back. */
  assets: Record<string, Uint8Array>;
  /** References staged and then discarded without being published. */
  discarded: string[];
  audit: AppendAuthAuditEventInput[];
  /** Runs once, just before the next update is applied: another writer. */
  beforeNextUpdate: (() => void) | undefined;
}

function frontmatter(markdown: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .map((line) => /^([a-zA-Z]+):\s*(.*)$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? "", match[2] ?? ""]),
  );
}

/**
 * A brain's reads and writes over one list of entities. A document whose
 * frontmatter says `title: INVALID` fails validation, `title: UNPARSEABLE`
 * cannot be parsed at all, one with
 * `title: NORMALIZE` is stored in another form than it was sent, and types
 * named `locked` refuse updates; `post` has a published status.
 */
export function fakeBrain(
  entities: BaseEntity[],
  /** Registered types; those of the entities when not given. */
  types?: string[],
  assets: Record<string, Uint8Array> = {},
): FakeBrain {
  const staged = new Map<string, Uint8Array>();
  /** Staged bytes are published with the entity that references them. */
  const publish = (asset: { ref: string } | undefined): void => {
    const bytes = asset ? staged.get(asset.ref) : undefined;
    if (asset && bytes) assets[asset.ref] = bytes;
  };
  const brain: FakeBrain = {
    entities,
    updates: [],
    creates: [],
    deletes: [],
    assets,
    discarded: [],
    audit: [],
    beforeNextUpdate: undefined,
    conflicts: [],
    conflictsAvailable: true,
    options: {
      // Held by the brain, as runtime-state is: a new server finds it again.
      mounts: memoryMountBases(() => 1_800_000_000_000),
      recordConflict: async (request): Promise<boolean> => {
        if (!brain.conflictsAvailable) return false;
        brain.conflicts.push(request);
        return true;
      },
      reader: {
        ...fakeReader({ entities, assets, ...(types ? { types } : {}) }),
        getEntityTypeConfig: (type) =>
          type === "post"
            ? { publish: { publishStatuses: ["published"] } }
            : {},
      },
      writes: {
        maxFileBytes: 1024,
        maxAssetBytes: 4096,
        stageAsset: async (source) => {
          if (!(source instanceof Uint8Array)) {
            throw new Error("The drive stages whole byte arrays");
          }
          const digest = new Bun.CryptoHasher("sha256")
            .update(source)
            .digest("hex");
          const ref = `asset://sha256/${digest}` as const;
          staged.set(ref, source);
          return { ref, digest, sizeBytes: source.byteLength };
        },
        discardStagedAsset: async (asset) => {
          staged.delete(asset.ref);
          brain.discarded.push(asset.ref);
        },
        deserializeEntity: (markdown, entityType) => {
          const fields = frontmatter(markdown);
          if (fields["title"] === "UNPARSEABLE") {
            // What a YAML parser throws: no validation error class at all.
            throw new Error("unexpected end of the stream (3:1)");
          }
          if (fields["title"] === "INVALID") {
            throw new EntityValidationError(
              entityType,
              new Error("title: must not be INVALID"),
            );
          }
          const { visibility, ...metadata } = fields;
          return {
            content: markdown,
            metadata,
            ...(visibility === "public" ||
            visibility === "shared" ||
            visibility === "restricted"
              ? { visibility }
              : {}),
          };
        },
        permissions: {
          assertEntityActionAllowed: (entityType, action, context) => {
            if (entityType === "locked" || entityType === "conflict") {
              throw new Error(`To ${action} \`locked\` is not allowed.`);
            }
            if (
              action === "publish" &&
              context.userPermissionLevel !== "admin"
            ) {
              throw new Error("Publishing `post` requires admin permission.");
            }
          },
        },
        updateEntity: async (request) => {
          brain.beforeNextUpdate?.();
          brain.beforeNextUpdate = undefined;
          const index = entities.findIndex(
            (candidate) =>
              candidate.entityType === request.entity.entityType &&
              candidate.id === request.entity.id,
          );
          const stored = entities[index];
          if (!stored) throw new Error("Entity not found");
          const expected = request.options?.expectedContentHash;
          if (expected !== undefined && stored.contentHash !== expected) {
            return {
              entityId: stored.id,
              jobId: "",
              skipped: true,
              skipReason: "content-conflict" as const,
            };
          }
          // A write that changes nothing is skipped, with no conflict.
          if (
            stored.content === request.entity.content &&
            stored.visibility === request.entity.visibility
          ) {
            return { entityId: stored.id, jobId: "", skipped: true };
          }
          publish(request.stagedAsset);
          brain.updates.push({
            entity: request.entity,
            expectedContentHash: expected,
            interfaceType: request.options?.eventContext?.interfaceType,
            actorUserId:
              request.options?.eventContext?.actor?.kind === "user"
                ? request.options.eventContext.actor.userId
                : undefined,
          });
          const content = request.entity.content.includes("title: NORMALIZE")
            ? request.entity.content.replace("NORMALIZE", "Normalized")
            : request.entity.content;
          entities[index] = {
            ...request.entity,
            content,
            contentHash: `hash-of-${content.length}-${brain.updates.length}`,
            updated: "2026-11-18T09:00:00.000Z",
          };
          return { entityId: stored.id, jobId: "job-1", skipped: false };
        },
        createEntity: async (request) => {
          const created = request.entity;
          const id = created.id ?? "generated";
          // Create-if-absent sees every row, whoever may read it.
          if (
            entities.some(
              (candidate) =>
                candidate.entityType === created.entityType &&
                candidate.id === id,
            )
          ) {
            const conflict = new Error("Entity write conflict");
            conflict.name = "EntityWriteConflictError";
            throw conflict;
          }
          if (request.options?.conditionalWrite?.expectedRevision !== null) {
            throw new Error("The drive creates only if absent");
          }
          const entity: BaseEntity = {
            id,
            entityType: created.entityType,
            content: created.content,
            metadata: created.metadata,
            visibility:
              created.visibility === "shared" ||
              created.visibility === "restricted"
                ? created.visibility
                : "public",
            created: "2026-11-18T09:00:00.000Z",
            updated: "2026-11-18T09:00:00.000Z",
            contentHash: `hash-created-${id}`,
          };
          publish(request.stagedAsset);
          brain.creates.push({
            entity,
            expectedContentHash: undefined,
            interfaceType: request.options.eventContext?.interfaceType,
            actorUserId:
              request.options.eventContext?.actor?.kind === "user"
                ? request.options.eventContext.actor.userId
                : undefined,
          });
          entities.push(entity);
          return { entityId: id, jobId: "job-1", skipped: false };
        },
        deleteEntity: async (request) => {
          brain.beforeNextUpdate?.();
          brain.beforeNextUpdate = undefined;
          const index = entities.findIndex(
            (candidate) =>
              candidate.entityType === request.entityType &&
              candidate.id === request.id,
          );
          const expected = request.options?.expectedContentHash;
          if (
            index < 0 ||
            (expected !== undefined &&
              entities[index]?.contentHash !== expected)
          ) {
            return false;
          }
          entities.splice(index, 1);
          brain.deletes.push({
            entityType: request.entityType,
            id: request.id,
          });
          return true;
        },
        recordAudit: async (event) => {
          brain.audit.push(event);
        },
      },
    },
  };
  return brain;
}
