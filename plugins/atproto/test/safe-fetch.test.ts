import { describe, expect, it, mock } from "bun:test";
import {
  assertSafePublicHttpsUrl,
  createSafePublicFetch,
} from "@brains/utils/safe-public-fetch";

const resolvePublic = async (): Promise<string[]> => ["93.184.216.34"];

describe("ATProto discovery safe egress", () => {
  it("rejects non-HTTPS and private-address endpoints", () => {
    expect(
      assertSafePublicHttpsUrl("http://example.com", resolvePublic),
    ).rejects.toThrow(/HTTPS/);
    expect(
      assertSafePublicHttpsUrl("https://127.0.0.1/xrpc", async () => [
        "127.0.0.1",
      ]),
    ).rejects.toThrow(/non-public/);
    expect(
      assertSafePublicHttpsUrl("https://pds.example.com/xrpc", async () => [
        "10.0.0.8",
      ]),
    ).rejects.toThrow(/non-public/);
    expect(
      assertSafePublicHttpsUrl("https://pds.example.com/xrpc", async () => [
        "0:0:0:0:0:0:0:1",
      ]),
    ).rejects.toThrow(/non-public/);
    expect(
      assertSafePublicHttpsUrl("https://pds.example.com/xrpc", async () => [
        "64:ff9b::7f00:1",
      ]),
    ).rejects.toThrow(/non-public/);
  });

  it("revalidates every redirect before following it", async () => {
    const fetchFn = mock(async () =>
      Response.redirect("https://127.0.0.1/internal", 302),
    );
    const safeFetch = createSafePublicFetch({
      fetchFn,
      resolveHostname: resolvePublic,
      timeoutMs: 1000,
      maxResponseBytes: 1024,
      maxRedirects: 2,
    });

    expect(safeFetch("https://pds.example.com/card")).rejects.toThrow(
      /non-public/,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("strips caller-supplied credentials from every public request", async () => {
    let observedHeaders = new Headers();
    let observedCredentials: RequestCredentials | undefined;
    const safeFetch = createSafePublicFetch({
      fetchFn: mock(async (_input, init) => {
        observedHeaders = new Headers(init?.headers);
        observedCredentials = init?.credentials;
        return new Response("ok");
      }),
      resolveHostname: resolvePublic,
      timeoutMs: 1000,
      maxResponseBytes: 1024,
      maxRedirects: 0,
    });

    await safeFetch("https://pds.example.com/card", {
      credentials: "include",
      headers: {
        authorization: "Bearer secret",
        cookie: "session=secret",
        "proxy-authorization": "Basic secret",
        "x-request-id": "safe-metadata",
      },
    });

    expect(observedCredentials).toBe("omit");
    expect(observedHeaders.get("authorization")).toBeNull();
    expect(observedHeaders.get("cookie")).toBeNull();
    expect(observedHeaders.get("proxy-authorization")).toBeNull();
    expect(observedHeaders.get("x-request-id")).toBe("safe-metadata");
  });

  it("caps response bytes before JSON parsing", async () => {
    const safeFetch = createSafePublicFetch({
      fetchFn: mock(
        async () =>
          new Response("x".repeat(2048), {
            headers: { "content-length": "2048" },
          }),
      ),
      resolveHostname: resolvePublic,
      timeoutMs: 1000,
      maxResponseBytes: 1024,
      maxRedirects: 0,
    });

    expect(safeFetch("https://pds.example.com/card")).rejects.toThrow(
      /exceeds 1024 bytes/,
    );
  });

  it("enforces a request timeout", async () => {
    const safeFetch = createSafePublicFetch({
      fetchFn: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        }),
      resolveHostname: resolvePublic,
      timeoutMs: 5,
      maxResponseBytes: 1024,
      maxRedirects: 0,
    });

    expect(safeFetch("https://pds.example.com/card")).rejects.toThrow();
  });
});
