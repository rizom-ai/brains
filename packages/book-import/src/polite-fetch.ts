import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PoliteFetchOptions {
  /** Responses are kept here and never fetched again. */
  cacheDir: string;
  /** Names the importer and a contact address to the source. */
  userAgent: string;
  /** Minimum time between two requests to the source. */
  minIntervalMs: number;
  fetchFn?: FetchText;
}

/** The part of `fetch` the importer uses. */
export type FetchText = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<Response>;

export type PoliteFetch = (url: string) => Promise<string>;

function cachePath(cacheDir: string, url: string): string {
  return join(
    cacheDir,
    `${createHash("sha256").update(url).digest("hex")}.txt`,
  );
}

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
 * identifying the importer and serving every repeat from the cache.
 */
export function createPoliteFetch(options: PoliteFetchOptions): PoliteFetch {
  const fetchFn = options.fetchFn ?? fetch;
  const state = { queue: Promise.resolve(), last: 0 };

  const request = async (url: string): Promise<string> => {
    const wait = state.last + options.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    state.last = Date.now();
    const response = await fetchFn(url, {
      headers: { "user-agent": options.userAgent },
    });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.text();
  };

  return async (url) => {
    const path = cachePath(options.cacheDir, url);
    const cached = await readCached(path);
    if (cached !== null) return cached;

    const turn = state.queue.then(() => request(url));
    state.queue = turn.then(
      () => undefined,
      () => undefined,
    );
    const text = await turn;
    await mkdir(options.cacheDir, { recursive: true });
    await writeFile(path, text);
    return text;
  };
}
