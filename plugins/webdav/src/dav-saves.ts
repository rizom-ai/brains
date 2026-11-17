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
import { getErrorMessage } from "@brains/utils/error";
import type { DavFile, DavReader, DavTree } from "./dav-tree";

/** What the drive needs to change an entity. */
export interface DavWrites {
  /** The largest file a client may send. */
  maxFileBytes: number;
  deserializeEntity: ServiceEntityReads["deserializeEntity"];
  createEntity: ServiceEntityWrites["createEntity"];
  updateEntity: ServiceEntityWrites["updateEntity"];
  deleteEntity: ServiceEntityWrites["deleteEntity"];
  permissions: ServicePermissions;
  recordAudit(event: AppendAuthAuditEventInput): Promise<void>;
}

export type WriteOutcome =
  | { status: 201 | 204; etag?: string | undefined }
  | { status: 403 | 404 | 409 | 412 | 422; message: string };

export interface WriteDeps {
  tree: DavTree;
  reader: DavReader;
  writes: DavWrites;
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

const BINARY_EXTENSION = /\.(?!md$)[^./]+$/i;
const BINARY_TYPES = new Set(["image", "document"]);
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
  const located = await deps.tree.entityAt(request.segments);
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
  if (BINARY_TYPES.has(existing.entityType)) {
    return forbidden("The drive cannot replace images or documents yet");
  }
  if (request.onlyIfAbsent) {
    return { status: 412, message: "An entry already exists at this path" };
  }
  if (!matches(request.ifMatch, file.etag)) return stale();

  const document = readDocument(writes, request.bytes, existing.entityType);
  if ("status" in document) return document;

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
  if (result.value.skipped) return stale();
  await audit(writes, request.grant, "update", "allowed", entity);
  return {
    status: 204,
    etag: await etagIfStoredAsSent(deps, request, document.text),
  };
}

async function createEntityFile(
  deps: WriteDeps,
  request: SaveRequest,
): Promise<WriteOutcome> {
  const { writes, tree } = deps;
  const { segments } = request;
  if (!(await deps.folderExists(segments.slice(0, -1)))) {
    return { status: 409, message: "The folder does not exist" };
  }
  if (BINARY_EXTENSION.test(segments[segments.length - 1] ?? "")) {
    return forbidden("The drive cannot take images or documents yet");
  }
  const placement = tree.placementAt(segments);
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
  if (!result.ok) {
    // The packed plugin and the runtime can carry separate class copies:
    // match the error's stable name, not its constructor.
    return result.error instanceof Error &&
      result.error.name === "EntityWriteConflictError"
      ? { status: 412, message: "An entry already exists at this path" }
      : invalidOrThrow(result.error);
  }
  await audit(writes, request.grant, "create", "allowed", entity);
  return {
    status: 201,
    etag: await etagIfStoredAsSent(deps, request, document.text),
  };
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

  const deleted = await deps.writes.deleteEntity({
    entityType: entity.entityType,
    id: entity.id,
    options: {
      expectedContentHash: entity.contentHash,
      eventContext: eventContext(request.grant),
    },
  });
  if (!deleted) return stale();
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
