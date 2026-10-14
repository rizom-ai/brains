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

  it("sends the headers a source asks for", async () => {
    const sent: Array<Record<string, string>> = [];
    const get = createPoliteFetch({
      cacheDir,
      userAgent: "book-import (test@example.org)",
      minIntervalMs: 0,
      headersFor: (url) =>
        url.includes("textarchiv") ? { cookie: "verified=1" } : {},
      fetchFn: async (_, init) => {
        sent.push(init.headers);
        return new Response("text");
      },
    });

    await get("https://www.deutschestextarchiv.de/book/download_xml/x");
    await get("https://example.org/y");

    expect(sent[0]?.["cookie"]).toBe("verified=1");
    expect(sent[1]?.["cookie"]).toBeUndefined();
  });

  it("reads a page in the charset its header or its meta tag names, else as UTF-8", async () => {
    const latin1 = (text: string): Uint8Array<ArrayBuffer> =>
      new Uint8Array([...text].map((char) => char.charCodeAt(0)));
    const pages: Record<string, Response> = {
      "https://example.org/meta": new Response(
        latin1(
          '<HTML><HEAD><META HTTP-EQUIV="Content-Type"; CONTENT="text/html; charset=ISO-8859-1"></HEAD><BODY>für \u0085</BODY></HTML>',
        ),
        { headers: { "content-type": "text/html" } },
      ),
      "https://example.org/header": new Response(latin1("für"), {
        headers: { "content-type": "text/plain; charset=iso-8859-1" },
      }),
      "https://example.org/plain": new Response("für …"),
    };
    const get = createPoliteFetch({
      cacheDir,
      userAgent: "book-import (test@example.org)",
      minIntervalMs: 0,
      fetchFn: async (url) => pages[url] ?? new Response("", { status: 404 }),
    });

    expect(await get("https://example.org/meta")).toContain("für …");
    expect(await get("https://example.org/header")).toBe("für");
    expect(await get("https://example.org/plain")).toBe("für …");
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

  it("fetches bytes in the same queue, at the same interval, without keeping them", async () => {
    const { calls, fetchFn } = recorder();
    const get = createPoliteFetch({
      cacheDir,
      userAgent: "book-import (test@example.org)",
      minIntervalMs: 50,
      fetchFn,
    });

    const [, image, again] = await Promise.all([
      get("https://example.org/page"),
      get.bytes("https://example.org/n1.jpg"),
      get.bytes("https://example.org/n1.jpg"),
    ]);

    expect(new TextDecoder().decode(image)).toBe(
      "body of https://example.org/n1.jpg",
    );
    expect(again).toEqual(image);
    expect(calls.map((call) => call.url).sort()).toEqual([
      "https://example.org/n1.jpg",
      "https://example.org/n1.jpg",
      "https://example.org/page",
    ]);
    const gaps = calls
      .slice(1)
      .map((call, index) => call.at - (calls[index]?.at ?? 0));
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
