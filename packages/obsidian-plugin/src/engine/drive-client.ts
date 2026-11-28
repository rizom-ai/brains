import { z } from "@brains/utils/zod";
import { bytesOf, textOf } from "./hash";
import { vaultShapesSchema, type VaultShape } from "../vault-files/shapes";

/** The first brain release with the drive's sync endpoints. */
export const MIN_BRAIN_VERSION = "0.2.0-alpha.769";

/** One HTTP exchange, as Obsidian's `requestUrl` and a test both make it. */
export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}

export interface HttpResponse {
  status: number;
  /** Header names in lower case. */
  headers: Record<string, string>;
  body: Uint8Array;
}

/** Send a request; throws only when the brain cannot be reached. */
export type HttpFetch = (request: HttpRequest) => Promise<HttpResponse>;

/** The brain could not be reached: nothing was changed by this request. */
export class DriveOfflineError extends Error {
  constructor(cause: unknown) {
    super("The brain cannot be reached", { cause });
    this.name = "DriveOfflineError";
  }
}

/**
 * The brain is there but not answering for now: a gateway or the brain
 * itself said so (502, 503, 504, 429), as during a deploy. Nothing was
 * changed by this request; it is tried again later.
 */
export class DriveUnavailableError extends Error {
  constructor(status: number) {
    super(`The brain is not answering for now (${status})`);
    this.name = "DriveUnavailableError";
  }
}

const UNAVAILABLE: ReadonlySet<number> = new Set([429, 502, 503, 504]);

/** The app password is wrong, revoked or expired. */
export class DriveAuthError extends Error {
  constructor() {
    super("The brain did not accept the app password");
    this.name = "DriveAuthError";
  }
}

/** The address answers, but has no drive there. */
export class DriveMissingError extends Error {
  constructor(status: number) {
    super(`No drive answers at this address (${status})`);
    this.name = "DriveMissingError";
  }
}

/** One file or folder the drive lists. */
export interface DriveEntry {
  /** Below the drive's root, `/`-separated, without a trailing slash. */
  path: string;
  folder: boolean;
  /** The version, quoted as the drive sends it. */
  etag?: string | undefined;
}

export interface DriveFile {
  bytes: Uint8Array;
  etag: string | undefined;
}

export interface PutOptions {
  /** Save only over this version. */
  ifMatch?: string | undefined;
  /** Save only when there is no file at the path yet. */
  ifAbsent?: boolean | undefined;
  /** When the save loses, keep it as a conflict in the brain. */
  keepAsConflict?: boolean | undefined;
}

export interface PutResult {
  status: number;
  /** The version the brain holds after the save. */
  etag: string | undefined;
  stored: "as-sent" | "other-form" | "conflict" | undefined;
  /** The conflict a losing save was kept as. */
  conflictId: string | undefined;
  /** Why a save was refused, as the brain said it. */
  message: string;
}

export interface DriveCredentials {
  /** The brain's address, as the person typed it. */
  address: string;
  username: string;
  password: string;
}

/** The drive's address for a brain's address: `<origin>/dav/`. */
export function driveUrl(address: string): URL {
  const trimmed = address.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withScheme);
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/dav$/, "")}/dav/`;
  url.search = "";
  url.hash = "";
  return url;
}

function basicAuth(username: string, password: string): string {
  const binary = [...bytesOf(`${username}:${password}`)]
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return `Basic ${btoa(binary)}`;
}

type DriveChangesSchema = z.ZodUnion<
  readonly [
    z.ZodObject<{ cursor: z.ZodString; reset: z.ZodLiteral<true> }>,
    z.ZodObject<{ cursor: z.ZodString; types: z.ZodArray<z.ZodString> }>,
  ]
>;

/** What the drive answers at `.brain/changes`. */
export const driveChangesSchema: DriveChangesSchema = z.union([
  z.object({ cursor: z.string().min(1), reset: z.literal(true) }),
  z.object({ cursor: z.string().min(1), types: z.array(z.string()) }),
]);

export type DriveChanges = z.output<DriveChangesSchema>;

/** Text read as JSON, or nothing when it is not JSON. */
export function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON: the caller's schema refuses undefined.
    return undefined;
  }
}

/** Path segments as they go into a URL; `(` and `)` too, for Markdown. */
export function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29"),
    )
    .join("/");
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function unescapeXml(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|apos);/g,
    (entity) => XML_ENTITIES[entity] ?? entity,
  );
}

function elementText(xml: string, name: string): string | undefined {
  const match = new RegExp(
    `<(?:[A-Za-z]+:)?${name}>([\\s\\S]*?)</(?:[A-Za-z]+:)?${name}>`,
  ).exec(xml);
  return match?.[1] === undefined ? undefined : unescapeXml(match[1]);
}

/** The entries of a 207 Multi-Status answer, below the drive's root. */
export function parseMultistatus(xml: string, rootPath: string): DriveEntry[] {
  const responses = xml.match(
    /<(?:[A-Za-z]+:)?response>[\s\S]*?<\/(?:[A-Za-z]+:)?response>/g,
  );
  return (responses ?? []).flatMap((response): DriveEntry[] => {
    const href = elementText(response, "href");
    if (href === undefined) return [];
    const pathname = href.startsWith("http") ? new URL(href).pathname : href;
    if (!pathname.startsWith(rootPath)) return [];
    const path = pathname
      .slice(rootPath.length)
      .replace(/\/$/, "")
      .split("/")
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    const folder = /<(?:[A-Za-z]+:)?collection\s*\/>/.test(response);
    const etag = elementText(response, "getetag");
    return [{ path, folder, ...(etag !== undefined && { etag }) }];
  });
}

/**
 * The brain's drive as a sync client uses it: every request names itself a
 * sync client (`X-Brain-Sync`), so the drive answers with what it stores.
 */
export class DriveClient {
  private readonly root: URL;
  private readonly authorization: string;
  private readonly fetch: HttpFetch;

  constructor(credentials: DriveCredentials, fetch: HttpFetch) {
    this.root = driveUrl(credentials.address);
    this.authorization = basicAuth(credentials.username, credentials.password);
    this.fetch = fetch;
  }

  /** The brain's address, for links into it. */
  get origin(): string {
    return this.root.origin;
  }

  private async send(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: Uint8Array,
    query?: Record<string, string>,
  ): Promise<HttpResponse> {
    const target = new URL(encodePath(path), this.root);
    for (const [name, value] of Object.entries(query ?? {})) {
      target.searchParams.set(name, value);
    }
    const url = target.toString();
    const response = await this.fetch({
      url,
      method,
      headers: {
        Authorization: this.authorization,
        "X-Brain-Sync": "1",
        ...headers,
      },
      ...(body !== undefined && { body }),
    }).catch((error: unknown) => {
      throw new DriveOfflineError(error);
    });
    if (response.status === 401) throw new DriveAuthError();
    if (UNAVAILABLE.has(response.status)) {
      throw new DriveUnavailableError(response.status);
    }
    return response;
  }

  /** The files and folders directly inside a folder; "" is the root. */
  async list(folder: string): Promise<DriveEntry[]> {
    const path = folder === "" ? "" : `${folder}/`;
    const response = await this.send("PROPFIND", path, { Depth: "1" });
    if (response.status !== 207) {
      if (folder === "") throw new DriveMissingError(response.status);
      throw new Error(`Listing ${folder} answered ${response.status}`);
    }
    return parseMultistatus(textOf(response.body), this.root.pathname).filter(
      (entry) => entry.path !== folder && entry.path !== "",
    );
  }

  /** Whether the app password may write, from an empty save it cannot make. */
  async check(): Promise<{ writable: boolean }> {
    await this.list("");
    // A read-only app password is refused before anything is looked at.
    const response = await this.send("PROPPATCH", "");
    return { writable: response.status !== 403 };
  }

  /**
   * The brain's types, as the vault writes templates, fileClasses and bases
   * from them; nothing from a brain whose drive does not describe them.
   */
  async vaultShapes(): Promise<VaultShape[] | undefined> {
    const response = await this.send("GET", ".brain/vault-shapes.json");
    if (response.status !== 200) return undefined;
    // Anything but the description (a proxy's page, say) is no description.
    const parsed = vaultShapesSchema.safeParse(jsonOf(textOf(response.body)));
    return parsed.success ? parsed.data.shapes : undefined;
  }

  /**
   * Whether the brain's drive answers a sync client: the endpoints this
   * plugin syncs through, there from the brain release `MIN_BRAIN_VERSION` names. An older
   * brain answers them as any unknown path. An address with no drive at all
   * is told apart: that throws, as a listing does.
   */
  async supportsSync(): Promise<boolean> {
    const response = await this.send("GET", ".brain/vault-shapes.json");
    if (response.status !== 404) return true;
    await this.list("");
    return false;
  }

  /**
   * What changed in the brain since a cursor. The brain holds the ask until
   * something changes or the wait is over. Nothing from a brain that has no
   * change feed.
   */
  async changes(
    since: string | undefined,
    waitSeconds: number,
  ): Promise<DriveChanges | undefined> {
    const response = await this.send("GET", ".brain/changes", {}, undefined, {
      ...(since !== undefined && { since }),
      wait: String(waitSeconds),
    });
    if (response.status === 404) return undefined;
    if (response.status !== 200) {
      throw new Error(`Asking for changes answered ${response.status}`);
    }
    return driveChangesSchema.parse(jsonOf(textOf(response.body)));
  }

  async get(path: string): Promise<DriveFile | undefined> {
    const response = await this.send("GET", path);
    if (response.status === 404) return undefined;
    if (response.status !== 200) {
      throw new Error(`Reading ${path} answered ${response.status}`);
    }
    return { bytes: response.body, etag: response.headers["etag"] };
  }

  async put(
    path: string,
    bytes: Uint8Array,
    options: PutOptions,
  ): Promise<PutResult> {
    const response = await this.send(
      "PUT",
      path,
      {
        ...(options.ifMatch !== undefined && { "If-Match": options.ifMatch }),
        ...(options.ifAbsent && { "If-None-Match": "*" }),
        ...(options.keepAsConflict && { "X-Brain-Keep": "conflict" }),
      },
      bytes,
    );
    const stored = response.headers["x-brain-stored"];
    return {
      status: response.status,
      etag: response.headers["etag"],
      stored:
        stored === "as-sent" || stored === "other-form" || stored === "conflict"
          ? stored
          : undefined,
      conflictId: response.headers["x-brain-conflict"],
      message: textOf(response.body).trim(),
    };
  }

  /** Delete only the version named; the status says what happened. */
  async delete(path: string, ifMatch: string): Promise<number> {
    return (await this.send("DELETE", path, { "If-Match": ifMatch })).status;
  }

  /**
   * Tell the brain a conflict is settled: its Inbox entry is dismissed. The
   * status says how it went; a brain from before this answers 404 or 405.
   */
  async settleConflict(conflictId: string): Promise<number> {
    return (await this.send("DELETE", `.brain/conflicts/${conflictId}`)).status;
  }

  /** Rename a file; the status and the brain's reason say what happened. */
  async move(
    from: string,
    to: string,
  ): Promise<{ status: number; message: string }> {
    const destination = new URL(encodePath(to), this.root).toString();
    const response = await this.send("MOVE", from, {
      Destination: destination,
      Overwrite: "F",
    });
    return { status: response.status, message: textOf(response.body).trim() };
  }
}
