import type { RecordConflictRequest } from "@brains/contracts";
import { computeContentHash } from "@brains/utils/hash";
import type { MountBase } from "./dav-mounts";
import type {
  AppendAuthAuditEventInput,
  AuthAppPasswordGrant,
} from "@brains/contracts";
import {
  canWriteVisibility,
  getPublishBoundaryState,
  isEntityValidationError,
  type BaseEntity,
} from "@brains/sdk/internal/entity-runtime";
import type {
  ContentVisibility,
  ServiceEntityReads,
  ServiceEntityWrites,
  ServicePermissions,
} from "@brains/sdk/internal/service-runtime";
import {
  IMAGE_EXTENSIONS,
  getExtensionForFormat,
} from "@brains/entity-placement";
import { createHash } from "node:crypto";
import {
  bytesImageReader,
  describeImage,
  isLegacyPendingImageBytes,
} from "@brains/image";
import { getErrorMessage } from "@brains/utils/error";
import { posix } from "path";
import {
  storesBytes,
  type DavFile,
  type DavReader,
  type DavTree,
} from "./dav-tree";

/** What the drive needs to change an entity. */
export interface DavWrites {
  /** The largest markdown file a client may send. */
  maxFileBytes: number;
  /** The largest image a client may send. */
  maxAssetBytes: number;
  stageAsset: ServiceEntityWrites["stageAsset"];
  discardStagedAsset: ServiceEntityWrites["discardStagedAsset"];
  deserializeEntity: ServiceEntityReads["deserializeEntity"];
  createEntity: ServiceEntityWrites["createEntity"];
  updateEntity: ServiceEntityWrites["updateEntity"];
  deleteEntity: ServiceEntityWrites["deleteEntity"];
  permissions: ServicePermissions;
  recordAudit(event: AppendAuthAuditEventInput): Promise<void>;
}

export type WriteOutcome =
  | {
      status: 201 | 204;
      etag?: string | undefined;
      /** The conflict that keeps a save that lost to a newer version. */
      conflictId?: string | undefined;
    }
  | { status: 403 | 404 | 409 | 412 | 413 | 422; message: string };

/** What the mount making a request last held of the file it names. */
export interface MountView {
  base(): Promise<MountBase | undefined>;
  held(hash: string): Promise<void>;
  conflictKept(edit: string, conflictId?: string): Promise<void>;
  forget(): Promise<void>;
}

export interface WriteDeps {
  tree: DavTree;
  reader: DavReader;
  writes: DavWrites;
  mount: MountView;
  /**
   * Keep a losing save as a conflict: the id of the conflict that keeps it,
   * or undefined when nothing holds one now.
   */
  recordConflict(request: RecordConflictRequest): Promise<string | undefined>;
  /** Whether a folder is there for this person: real, or one they made. */
  folderExists(segments: string[]): Promise<boolean>;
}

export interface SaveRequest {
  segments: string[];
  bytes: Uint8Array;
  /** The `If-Match` header, when the client named the version it edited. */
  ifMatch: string | null;
  /** True for `If-None-Match: *`: save only if no file is there yet. */
  onlyIfAbsent?: boolean;
  grant: AuthAppPasswordGrant;
}

type Operation = "create" | "update" | "delete";
interface Located {
  entity: BaseEntity;
  file: DavFile;
}

const IMAGE_TYPE = "image";
const INTERFACE_TYPE = "webdav";

/**
 * Save a file a client sent as the entity its path names, as Studio saves an
 * edit: the type's adapter validates the document, the entity action policy
 * and the visibility policy decide whether this person may make the change,
 * and the write goes through only over the version it was based on. A path
 * with no entity yet creates one, only if still absent.
 */
export async function saveEntityFile(
  deps: WriteDeps,
  request: SaveRequest,
): Promise<WriteOutcome> {
  const extension = posix
    .extname(request.segments[request.segments.length - 1] ?? "")
    .toLowerCase();
  if (IMAGE_EXTENSIONS.includes(extension)) {
    return saveImageFile(deps, request, extension);
  }
  if (extension !== ".md") {
    return (await parentExists(deps, request))
      ? forbidden("The drive cannot take documents")
      : noFolder();
  }
  if (request.bytes.byteLength > deps.writes.maxFileBytes) return tooLarge();
  const located = await deps.tree.entityAt(request.segments);
  // An image or document is stored by its bytes, never as text: a data URL
  // written here would skip the checks its bytes get, the old pending
  // placeholder's among them.
  const entityType =
    located?.entity.entityType ??
    deps.tree.placementAt(request.segments, extension)?.entityType;
  if (entityType !== undefined && storesBytes(entityType)) {
    return forbidden(
      entityType === IMAGE_TYPE
        ? "An image is stored as its image file"
        : "The drive cannot take documents",
    );
  }
  return located
    ? updateEntityFile(deps, request, located)
    : createEntityFile(deps, request);
}

async function updateEntityFile(
  deps: WriteDeps,
  request: SaveRequest,
  { entity: existing, file }: Located,
): Promise<WriteOutcome> {
  const { writes } = deps;
  if (request.onlyIfAbsent) return taken();
  if (!matches(request.ifMatch, file.etag)) return stale();

  const document = readDocument(writes, request.bytes, existing.entityType);
  if ("status" in document) return document;
  // An edit the type reads to what is already stored changes nothing,
  // whatever version it was based on.
  if (readsAsStored(writes, document.parsed, existing)) {
    await deps.mount.held(existing.contentHash);
    return {
      status: 204,
      etag: await etagIfStoredAsSent(deps, request, document.text),
    };
  }

  const { visibility: _policy, ...metadata } =
    document.parsed.metadata ?? existing.metadata;
  const entity: BaseEntity = {
    ...existing,
    ...document.parsed,
    id: existing.id,
    entityType: existing.entityType,
    content: document.text,
    metadata,
    // A file that names no visibility carries no opinion about it.
    visibility: document.parsed.visibility ?? existing.visibility,
  };

  const crossesIntoPublished =
    getPublishBoundaryState(
      existing.entityType,
      existing.metadata["status"],
      entity.metadata["status"],
      deps.reader,
    ) !== "non-publish";
  const refused = await refusal(deps, request.grant, "update", entity, [
    crossesIntoPublished ? "publish" : "update",
  ]);
  if (refused) return refused;

  // A save that names no version is based on the one this mount last held.
  // Over a newer one it loses, and is kept instead of dropped: a client
  // that sent no version has nowhere to show a refusal, and would retry.
  if (request.ifMatch === null) {
    const base = await deps.mount.base();
    if (base !== undefined && base.hash !== existing.contentHash) {
      return keepAsConflict(deps, request, {
        existing,
        base,
        text: document.text,
        declared: document.parsed.visibility,
      });
    }
  }

  const result = await attemptAsync(() =>
    writes.updateEntity({
      entity,
      options: {
        // Without `If-Match` the last write wins, but only over the version
        // read above: a change made meanwhile is never silently replaced.
        expectedContentHash: existing.contentHash,
        eventContext: eventContext(request.grant),
      },
    }),
  );
  if (!result.ok) return invalidOrThrow(result.error);
  // A write the store skips because nothing changed is still a save; only a
  // skip over a version that moved on is a conflict.
  if (result.value.skipReason === "content-conflict") return stale();
  if (!result.value.skipped) {
    await audit(writes, request.grant, "update", "allowed", entity);
  }
  const saved = await deps.tree.entityAt(request.segments);
  if (saved) await deps.mount.held(saved.entity.contentHash);
  return {
    status: 204,
    etag: saved?.entity.content === document.text ? saved.file.etag : undefined,
  };
}

/** Whether a document reads to the entity that is already stored. */
function readsAsStored(
  writes: DavWrites,
  parsed: Partial<BaseEntity>,
  existing: BaseEntity,
): boolean {
  const stored = attempt(() =>
    writes.deserializeEntity(existing.content, existing.entityType),
  );
  return (
    stored.ok &&
    (parsed.visibility ?? existing.visibility) === existing.visibility &&
    Bun.deepEquals(parsed, stored.value)
  );
}

/**
 * Hand a save that lost to whoever keeps conflicts, and answer it as saved.
 * The same losing save again is answered the same way and kept once, also
 * after its conflict was resolved, until the mount reads the file again.
 */
async function keepAsConflict(
  deps: WriteDeps,
  request: SaveRequest,
  lost: {
    existing: BaseEntity;
    base: MountBase;
    text: string;
    declared: ContentVisibility | undefined;
  },
): Promise<WriteOutcome> {
  const { existing, base, text, declared } = lost;
  const edit = computeContentHash(text);
  if (base.conflictEdit === edit) {
    return { status: 204, conflictId: base.conflictId };
  }
  const conflictId = await deps.recordConflict({
    entityType: existing.entityType,
    entityId: existing.id,
    origin: "drive",
    actor: request.grant.principal.userId,
    base: base.hash,
    current: existing.contentHash,
    text,
    targetVisibility: existing.visibility,
    ...(declared !== undefined &&
      declared !== existing.visibility && { declaredVisibility: declared }),
  });
  // Nothing holds a conflict: refusing is the only way not to lose the edit.
  if (conflictId === undefined) return stale();
  await deps.mount.conflictKept(edit, conflictId);
  return { status: 204, conflictId };
}

async function createEntityFile(
  deps: WriteDeps,
  request: SaveRequest,
): Promise<WriteOutcome> {
  const { writes, tree } = deps;
  const { segments } = request;
  if (!(await parentExists(deps, request))) return noFolder();
  const placement = tree.placementAt(segments, ".md");
  if (!placement) return forbidden("No entry can be stored at this path");

  const document = readDocument(writes, request.bytes, placement.entityType);
  if ("status" in document) return document;

  const { visibility: _policy, ...metadata } = document.parsed.metadata ?? {};
  const visibility: ContentVisibility = document.parsed.visibility ?? "public";
  const entity = {
    ...document.parsed,
    id: placement.id,
    entityType: placement.entityType,
    content: document.text,
    metadata,
    visibility,
  };

  const startsPublished =
    getPublishBoundaryState(
      placement.entityType,
      undefined,
      metadata["status"],
      deps.reader,
    ) !== "non-publish";
  const refused = await refusal(
    deps,
    request.grant,
    "create",
    entity,
    startsPublished ? ["create", "publish"] : ["create"],
  );
  if (refused) return refused;

  const result = await attemptAsync(() =>
    writes.createEntity({
      entity,
      options: {
        // Only if still absent: an id another entity holds, visible to this
        // person or not, is never overwritten by a create.
        conditionalWrite: { expectedRevision: null },
        eventContext: eventContext(request.grant),
      },
    }),
  );
  if (!result.ok) return createFailure(result.error);
  await audit(writes, request.grant, "create", "allowed", entity);
  return {
    status: 201,
    etag: await etagIfStoredAsSent(deps, request, document.text),
  };
}

/**
 * Save an image file as the image entity its name is, the way a file dropped
 * into `brain-data/image/` is imported: the bytes say what the image is, they
 * are staged as an asset, and the entity that references them is written in
 * the same step. Nothing is staged until the save is known to be allowed.
 */
async function saveImageFile(
  deps: WriteDeps,
  request: SaveRequest,
  extension: string,
): Promise<WriteOutcome> {
  const { writes, tree } = deps;
  const { segments, bytes, grant } = request;
  const located = await tree.entityAt(segments);
  if (!located && !(await parentExists(deps, request))) return noFolder();
  const placement = located
    ? { entityType: located.entity.entityType, id: located.entity.id }
    : tree.placementAt(segments, extension);
  if (placement?.entityType !== IMAGE_TYPE) {
    return forbidden("An image can only be stored in the image folder");
  }
  if (bytes.byteLength > writes.maxAssetBytes) return tooLarge();
  if (located && request.onlyIfAbsent) return taken();
  if (located && !matches(request.ifMatch, located.file.etag)) return stale();

  const described = await describeImage(bytesImageReader(bytes));
  if (!described) {
    return {
      status: 422,
      message: "The file is not a PNG, JPEG, GIF or WebP image",
    };
  }
  // The extension is part of the entity's place: bytes of another format
  // would be stored under another name than the one just written.
  const stored = getExtensionForFormat(described.format);
  if (stored !== extension) {
    return {
      status: 422,
      message: `These bytes are stored as ${stored}; save the image under that extension`,
    };
  }
  // A copy of a file an earlier export mirrored for an image still awaiting
  // its bytes holds the placeholder it once carried, never its bytes.
  const status = located?.entity.metadata["status"];
  if (
    typeof status === "string" &&
    isLegacyPendingImageBytes(
      createHash("sha256").update(bytes).digest("hex"),
      status,
    )
  ) {
    return {
      status: 422,
      message:
        "These bytes are the old pending placeholder, not this image's bytes",
    };
  }

  const operation = located ? "update" : "create";
  const target = {
    id: placement.id,
    entityType: IMAGE_TYPE,
    visibility: located?.entity.visibility ?? ("public" as const),
  };
  const refused = await refusal(deps, grant, operation, target, [operation]);
  if (refused) return refused;

  // A save that names no version is based on the image this mount last
  // held. Over a newer one it is refused: the image stays with the person
  // who sent it, and nothing is kept for the Inbox.
  if (located && request.ifMatch === null) {
    const base = await deps.mount.base();
    if (base !== undefined && base.hash !== located.entity.contentHash) {
      return {
        status: 409,
        message: "The image changed since this drive last read it",
      };
    }
  }

  const stagedAsset = await writes.stageAsset(bytes, {
    maxBytes: writes.maxAssetBytes,
    expectedSize: bytes.byteLength,
  });
  const fields = {
    content: stagedAsset.ref,
    metadata: {
      ...located?.entity.metadata,
      ...described,
      sizeBytes: stagedAsset.sizeBytes,
    },
  };
  const options = { eventContext: eventContext(grant) };
  const result = await attemptAsync(
    async (): Promise<WriteOutcome | undefined> => {
      if (located) {
        const updated = await writes.updateEntity({
          entity: { ...located.entity, ...fields },
          stagedAsset,
          options: {
            ...options,
            expectedContentHash: located.entity.contentHash,
          },
        });
        return updated.skipReason === "content-conflict" ? stale() : undefined;
      }
      await writes.createEntity({
        entity: { ...target, ...fields },
        stagedAsset,
        options: { ...options, conditionalWrite: { expectedRevision: null } },
      });
      return undefined;
    },
  );
  const failure = result.ok ? result.value : createFailure(result.error);
  if (failure) {
    // Bytes no entity references are not left behind.
    await writes.discardStagedAsset(stagedAsset);
    return failure;
  }
  await audit(writes, grant, operation, "allowed", target);
  const saved = await tree.entityAt(segments);
  if (saved) await deps.mount.held(saved.entity.contentHash);
  return { status: located ? 204 : 201, etag: saved?.file.etag };
}

/** Delete the entity a file is, only while it is still the version read. */
export async function deleteEntityFile(
  deps: WriteDeps,
  request: Omit<SaveRequest, "bytes">,
): Promise<WriteOutcome> {
  const located = await deps.tree.entityAt(request.segments);
  if (!located) return { status: 404, message: "Not found" };
  const { entity, file } = located;
  if (!matches(request.ifMatch, file.etag)) return stale();

  const refused = await refusal(deps, request.grant, "delete", entity, [
    "delete",
  ]);
  if (refused) return refused;

  // A delete that names no version removes the one this mount last held.
  // A newer one stays: a delete carries no text to keep, and 409 is the
  // answer a client does not retry.
  if (request.ifMatch === null) {
    const base = await deps.mount.base();
    if (base !== undefined && base.hash !== entity.contentHash) {
      return {
        status: 409,
        message: "The file changed since this drive last read it",
      };
    }
  }

  const deleted = await deps.writes.deleteEntity({
    entityType: entity.entityType,
    id: entity.id,
    options: {
      expectedContentHash: entity.contentHash,
      eventContext: eventContext(request.grant),
    },
  });
  if (!deleted) return stale();
  await deps.mount.forget();
  await audit(deps.writes, request.grant, "delete", "allowed", entity);
  return { status: 204 };
}

/** The uploaded bytes as the document its type reads, or why they are not one. */
function readDocument(
  writes: DavWrites,
  bytes: Uint8Array,
  entityType: string,
): { text: string; parsed: Partial<BaseEntity> } | WriteOutcome {
  const text = decodeUtf8(bytes);
  if (text === undefined) {
    return { status: 422, message: "The file is not UTF-8 text" };
  }
  const parsed = attempt(() => writes.deserializeEntity(text, entityType));
  // Whatever stops the type from reading the document — a schema it fails or
  // frontmatter that is not YAML — is the file's fault, and says so.
  return parsed.ok
    ? { text, parsed: parsed.value }
    : {
        status: 422,
        message: getErrorMessage(parsed.error, "The file cannot be read"),
      };
}

/** Why this person may not make the change, recorded, or nothing. */
async function refusal(
  deps: WriteDeps,
  grant: AuthAppPasswordGrant,
  operation: Operation,
  entity: Pick<BaseEntity, "id" | "entityType" | "visibility">,
  actions: Array<"create" | "update" | "delete" | "publish">,
): Promise<WriteOutcome | undefined> {
  const level = grant.principal.permissionLevel;
  const allowed = attempt(() =>
    actions.forEach((action) =>
      deps.writes.permissions.assertEntityActionAllowed(
        entity.entityType,
        action,
        { userPermissionLevel: level },
      ),
    ),
  );
  if (!allowed.ok) {
    await audit(
      deps.writes,
      grant,
      operation,
      "denied",
      entity,
      "entity-action-policy",
    );
    return forbidden(getErrorMessage(allowed.error, "Not allowed"));
  }
  if (operation !== "delete" && !canWriteVisibility(level, entity.visibility)) {
    await audit(
      deps.writes,
      grant,
      operation,
      "denied",
      entity,
      "visibility-policy",
    );
    return forbidden(
      `Cannot set visibility to "${entity.visibility}" at ${level} permission`,
    );
  }
  return undefined;
}

function audit(
  writes: DavWrites,
  grant: AuthAppPasswordGrant,
  operation: Operation,
  outcome: "allowed" | "denied",
  entity: Pick<BaseEntity, "id" | "entityType">,
  reason?: string,
): Promise<void> {
  return writes.recordAudit({
    actorUserId: grant.principal.userId,
    action: `${INTERFACE_TYPE}.entity.${operation}.${outcome}`,
    targetType: "entity",
    targetId: entity.id,
    metadata: {
      entityType: entity.entityType,
      interfaceType: INTERFACE_TYPE,
      outcome,
      ...(reason ? { reason } : {}),
    },
  });
}

/**
 * The brain stores its own serialization. An ETag is named only for bytes
 * the client already holds; otherwise it reads the file again.
 */
async function etagIfStoredAsSent(
  deps: WriteDeps,
  request: SaveRequest,
  text: string,
): Promise<string | undefined> {
  const saved = await deps.tree.entityAt(request.segments);
  return saved?.entity.content === text ? saved.file.etag : undefined;
}

function eventContext(grant: AuthAppPasswordGrant): {
  actor: { kind: "user"; userId: string };
  interfaceType: string;
} {
  return {
    actor: { kind: "user", userId: grant.principal.userId },
    interfaceType: INTERFACE_TYPE,
  };
}

/** Whether an `If-Match` header, when sent, names the current version. */
function matches(ifMatch: string | null, etag: string): boolean {
  return ifMatch === null || ifMatch === "*" || ifMatch === etag;
}

function parentExists(deps: WriteDeps, request: SaveRequest): Promise<boolean> {
  return deps.folderExists(request.segments.slice(0, -1));
}

function noFolder(): WriteOutcome {
  return { status: 409, message: "The folder does not exist" };
}

function tooLarge(): WriteOutcome {
  return { status: 413, message: "The file is larger than the drive accepts" };
}

function taken(): WriteOutcome {
  return { status: 412, message: "An entry already exists at this path" };
}

/** Why a create failed: the id is taken, or the entity is invalid. */
function createFailure(error: unknown): WriteOutcome {
  // The packed plugin and the runtime can carry separate class copies:
  // match the error's stable name, not its constructor.
  return error instanceof Error && error.name === "EntityWriteConflictError"
    ? taken()
    : invalidOrThrow(error);
}

function forbidden(message: string): WriteOutcome {
  return { status: 403, message };
}

function stale(): WriteOutcome {
  return { status: 412, message: "The file changed since it was opened" };
}

function invalidOrThrow(error: unknown): WriteOutcome {
  if (isEntityValidationError(error)) {
    return {
      status: 422,
      message: getErrorMessage(error, "The file cannot be saved"),
    };
  }
  throw error;
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Not text: the caller answers that the file cannot be an entity.
    return undefined;
  }
}

type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown };

function attempt<T>(run: () => T): Attempt<T> {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    return { ok: false, error };
  }
}

async function attemptAsync<T>(run: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  }
}
