import type { AuthAppPasswordGrant } from "@brains/contracts";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import { permissionToVisibilityScope } from "@brains/sdk/internal/service-runtime";
import { saveEntityFile, type DavWrites, type SaveOutcome } from "./dav-saves";
import { ScratchStore, isScratchName, type ScratchFile } from "./dav-scratch";
import { DavTree, type DavNode, type DavReader } from "./dav-tree";
import { davErrorXml, multistatusXml, type DavResourceProps } from "./dav-xml";

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
}

const READ_METHODS = ["OPTIONS", "GET", "HEAD", "PROPFIND"] as const;
const WRITE_METHODS = ["PUT", "DELETE", "MOVE", "COPY", "PROPPATCH"] as const;
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
  scratch: ScratchStore;
}

/**
 * A WebDAV class 1 server (RFC 4918) over a brain's entities: browse with
 * PROPFIND, read with GET and HEAD, save an existing file with PUT. Each
 * method is its own prefix route; the routes are public to the host and
 * authenticate every request themselves, with an app password.
 */
export function createDavRoutes(
  options: DavRoutesOptions,
): WebRouteDefinition[] {
  const server: DavServer = {
    options,
    scratch: new ScratchStore(options.now),
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
    // Copying an entity would create one, and properties are not stored.
    COPY: async () => forbidden("The drive does not copy files"),
    PROPPATCH: async () => forbidden("The drive does not store properties"),
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

      return inert(
        await handlers[method](server, {
          request,
          grant,
          tree: new DavTree(
            options.reader,
            permissionToVisibilityScope(grant.principal.permissionLevel),
          ),
          path: pathBelow(options.basePath, new URL(request.url).pathname),
        }),
      );
    },
  }));
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

function isScratchPath(segments: string[]): boolean {
  const name = segments[segments.length - 1];
  return name !== undefined && isScratchName(name);
}

async function nodeAt(dav: DavRequest): Promise<DavNode | undefined> {
  if (!dav.path) return undefined;
  const node = await dav.tree.resolve(dav.path.segments);
  return node?.kind === "file" && dav.path.asFolder ? undefined : node;
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

  const node = await nodeAt(dav);
  if (!node) return notFound();
  if (node.kind === "folder") return folderHasNoContent();
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

  const node = await nodeAt(dav);
  if (!node) return notFound();
  if (node.kind === "file" || depth === "0") {
    return multistatus([nodeProps(node, basePath)]);
  }
  return multistatus([
    nodeProps(node, basePath),
    ...(await dav.tree.children(node.segments)).map((child) =>
      nodeProps(child, basePath),
    ),
    ...server.scratch
      .list(dav.grant.principal.userId, node.segments)
      .map((file) => scratchProps(file, basePath)),
  ]);
}

async function put(server: DavServer, dav: DavRequest): Promise<Response> {
  const { path } = dav;
  if (!path) return notFound();
  if (path.asFolder || path.segments.length === 0) return folderHasNoContent();

  const bytes = await readBody(dav.request, server.options.writes.maxFileBytes);
  if (!bytes) {
    return new Response("The file is larger than the drive accepts", {
      status: 413,
    });
  }
  if (isScratchPath(path.segments)) {
    // A folder's name has no extension either; it is not a temporary file.
    if ((await dav.tree.resolve(path.segments))?.kind === "folder") {
      return folderHasNoContent();
    }
    return scratchWritten(
      server.scratch.put(dav.grant.principal.userId, path.segments, bytes),
    );
  }
  return saved(
    await saveEntityFile(
      {
        tree: dav.tree,
        reader: server.options.reader,
        writes: server.options.writes,
      },
      {
        segments: path.segments,
        bytes,
        ifMatch: dav.request.headers.get("if-match"),
        grant: dav.grant,
      },
    ),
  );
}

async function remove(server: DavServer, dav: DavRequest): Promise<Response> {
  const { path } = dav;
  if (!path) return notFound();
  if (!path.asFolder && isScratchPath(path.segments)) {
    return server.scratch.delete(dav.grant.principal.userId, path.segments)
      ? noContent()
      : notFound();
  }
  return forbidden("The drive cannot delete files yet");
}

/**
 * MOVE is how an editor finishes an atomic save: it wrote a temporary file
 * and renames it onto the real one. That rename is a save of the temporary
 * file's bytes. Renaming an entity is not offered.
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
  if (path.asFolder || !isScratchPath(path.segments)) {
    return forbidden("The drive does not rename files");
  }
  const userId = dav.grant.principal.userId;
  const source = server.scratch.get(userId, path.segments);
  if (!source) return notFound();

  const overwrite = dav.request.headers.get("overwrite")?.toUpperCase() !== "F";
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

  // Phase by phase the destination is always an existing entity for now.
  if (!overwrite) return preconditionFailed("The destination exists");
  const outcome = await saveEntityFile(
    {
      tree: dav.tree,
      reader: server.options.reader,
      writes: server.options.writes,
    },
    {
      segments: destination.segments,
      bytes: source.bytes,
      ifMatch: null,
      grant: dav.grant,
    },
  );
  // A refused save keeps the temporary file: the editor still has its work.
  if (outcome.status === 204) server.scratch.delete(userId, path.segments);
  return saved(outcome);
}

function saved(outcome: SaveOutcome): Response {
  return outcome.status === 204
    ? new Response(null, {
        status: 204,
        headers: outcome.etag ? { ETag: outcome.etag } : {},
      })
    : new Response(outcome.message, { status: outcome.status });
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
    headers: { DAV: "1", Allow: ALLOW, "MS-Author-Via": "DAV" },
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
