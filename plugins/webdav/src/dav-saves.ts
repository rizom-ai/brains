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
  ServiceEntityReads,
  ServiceEntityWrites,
  ServicePermissions,
} from "@brains/sdk/internal/service-runtime";
import { getErrorMessage } from "@brains/utils/error";
import type { DavReader, DavTree } from "./dav-tree";

/** What the drive needs to change an entity. */
export interface DavWrites {
  /** The largest file a client may send. */
  maxFileBytes: number;
  deserializeEntity: ServiceEntityReads["deserializeEntity"];
  updateEntity: ServiceEntityWrites["updateEntity"];
  permissions: ServicePermissions;
  recordAudit(event: AppendAuthAuditEventInput): Promise<void>;
}

export type SaveOutcome =
  | { status: 204; etag: string | undefined }
  | { status: 403 | 412 | 422; message: string };

export interface SaveRequest {
  segments: string[];
  bytes: Uint8Array;
  /** The `If-Match` header, when the client named the version it edited. */
  ifMatch: string | null;
  grant: AuthAppPasswordGrant;
}

const BINARY_TYPES = new Set(["image", "document"]);
const INTERFACE_TYPE = "webdav";

/**
 * Save a file a client sent over the entity it names, as Studio saves an
 * edit: the type's adapter validates the document, the entity action policy
 * and the visibility policy decide whether this person may make the change,
 * and the write goes through only over the version it was based on.
 */
export async function saveEntityFile(
  deps: { tree: DavTree; reader: DavReader; writes: DavWrites },
  request: SaveRequest,
): Promise<SaveOutcome> {
  const { tree, reader, writes } = deps;
  const { grant } = request;
  const level = grant.principal.permissionLevel;

  const located = await tree.entityAt(request.segments);
  // A file the caller may not see answers exactly as one that is not there.
  if (!located) {
    return { status: 403, message: "The drive cannot create files yet" };
  }
  const { entity: existing, file } = located;
  if (BINARY_TYPES.has(existing.entityType)) {
    return {
      status: 403,
      message: "The drive cannot replace images or documents yet",
    };
  }
  if (
    request.ifMatch !== null &&
    request.ifMatch !== "*" &&
    request.ifMatch !== file.etag
  ) {
    return stale();
  }

  const text = decodeUtf8(request.bytes);
  if (text === undefined) {
    return { status: 422, message: "The file is not UTF-8 text" };
  }
  const parsed = attempt(() =>
    writes.deserializeEntity(text, existing.entityType),
  );
  // Whatever stops the type from reading the document — a schema it fails or
  // frontmatter that is not YAML — is the file's fault, and says so.
  if (!parsed.ok) {
    return {
      status: 422,
      message: getErrorMessage(parsed.error, "The file cannot be read"),
    };
  }

  const { visibility: _policy, ...metadata } =
    parsed.value.metadata ?? existing.metadata;
  const entity: BaseEntity = {
    ...existing,
    ...parsed.value,
    id: existing.id,
    entityType: existing.entityType,
    content: text,
    metadata,
    // A file that names no visibility carries no opinion about it.
    visibility: parsed.value.visibility ?? existing.visibility,
  };

  const audit = (
    outcome: "allowed" | "denied",
    reason?: string,
  ): Promise<void> =>
    writes.recordAudit({
      actorUserId: grant.principal.userId,
      action: `${INTERFACE_TYPE}.entity.update.${outcome}`,
      targetType: "entity",
      targetId: existing.id,
      metadata: {
        entityType: existing.entityType,
        interfaceType: INTERFACE_TYPE,
        outcome,
        ...(reason ? { reason } : {}),
      },
    });

  const action =
    getPublishBoundaryState(
      existing.entityType,
      existing.metadata["status"],
      entity.metadata["status"],
      reader,
    ) === "non-publish"
      ? "update"
      : "publish";
  const allowed = attempt(() =>
    writes.permissions.assertEntityActionAllowed(existing.entityType, action, {
      userPermissionLevel: level,
    }),
  );
  if (!allowed.ok) {
    await audit("denied", "entity-action-policy");
    return {
      status: 403,
      message: getErrorMessage(allowed.error, "Not allowed"),
    };
  }
  if (!canWriteVisibility(level, entity.visibility)) {
    await audit("denied", "visibility-policy");
    return {
      status: 403,
      message: `Cannot set visibility to "${entity.visibility}" at ${level} permission`,
    };
  }

  const result = await attemptAsync(() =>
    writes.updateEntity({
      entity,
      options: {
        // Without `If-Match` the last write wins, but only over the version
        // read above: a change made meanwhile is never silently replaced.
        expectedContentHash: existing.contentHash,
        eventContext: {
          actor: { kind: "user", userId: grant.principal.userId },
          interfaceType: INTERFACE_TYPE,
        },
      },
    }),
  );
  if (!result.ok) return invalidOrThrow(result.error);
  if (result.value.skipped) return stale();
  await audit("allowed");

  // The brain stores its own serialization. An ETag is named only for bytes
  // the client already holds; otherwise it reads the file again.
  const saved = await tree.entityAt(request.segments);
  return {
    status: 204,
    etag: saved?.entity.content === text ? saved.file.etag : undefined,
  };
}

function stale(): SaveOutcome {
  return {
    status: 412,
    message: "The file changed since it was opened",
  };
}

function invalidOrThrow(error: unknown): SaveOutcome {
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
