import type { RecordConflictRequest } from "@brains/contracts";
import { memoryMountBases, type MountBases } from "./dav-mounts";
import type { MountView } from "./dav-saves";
import type { AuthAppPasswordGrant } from "@brains/contracts";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import { permissionToVisibilityScope } from "@brains/sdk/internal/service-runtime";
import {
  deleteEntityFile,
  saveEntityFile,
  type DavWrites,
  type WriteDeps,
  type WriteOutcome,
} from "./dav-saves";
import { ScratchStore, isScratchName, type ScratchFile } from "./dav-scratch";
import { CleanupGuard } from "./dav-cleanups";
import { SaveHolds, type SaveHold } from "./dav-holds";
import { LockStore, requestedLockSeconds } from "./dav-locks";
import { DavTree, type DavNode, type DavReader } from "./dav-tree";
import {
  davErrorXml,
  lockDiscoveryXml,
  propertiesAcceptedXml,
  multistatusXml,
  type DavResourceProps,
} from "./dav-xml";

export interface DavRoutesOptions {
  /** Where the drive is mounted, without a trailing slash: `/dav`. */
  basePath: string;
  /** The name a client shows when it asks for the app password. */
  realm: string;
  reader: DavReader;
  writes: DavWrites;
  /** The person behind a request's app password, if it carries a valid one. */
  resolveAppPassword: (
    request: Request,
  ) => Promise<AuthAppPasswordGrant | undefined>;
  /** Milliseconds since the epoch; the clock temporary files age by. */
  now?: () => number;
  /** The versions mounts hold; kept in memory when not given. */
  mounts?: MountBases;
  /**
   * Keep a losing save as a conflict, answering the id of the conflict that
   * keeps it; nothing holds one when not given, or when it answers undefined.
   */
  recordConflict?: (
    request: RecordConflictRequest,
  ) => Promise<string | undefined>;
  /** Whether a conflict still waits to be resolved; taken as yes when not given. */
  conflictPending?: (conflictId: string) => Promise<boolean>;
}

const READ_METHODS = ["OPTIONS", "GET", "HEAD", "PROPFIND"] as const;
const WRITE_METHODS = [
  "PUT",
  "DELETE",
  "MOVE",
  "COPY",
  "PROPPATCH",
  "MKCOL",
  "LOCK",
  "UNLOCK",
] as const;
const METHODS = [...READ_METHODS, ...WRITE_METHODS] as const;
type DavMethod = (typeof METHODS)[number];
const ALLOW = METHODS.join(", ");
const XML_TYPE = 'application/xml; charset="utf-8"';

/**
 * The drive shares its origin with Studio and the session cookie, so nothing
 * it serves may run as a page there: content types are never sniffed and a
 * document opened in a browser is sandboxed. Everything is private to the
 * caller, so nothing is cached by an intermediary.
 */
const INERT_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox",
  "Cache-Control": "no-store",
};

interface DavPath {
  /** Decoded names below the mount. */
  segments: string[];
  /** A trailing slash asks for a folder; a file never answers to one. */
  asFolder: boolean;
}

interface DavRequest {
  request: Request;
  grant: AuthAppPasswordGrant;
  tree: DavTree;
  /** Undefined when the request path names nothing on the drive. */
  path: DavPath | undefined;
}

interface DavServer {
  options: DavRoutesOptions;
  mounts: MountBases;
  scratch: ScratchStore;
  locks: LockStore;
  cleanups: CleanupGuard;
  holds: SaveHolds;
}

/**
 * A WebDAV class 2 server (RFC 4918) over a brain's entities: browse with
 * PROPFIND, read with GET and HEAD, save with PUT, remove with DELETE. Each
 * method is its own prefix route; the routes are public to the host and
 * authenticate every request themselves, with an app password.
 */
export function createDavRoutes(
  options: DavRoutesOptions,
): WebRouteDefinition[] {
  const server: DavServer = {
    options,
    mounts: options.mounts ?? memoryMountBases(options.now),
    scratch: new ScratchStore(options.now),
    locks: new LockStore(options.now),
    cleanups: new CleanupGuard(options.now),
    holds: new SaveHolds(options.now),
  };
  const handlers: Record<
    Exclude<DavMethod, "OPTIONS">,
    (server: DavServer, dav: DavRequest) => Promise<Response>
  > = {
    GET: (davServer, dav) => read(davServer, dav, true),
    HEAD: (davServer, dav) => read(davServer, dav, false),
    PROPFIND: propfind,
    PUT: put,
    DELETE: remove,
    MOVE: move,
    // Copying an entity would create one.
    COPY: async () => forbidden("The drive does not copy files"),
    PROPPATCH: patchProperties,
    MKCOL: makeFolder,
    LOCK: lock,
    UNLOCK: unlock,
  };

  return METHODS.map((method): WebRouteDefinition => ({
    path: options.basePath,
    match: "prefix",
    method,
    // Admitted by the host; authenticated here.
    public: true,
    handler: async (request): Promise<Response> => {
      // Clients probe with OPTIONS before they have asked for a password.
      if (method === "OPTIONS") return inert(optionsResponse());

      const grant = await options.resolveAppPassword(request);
      if (!grant) return inert(challenge(options.realm));
      if (isWriteMethod(method) && grant.access !== "write") {
        return inert(forbidden("This app password is read-only"));
      }

      const dav: DavRequest = {
        request,
        grant,
        tree: new DavTree(
          options.reader,
          permissionToVisibilityScope(grant.principal.permissionLevel),
        ),
        path: pathBelow(options.basePath, new URL(request.url).pathname),
      };
      // LOCK and UNLOCK answer for the lock themselves; every other write
      // to a locked path needs its holder and its token.
      if (
        isWriteMethod(method) &&
        method !== "LOCK" &&
        method !== "UNLOCK" &&
        dav.path &&
        !permitted(server, dav, dav.path.segments)
      ) {
        return inert(locked());
      }
      return inert(await handlers[method](server, dav));
    },
  }));
}

/** Whether a lock on a path lets this request write to it. */
function permitted(
  server: DavServer,
  dav: DavRequest,
  segments: string[],
): boolean {
  return server.locks.permits(
    segments,
    dav.grant.principal.userId,
    dav.request.headers.get("if"),
  );
}

function isWriteMethod(method: DavMethod): boolean {
  return WRITE_METHODS.some((candidate) => candidate === method);
}

/** The temporary file a path names for this person, if it holds one. */
function scratchAt(
  server: DavServer,
  dav: DavRequest,
): ScratchFile | undefined {
  const { path } = dav;
  return path && !path.asFolder && isScratchPath(path.segments)
    ? server.scratch.get(dav.grant.principal.userId, path.segments)
    : undefined;
}

/**
 * Whether a path is a temporary item and never an entity: its name is an
 * editor's own, or it lies in a hidden folder. A desktop keeps its own
 * housekeeping there (`.Trashes`, `.TemporaryItems`, `.Spotlight-V100`),
 * whatever the files inside are called.
 */
function isScratchPath(segments: string[]): boolean {
  const name = segments[segments.length - 1];
  return name !== undefined && (isHiddenPath(segments) || isScratchName(name));
}

function isHiddenPath(segments: string[]): boolean {
  return segments.some((segment) => segment.startsWith("."));
}

async function nodeAt(
  server: DavServer,
  dav: DavRequest,
): Promise<DavNode | undefined> {
  if (!dav.path) return undefined;
  const node = await dav.tree.resolve(dav.path.segments);
  if (node) return node.kind === "file" && dav.path.asFolder ? undefined : node;
  // A folder this person made and has not saved into yet.
  return server.scratch.hasFolder(dav.grant.principal.userId, dav.path.segments)
    ? { kind: "folder", segments: dav.path.segments }
    : undefined;
}

/** Whether a folder is there for this person: real, or one they made. */
async function folderExists(
  server: DavServer,
  dav: DavRequest,
  segments: string[],
): Promise<boolean> {
  return (
    segments.length === 0 ||
    server.scratch.hasFolder(dav.grant.principal.userId, segments) ||
    (await dav.tree.resolve(segments))?.kind === "folder"
  );
}

/**
 * The save this request's app password is shown for a file instead of the
 * stored version, while it lasts: until the entity changes again, or the
 * conflict that keeps the save is resolved.
 */
async function liveHold(
  server: DavServer,
  dav: DavRequest,
  node: DavNode,
): Promise<SaveHold | undefined> {
  if (node.kind !== "file") return undefined;
  const mount = dav.grant.appPasswordId;
  const hold = server.holds.get(mount, node.segments);
  if (!hold) return undefined;
  const { conflictPending } = server.options;
  const pending =
    hold.conflictId === undefined ||
    conflictPending === undefined ||
    (await conflictPending(hold.conflictId));
  if (pending && node.etag === `"${hold.storedHash}"`) return hold;
  server.holds.release(mount, node.segments);
  return undefined;
}

/**
 * The version a write names. The ETag of a held save stands for the version
 * that save was made over, which is the mount's base: it is never taken for
 * the stored version it differs from.
 */
async function namedVersion(
  server: DavServer,
  dav: DavRequest,
  segments: string[],
): Promise<string | null> {
  const ifMatch = dav.request.headers.get("if-match");
  if (ifMatch === null) return null;
  if (!server.holds.get(dav.grant.appPasswordId, segments)) return ifMatch;
  const node = await dav.tree.resolve(segments);
  const hold = node ? await liveHold(server, dav, node) : undefined;
  return hold?.etag === ifMatch ? null : ifMatch;
}

/** What a listing says of a node, as this request's app password sees it. */
async function propsFor(
  server: DavServer,
  dav: DavRequest,
  node: DavNode,
): Promise<DavResourceProps> {
  const props = nodeProps(node, server.options.basePath);
  const hold = await liveHold(server, dav, node);
  return hold
    ? {
        ...props,
        contentLength: hold.bytes.byteLength,
        etag: hold.etag,
        lastModified: hold.savedAt,
      }
    : props;
}

/** What this request's mount holds of the file the request names. */
function mountView(server: DavServer, dav: DavRequest): MountView {
  const mount = dav.grant.appPasswordId;
  const path = (dav.path?.segments ?? []).join("/");
  return {
    base: () => server.mounts.get(mount, path),
    held: (hash) => server.mounts.held(mount, path, hash),
    conflictKept: (edit, conflictId) =>
      server.mounts.conflictKept(mount, path, edit, conflictId),
    forget: () => server.mounts.forget(mount, path),
  };
}

function writeDeps(server: DavServer, dav: DavRequest): WriteDeps {
  return {
    tree: dav.tree,
    reader: server.options.reader,
    writes: server.options.writes,
    mount: mountView(server, dav),
    recordConflict: async (request) => server.options.recordConflict?.(request),
    folderExists: (segments) => folderExists(server, dav, segments),
  };
}

async function read(
  server: DavServer,
  dav: DavRequest,
  withBody: boolean,
): Promise<Response> {
  const scratch = scratchAt(server, dav);
  if (scratch) {
    return new Response(withBody ? scratch.bytes : null, {
      status: 200,
      headers: {
        // Never rendered: an editor's file can hold anything.
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment",
        "Content-Length": String(scratch.bytes.byteLength),
        ETag: scratchEtag(scratch),
        "Last-Modified": scratch.modified.toUTCString(),
      },
    });
  }

  const node = await nodeAt(server, dav);
  if (!node) return notFound();
  if (node.kind === "folder") return folderHasNoContent();
  const hold = await liveHold(server, dav, node);
  if (hold) {
    // Not a read of the stored version: the mount's base stays the one its
    // held save was made over, so a save from the held text loses again.
    return new Response(withBody ? hold.bytes : null, {
      status: 200,
      headers: {
        "Content-Type": node.contentType,
        "Content-Length": String(hold.bytes.byteLength),
        ETag: hold.etag,
        "Last-Modified": hold.savedAt.toUTCString(),
      },
    });
  }
  // Reading a file is what a mount's next save without a version is based
  // on. The ETag is the content hash, quoted.
  await mountView(server, dav).held(node.etag.replace(/^"|"$/g, ""));
  return new Response(withBody ? await node.open() : null, {
    status: 200,
    headers: {
      "Content-Type": node.contentType,
      "Content-Length": String(node.size),
      ETag: node.etag,
      "Last-Modified": node.modified.toUTCString(),
    },
  });
}

async function propfind(server: DavServer, dav: DavRequest): Promise<Response> {
  // No Depth header means infinity (RFC 4918 §9.1), which is never served.
  const depth = dav.request.headers.get("depth");
  if (depth !== "0" && depth !== "1") {
    return new Response(davErrorXml("propfind-finite-depth"), {
      status: 403,
      headers: { "Content-Type": XML_TYPE },
    });
  }
  const { basePath } = server.options;

  const scratch = scratchAt(server, dav);
  if (scratch) return multistatus([scratchProps(scratch, basePath)]);

  const node = await nodeAt(server, dav);
  if (!node) return notFound();
  if (node.kind === "file" || depth === "0") {
    return multistatus([await propsFor(server, dav, node)]);
  }
  const userId = dav.grant.principal.userId;
  const children = await dav.tree.children(node.segments);
  const realFolders = new Set(
    children
      .filter((child) => child.kind === "folder")
      .map((child) => child.segments[child.segments.length - 1]),
  );
  return multistatus([
    nodeProps(node, basePath),
    ...(await Promise.all(
      children.map((child) => propsFor(server, dav, child)),
    )),
    ...server.scratch
      .listFolders(userId, node.segments)
      .filter((name) => !realFolders.has(name))
      .map((name) =>
        nodeProps(
          { kind: "folder", segments: [...node.segments, name] },
          basePath,
        ),
      ),
    ...server.scratch
      .list(userId, node.segments)
      .map((file) => scratchProps(file, basePath)),
  ]);
}

async function put(server: DavServer, dav: DavRequest): Promise<Response> {
  const { path } = dav;
  if (!path) return notFound();
  if (path.asFolder || path.segments.length === 0) return folderHasNoContent();

  // The ceiling for any file; a save then applies the limit of its kind.
  const { maxFileBytes, maxAssetBytes } = server.options.writes;
  const bytes = await readBody(
    dav.request,
    Math.max(maxFileBytes, maxAssetBytes),
  );
  const userId = dav.grant.principal.userId;
  const scratch = isScratchPath(path.segments);
  if (!bytes) {
    if (!scratch) server.cleanups.expect(userId, path.segments);
    return new Response("The file is larger than the drive accepts", {
      status: 413,
    });
  }
  if (scratch) {
    // A folder's name has no extension either; it is not a temporary file.
    if (await folderExists(server, dav, path.segments)) {
      return folderHasNoContent();
    }
    return scratchWritten(server.scratch.put(userId, path.segments, bytes));
  }
  const outcome = await saveEntityFile(writeDeps(server, dav), {
    segments: path.segments,
    bytes,
    ifMatch: await namedVersion(server, dav, path.segments),
    onlyIfAbsent: dav.request.headers.get("if-none-match")?.trim() === "*",
    grant: dav.grant,
  });
  // A refused save, or one stored in another form (it has no ETag), is an
  // upload a client takes as failed and cleans up after with a delete.
  if ("message" in outcome || outcome.etag === undefined) {
    server.cleanups.expect(userId, path.segments);
  }
  await holdSave(server, dav, path.segments, bytes, outcome);
  return written(server, dav, path.segments, outcome);
}

/**
 * A save answered as saved that the brain did not store as sent, kept as a
 * conflict or stored in another form, is shown back as sent to the app
 * password that sent it. rclone reads a file's size back after it uploads
 * it, and takes any other size as a corrupted upload it deletes and sends
 * again for as long as it is mounted. A save stored as sent ends the hold.
 */
async function holdSave(
  server: DavServer,
  dav: DavRequest,
  segments: string[],
  bytes: Uint8Array<ArrayBuffer>,
  outcome: WriteOutcome,
): Promise<void> {
  if ("message" in outcome) return;
  const mount = dav.grant.appPasswordId;
  if (outcome.etag !== undefined) {
    server.holds.release(mount, segments);
    return;
  }
  const stored = await dav.tree.entityAt(segments);
  if (!stored) return;
  server.holds.hold(mount, segments, {
    bytes,
    storedHash: stored.entity.contentHash,
    conflictId: outcome.conflictId,
  });
}

async function remove(server: DavServer, dav: DavRequest): Promise<Response> {
  const { path } = dav;
  if (!path) return notFound();
  const userId = dav.grant.principal.userId;
  if (server.scratch.removeFolder(userId, path.segments)) return noContent();
  if (!path.asFolder && isScratchPath(path.segments)) {
    if (server.scratch.delete(userId, path.segments)) return noContent();
  }
  if (
    path.segments.length === 0 ||
    (await dav.tree.resolve(path.segments))?.kind === "folder"
  ) {
    // A folder goes when the last entity inside it does.
    return forbidden("The drive does not delete folders");
  }
  if (path.asFolder) return notFound();
  if (
    dav.request.headers.get("if-match") === null &&
    server.cleanups.take(userId, path.segments)
  ) {
    return new Response(
      "The file is kept: the save just before was refused or stored in another form. Delete it again to remove it.",
      { status: 409 },
    );
  }
  const outcome = await deleteEntityFile(writeDeps(server, dav), {
    segments: path.segments,
    ifMatch: await namedVersion(server, dav, path.segments),
    grant: dav.grant,
  });
  if (!("message" in outcome)) {
    server.holds.release(dav.grant.appPasswordId, path.segments);
  }
  return written(server, dav, path.segments, outcome);
}

/**
 * PROPPATCH is accepted and stores nothing. macOS and Windows set a file's
 * times and attributes after they save it, and report a refusal as an error
 * although the save went through. What a file's properties are is the
 * entity's to say, so the change is acknowledged and dropped.
 */
async function patchProperties(
  server: DavServer,
  dav: DavRequest,
): Promise<Response> {
  const node = scratchAt(server, dav) ?? (await nodeAt(server, dav));
  if (!node || !dav.path) return notFound();
  const folder = "kind" in node && node.kind === "folder";
  const encoded = encodePath(dav.path.segments);
  return new Response(
    propertiesAcceptedXml(
      `${server.options.basePath}/${encoded}${folder && encoded ? "/" : ""}`,
    ),
    { status: 207, headers: { "Content-Type": XML_TYPE } },
  );
}

/**
 * A new folder is only a place to save into: it is the person's own, in
 * memory, until an entity is saved inside it, and that entity's id is what
 * makes the folder real. MKCOL on a folder that is there answers 405, which
 * clients that make parent folders before every upload take as done.
 */
async function makeFolder(
  server: DavServer,
  dav: DavRequest,
): Promise<Response> {
  const { path } = dav;
  if (!path) return notFound();
  if ((await dav.request.arrayBuffer()).byteLength > 0) {
    return new Response("MKCOL takes no body", { status: 415 });
  }
  const { segments } = path;
  const userId = dav.grant.principal.userId;
  if (
    segments.length === 0 ||
    (await dav.tree.resolve(segments)) ||
    server.scratch.hasFolder(userId, segments) ||
    server.scratch.get(userId, segments)
  ) {
    return new Response("Already exists", {
      status: 405,
      headers: { Allow: "OPTIONS, PROPFIND" },
    });
  }
  if (!(await folderExists(server, dav, segments.slice(0, -1)))) {
    return new Response("The parent folder does not exist", { status: 409 });
  }
  // Every folder at the root is an entity type; inside one, a folder is an
  // id segment and may have any name. A hidden folder is neither: it is the
  // desktop's own and never holds an entity.
  const [type] = segments;
  if (
    !isHiddenPath(segments) &&
    (type === undefined || !dav.tree.isFolderType(type))
  ) {
    return forbidden("Only an entity type can be a folder here");
  }
  server.scratch.makeFolder(userId, segments);
  return new Response(null, { status: 201 });
}

/**
 * MOVE is how an editor finishes an atomic save: it wrote a temporary file
 * and renames it onto the real one. That rename is a save of the temporary
 * file's bytes. Renaming an entity is not offered, except onto a temporary
 * name, which is an editor's backup.
 */
async function move(server: DavServer, dav: DavRequest): Promise<Response> {
  const header = dav.request.headers.get("destination");
  if (!header) return new Response("Destination required", { status: 400 });
  const destination = destinationPath(
    server.options.basePath,
    dav.request,
    header,
  );
  // RFC 4918 §9.9.4: a destination this server cannot accept.
  if (!destination) {
    return new Response("Destination is not on this drive", { status: 502 });
  }

  const { path } = dav;
  if (!path) return notFound();
  if (!permitted(server, dav, destination.segments)) return locked();
  const overwrite = dav.request.headers.get("overwrite")?.toUpperCase() !== "F";
  if (path.asFolder) return forbidden("The drive does not rename files");
  if (!isScratchPath(path.segments)) {
    return isScratchPath(destination.segments)
      ? backUp(server, dav, path.segments, destination.segments, overwrite)
      : forbidden("The drive does not rename files");
  }
  const userId = dav.grant.principal.userId;
  const source = server.scratch.get(userId, path.segments);
  if (!source) return notFound();

  if (isScratchPath(destination.segments)) {
    if (!overwrite && server.scratch.get(userId, destination.segments)) {
      return preconditionFailed("The destination exists");
    }
    const renamed = server.scratch.rename(
      userId,
      path.segments,
      destination.segments,
    );
    return renamed === "missing"
      ? notFound()
      : new Response(null, { status: renamed === "created" ? 201 : 204 });
  }

  if (!overwrite && (await dav.tree.entityAt(destination.segments))) {
    return preconditionFailed("The destination exists");
  }
  const outcome = await saveEntityFile(writeDeps(server, dav), {
    segments: destination.segments,
    bytes: source.bytes,
    ifMatch: null,
    grant: dav.grant,
  });
  // A refused save keeps the temporary file: the editor still has its work.
  if (outcome.status < 300) {
    server.scratch.delete(userId, path.segments);
    // A newer save of the file: an earlier one is no longer shown back.
    server.holds.release(dav.grant.appPasswordId, destination.segments);
  }
  return written(server, dav, destination.segments, outcome);
}

/**
 * An editor that keeps a backup renames the file it is about to save onto
 * the backup's name (`note.md` → `note.md~`) and then writes the file anew.
 * Refusing that rename makes neovim copy the file and delete the original
 * instead (`vim_rename`), which deletes the entity. So a rename of an entity
 * onto a temporary name is taken as the backup: the file's bytes are copied
 * to the person's temporary files and the entity stays, for the save that
 * follows to replace.
 */
async function backUp(
  server: DavServer,
  dav: DavRequest,
  source: string[],
  destination: string[],
  overwrite: boolean,
): Promise<Response> {
  const located = await dav.tree.entityAt(source);
  if (!located) return notFound();
  const userId = dav.grant.principal.userId;
  if (!overwrite && server.scratch.get(userId, destination)) {
    return preconditionFailed("The destination exists");
  }
  const bytes = new Uint8Array(
    await new Response(await located.file.open()).arrayBuffer(),
  );
  return scratchWritten(server.scratch.put(userId, destination, bytes));
}

/**
 * LOCK takes a path's exclusive write lock, or, when the request names a
 * token it holds and sends no lock body, refreshes it. A client creating a
 * file locks its name first; that lock is granted and creates nothing.
 */
async function lock(server: DavServer, dav: DavRequest): Promise<Response> {
  const { path } = dav;
  if (!path || path.segments.length === 0) return notFound();
  const userId = dav.grant.principal.userId;
  const seconds = requestedLockSeconds(dav.request.headers.get("timeout"));
  const ifHeader = dav.request.headers.get("if");
  const hasBody = (await dav.request.arrayBuffer()).byteLength > 0;

  if (ifHeader && !hasBody) {
    const refreshed = server.locks.refresh(
      path.segments,
      userId,
      ifHeader,
      seconds,
    );
    return refreshed
      ? lockGranted(server, path.segments, refreshed, 200)
      : preconditionFailed("No such lock to refresh");
  }
  const granted = server.locks.acquire(path.segments, userId, seconds);
  if (!granted) return locked();
  const exists =
    scratchAt(server, dav) !== undefined ||
    (await nodeAt(server, dav)) !== undefined;
  return lockGranted(server, path.segments, granted, exists ? 200 : 201);
}

function lockGranted(
  server: DavServer,
  segments: string[],
  granted: { token: string; seconds: number },
  status: 200 | 201,
): Response {
  return new Response(
    lockDiscoveryXml({
      ...granted,
      href: `${server.options.basePath}/${encodePath(segments)}`,
    }),
    {
      status,
      headers: {
        "Content-Type": XML_TYPE,
        "Lock-Token": `<${granted.token}>`,
      },
    },
  );
}

async function unlock(server: DavServer, dav: DavRequest): Promise<Response> {
  const { path } = dav;
  if (!path) return notFound();
  const token = /<([^>]+)>/.exec(
    dav.request.headers.get("lock-token") ?? "",
  )?.[1];
  if (!token) return new Response("Lock-Token required", { status: 400 });
  return server.locks.release(path.segments, dav.grant.principal.userId, token)
    ? noContent()
    : new Response("No such lock", { status: 409 });
}

/** The answer to a write; a created entity makes its folders real. */
function written(
  server: DavServer,
  dav: DavRequest,
  segments: string[],
  outcome: WriteOutcome,
): Response {
  if ("message" in outcome) {
    return new Response(outcome.message, { status: outcome.status });
  }
  if (outcome.status === 201) {
    server.scratch.forgetFolders(
      dav.grant.principal.userId,
      segments.slice(0, -1),
    );
  }
  return new Response(null, {
    status: outcome.status,
    headers: outcome.etag ? { ETag: outcome.etag } : {},
  });
}

function scratchWritten(outcome: "created" | "replaced" | "full"): Response {
  return outcome === "full"
    ? new Response("Too many temporary files", { status: 507 })
    : new Response(null, { status: outcome === "created" ? 201 : 204 });
}

/** A request body of at most `max` bytes, or nothing when it is larger. */
async function readBody(
  request: Request,
  max: number,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (Number(request.headers.get("content-length") ?? 0) > max) {
    return undefined;
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.byteLength > max ? undefined : bytes;
}

function nodeProps(node: DavNode, basePath: string): DavResourceProps {
  const displayName = node.segments[node.segments.length - 1] ?? "";
  if (node.kind === "folder") {
    const encoded = encodePath(node.segments);
    return {
      href: encoded ? `${basePath}/${encoded}/` : `${basePath}/`,
      displayName,
      collection: true,
    };
  }
  return {
    href: `${basePath}/${encodePath(node.segments)}`,
    displayName,
    collection: false,
    contentLength: node.size,
    contentType: node.contentType,
    etag: node.etag,
    lastModified: node.modified,
  };
}

function scratchProps(file: ScratchFile, basePath: string): DavResourceProps {
  return {
    href: `${basePath}/${encodePath(file.segments)}`,
    displayName: file.segments[file.segments.length - 1] ?? "",
    collection: false,
    contentLength: file.bytes.byteLength,
    contentType: "application/octet-stream",
    etag: scratchEtag(file),
    lastModified: file.modified,
  };
}

function scratchEtag(file: ScratchFile): string {
  return `"scratch-${file.modified.getTime()}-${file.bytes.byteLength}"`;
}

function encodePath(segments: string[]): string {
  return segments.map(encodeURIComponent).join("/");
}

/** The decoded names a URL path holds below the mount. */
function pathBelow(basePath: string, pathname: string): DavPath | undefined {
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
    return undefined;
  }
  const rest = pathname.slice(basePath.length + 1);
  if (rest === "") return { segments: [], asFolder: true };

  const asFolder = rest.endsWith("/");
  const names = (asFolder ? rest.slice(0, -1) : rest).split("/");
  const segments = names.map(decodeSegment);
  return segments.every(
    (segment) =>
      segment !== undefined && segment !== "" && !/[/\\\0]/.test(segment),
  )
    ? {
        segments: segments.filter((segment) => segment !== undefined),
        asFolder,
      }
    : undefined;
}

/** Where a `Destination` header points, when that is on this drive. */
function destinationPath(
  basePath: string,
  request: Request,
  header: string,
): DavPath | undefined {
  const requested = new URL(request.url);
  const destination = URL.canParse(header, requested)
    ? new URL(header, requested)
    : undefined;
  if (destination?.host !== requested.host) return undefined;
  const path = pathBelow(basePath, destination.pathname);
  return path && !path.asFolder && path.segments.length > 0 ? path : undefined;
}

function decodeSegment(name: string): string | undefined {
  try {
    return decodeURIComponent(name);
  } catch {
    // Not valid percent-encoding: the path names nothing.
    return undefined;
  }
}

function multistatus(resources: DavResourceProps[]): Response {
  return new Response(multistatusXml(resources), {
    status: 207,
    headers: { "Content-Type": XML_TYPE },
  });
}

function optionsResponse(): Response {
  return new Response(null, {
    status: 200,
    headers: { DAV: "1, 2", Allow: ALLOW, "MS-Author-Via": "DAV" },
  });
}

function challenge(realm: string): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm.replace(/["\\]/g, "")}", charset="UTF-8"`,
    },
  });
}

function folderHasNoContent(): Response {
  return new Response("A folder has no content", {
    status: 405,
    headers: { Allow: "OPTIONS, PROPFIND" },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function forbidden(message: string): Response {
  return new Response(message, { status: 403 });
}

function locked(): Response {
  return new Response("The file is locked", { status: 423 });
}

function preconditionFailed(message: string): Response {
  return new Response(message, { status: 412 });
}

function inert(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(INERT_HEADERS).forEach(([name, value]) =>
    headers.set(name, value),
  );
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
