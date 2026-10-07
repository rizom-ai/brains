import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPoliteFetch, type FetchText } from "../src/polite-fetch";

interface Call {
  url: string;
  userAgent: string | undefined;
  at: number;
}

function recorder(): { calls: Call[]; fetchFn: FetchText } {
  const calls: Call[] = [];
  const fetchFn: FetchText = async (url, init) => {
    calls.push({ url, userAgent: init.headers["user-agent"], at: Date.now() });
    return new Response(`body of ${url}`);
  };
  return { calls, fetchFn };
}

describe("createPoliteFetch", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "book-cache-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("identifies itself and serves repeats from the cache", async () => {
    const { calls, fetchFn } = recorder();
    const get = createPoliteFetch({
      cacheDir,
      userAgent: "book-import (test@example.org)",
      minIntervalMs: 0,
      fetchFn,
    });

    expect(await get("https://example.org/a")).toBe(
      "body of https://example.org/a",
    );
    expect(await get("https://example.org/a")).toBe(
      "body of https://example.org/a",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.userAgent).toBe("book-import (test@example.org)");
  });

  it("keeps requests at least the minimum interval apart", async () => {
    const { calls, fetchFn } = recorder();
    const get = createPoliteFetch({
      cacheDir,
      userAgent: "book-import (test@example.org)",
      minIntervalMs: 50,
      fetchFn,
    });

    await Promise.all([
      get("https://example.org/1"),
      get("https://example.org/2"),
      get("https://example.org/3"),
    ]);

    const gaps = calls
      .slice(1)
      .map((call, index) => call.at - (calls[index]?.at ?? 0));
    expect(gaps).toHaveLength(2);
    expect(gaps.every((gap) => gap >= 45)).toBe(true);
  });

  it("fails with the URL when the source answers with an error", () => {
    const get = createPoliteFetch({
      cacheDir,
      userAgent: "book-import (test@example.org)",
      minIntervalMs: 0,
      fetchFn: async () => new Response("nope", { status: 404 }),
    });

    expect(get("https://example.org/missing")).rejects.toThrow(
      "404 https://example.org/missing",
    );
  });
});
