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

  it("fails with the URL at once when the source answers with an error", async () => {
    const statuses: number[] = [];
    const get = createPoliteFetch({
      cacheDir,
      userAgent: "book-import (test@example.org)",
      minIntervalMs: 0,
      fetchFn: async () => {
        statuses.push(404);
        return new Response("nope", { status: 404 });
      },
    });

    expect(get("https://example.org/missing")).rejects.toThrow(
      "404 https://example.org/missing",
    );
    await Bun.sleep(5);
    expect(statuses).toHaveLength(1);
  });

  it("asks again after a pause when the source is briefly unavailable", async () => {
    const answers = [500, 429, 200];
    const calls: number[] = [];
    const get = createPoliteFetch({
      cacheDir,
      userAgent: "book-import (test@example.org)",
      minIntervalMs: 0,
      retryDelayMs: 20,
      fetchFn: async () => {
        calls.push(Date.now());
        const status = answers.shift() ?? 200;
        return new Response(status === 200 ? "at last" : "busy", { status });
      },
    });

    expect(await get("https://example.org/busy")).toBe("at last");
    expect(calls).toHaveLength(3);
    expect((calls[1] ?? 0) - (calls[0] ?? 0)).toBeGreaterThanOrEqual(15);
  });

  it("gives up with the URL when the source stays unavailable", () => {
    const get = createPoliteFetch({
      cacheDir,
      userAgent: "book-import (test@example.org)",
      minIntervalMs: 0,
      retryDelayMs: 1,
      fetchFn: async () => new Response("down", { status: 503 }),
    });

    expect(get("https://example.org/down")).rejects.toThrow(
      "503 https://example.org/down",
    );
  });
});
