import type { AuthAppPasswordGrant } from "@brains/contracts";
import type { WebRouteDefinition } from "@brains/sdk/internal/interface-runtime";
import { permissionToVisibilityScope } from "@brains/sdk/internal/service-runtime";
import {
  DavTree,
  type DavFile,
  type DavNode,
  type DavReader,
} from "./dav-tree";
import { davErrorXml, multistatusXml, type DavResourceProps } from "./dav-xml";

export interface DavRoutesOptions {
  /** Where the drive is mounted, without a trailing slash: `/dav`. */
  basePath: string;
  /** The name a client shows when it asks for the app password. */
  realm: string;
  reader: DavReader;
  /** The person behind a request's app password, if it carries a valid one. */
  resolveAppPassword: (
    request: Request,
  ) => Promise<AuthAppPasswordGrant | undefined>;
}

const READ_METHODS = ["OPTIONS", "GET", "HEAD", "PROPFIND"] as const;
type ReadMethod = (typeof READ_METHODS)[number];
const ALLOW = READ_METHODS.join(", ");
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

interface DavRequest {
  request: Request;
  tree: DavTree;
  /** Decoded names below the mount, or undefined when the path names nothing. */
  segments: string[] | undefined;
  /** A trailing slash asks for a folder; a file never answers to one. */
  asFolder: boolean;
}

/**
 * The read side of a WebDAV class 1 server (RFC 4918) over a brain's
 * entities: browse with PROPFIND, read with GET and HEAD. Each method is its
 * own prefix route; the routes are public to the host and authenticate every
 * request themselves, with an app password.
 */
export function createDavRoutes(
  options: DavRoutesOptions,
): WebRouteDefinition[] {
  const handlers: Record<ReadMethod, (dav: DavRequest) => Promise<Response>> = {
    OPTIONS: async () => optionsResponse(),
    GET: (dav) => read(dav, true),
    HEAD: (dav) => read(dav, false),
    PROPFIND: (dav) => propfind(dav, options.basePath),
  };

  return READ_METHODS.map((method): WebRouteDefinition => ({
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

      const path = pathBelow(options.basePath, request);
      return inert(
        await handlers[method]({
          request,
          tree: new DavTree(
            options.reader,
            permissionToVisibilityScope(grant.principal.permissionLevel),
          ),
          segments: path?.segments,
          asFolder: path?.asFolder ?? false,
        }),
      );
    },
  }));
}

async function nodeAt(dav: DavRequest): Promise<DavNode | undefined> {
  if (!dav.segments) return undefined;
  const node = await dav.tree.resolve(dav.segments);
  return node?.kind === "file" && dav.asFolder ? undefined : node;
}

async function read(dav: DavRequest, withBody: boolean): Promise<Response> {
  const node = await nodeAt(dav);
  if (!node) return notFound();
  if (node.kind === "folder") {
    return new Response("A folder has no content to read", {
      status: 405,
      headers: { Allow: "OPTIONS, PROPFIND" },
    });
  }
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

async function propfind(dav: DavRequest, basePath: string): Promise<Response> {
  // No Depth header means infinity (RFC 4918 §9.1), which is never served.
  const depth = dav.request.headers.get("depth");
  if (depth !== "0" && depth !== "1") {
    return new Response(davErrorXml("propfind-finite-depth"), {
      status: 403,
      headers: { "Content-Type": XML_TYPE },
    });
  }

  const node = await nodeAt(dav);
  if (!node) return notFound();
  const children =
    node.kind === "folder" && depth === "1"
      ? await dav.tree.children(node.segments)
      : [];
  return new Response(
    multistatusXml(
      [node, ...children].map((entry) => propsOf(entry, basePath)),
    ),
    { status: 207, headers: { "Content-Type": XML_TYPE } },
  );
}

function propsOf(node: DavNode, basePath: string): DavResourceProps {
  const encoded = node.segments.map(encodeURIComponent).join("/");
  const displayName = node.segments[node.segments.length - 1] ?? "";
  if (node.kind === "folder") {
    return {
      href: encoded ? `${basePath}/${encoded}/` : `${basePath}/`,
      displayName,
      collection: true,
    };
  }
  return { href: `${basePath}/${encoded}`, displayName, ...fileProps(node) };
}

function fileProps(
  file: DavFile,
): Omit<DavResourceProps, "href" | "displayName"> {
  return {
    collection: false,
    contentLength: file.size,
    contentType: file.contentType,
    etag: file.etag,
    lastModified: file.modified,
  };
}

/** The decoded names a request path holds below the mount. */
function pathBelow(
  basePath: string,
  request: Request,
): { segments: string[]; asFolder: boolean } | undefined {
  const { pathname } = new URL(request.url);
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
    return undefined;
  }
  const rest = pathname.slice(basePath.length + 1);
  if (rest === "") return { segments: [], asFolder: true };

  const asFolder = rest.endsWith("/");
  const names = (asFolder ? rest.slice(0, -1) : rest).split("/");
  const segments = names.map(decodeSegment);
  return segments.every((segment) => segment !== undefined)
    ? { segments, asFolder }
    : undefined;
}

function decodeSegment(name: string): string | undefined {
  try {
    return decodeURIComponent(name);
  } catch {
    // Not valid percent-encoding: the path names nothing.
    return undefined;
  }
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

function notFound(): Response {
  return new Response("Not found", { status: 404 });
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
