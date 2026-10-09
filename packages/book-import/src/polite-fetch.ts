import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PoliteFetchOptions {
  /** Responses are kept here and never fetched again. */
  cacheDir: string;
  /** Names the importer and a contact address to the source. */
  userAgent: string;
  /** Minimum time between two requests to the source. */
  minIntervalMs: number;
  /** Headers a source asks for, such as the cookie of its bot check. */
  headersFor?: (url: string) => Record<string, string>;
  /** First pause before asking again when the source is unavailable; doubles each time. */
  retryDelayMs?: number;
  fetchFn?: FetchText;
}

/** The part of `fetch` the importer uses. */
export type FetchText = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<Response>;

/** Text from a source, kept in the cache; bytes, such as page images, not kept. */
export type PoliteFetch = ((url: string) => Promise<string>) & {
  bytes: (url: string) => Promise<Uint8Array>;
};

function cachePath(cacheDir: string, url: string): string {
  return join(
    cacheDir,
    `${createHash("sha256").update(url).digest("hex")}.txt`,
  );
}

/** Answers that mean the source is briefly unavailable, not that the page is wrong. */
function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

const RETRIES = 4;

async function readCached(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    // A missing cache entry means the page has not been fetched yet.
    return null;
  }
}

/**
 * Fetch text from a source one request at a time, at most one per interval,
 * identifying the importer and serving every repeat from the cache. A source
 * that is briefly unavailable is asked again after a growing pause.
 */
export function createPoliteFetch(options: PoliteFetchOptions): PoliteFetch {
  const fetchFn = options.fetchFn ?? fetch;
  const state = { queue: Promise.resolve(), last: 0 };

  const retryDelayMs = options.retryDelayMs ?? 5000;

  // A timer may end a little early under load; the clock decides.
  const waitTurn = async (): Promise<void> => {
    const wait = state.last + options.minIntervalMs - Date.now();
    if (wait <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, wait));
    return waitTurn();
  };

  const request = async (url: string, retries: number): Promise<Response> => {
    await waitTurn();
    const pending = fetchFn(url, {
      headers: {
        "user-agent": options.userAgent,
        ...(options.headersFor?.(url) ?? {}),
      },
    });
    // The interval runs from the request, not from before it.
    state.last = Date.now();
    const response = await pending;
    if (response.ok) return response;
    if (retries > 0 && isTransient(response.status)) {
      const pause = retryDelayMs * 2 ** (RETRIES - retries);
      await new Promise((resolve) => setTimeout(resolve, pause));
      return request(url, retries - 1);
    }
    throw new Error(`${response.status} ${url}`);
  };

  // Requests wait their turn in one queue, whatever they fetch.
  const queued = (url: string): Promise<Response> => {
    const turn = state.queue.then(() => request(url, RETRIES));
    state.queue = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  };

  const text = async (url: string): Promise<string> => {
    const path = cachePath(options.cacheDir, url);
    const cached = await readCached(path);
    if (cached !== null) return cached;
    const body = await (await queued(url)).text();
    await mkdir(options.cacheDir, { recursive: true });
    await writeFile(path, body);
    return body;
  };

  return Object.assign(text, {
    bytes: async (url: string): Promise<Uint8Array> =>
      new Uint8Array(await (await queued(url)).arrayBuffer()),
  });
}

/** Where the importer keeps what it fetched and recognised. */
export function importerCacheDir(): string {
  return (
    process.env["BOOK_IMPORT_CACHE"] ?? join(homedir(), ".cache", "book-import")
  );
}

/** The importer's fetch: cached in the user's cache, one request a second. */
export function createImporterFetch(): PoliteFetch {
  return createPoliteFetch({
    cacheDir: importerCacheDir(),
    userAgent: "rizom-brains-book-import (yeehaa@rizom.ai)",
    minIntervalMs: 1000,
    // The Textarchiv lets a client through its bot check with this cookie.
    headersFor: (url) =>
      url.startsWith("https://www.deutschestextarchiv.de/")
        ? { cookie: "verified=1" }
        : {},
  });
}
