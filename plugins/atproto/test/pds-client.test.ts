import { describe, expect, it } from "bun:test";
import type { FetchLike } from "@brains/utils/fetch-like";
import { AtprotoPdsClient } from "../src";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AtprotoPdsClient", () => {
  it("creates a session with app password credentials", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: FetchLike = (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      return Promise.resolve(
        jsonResponse({
          did: "did:plc:repo",
          handle: "brain.example.com",
          accessJwt: "access-token",
          refreshJwt: "refresh-token",
        }),
      );
    };

    const client = new AtprotoPdsClient({
      pdsEndpoint: "https://pds.example.com/",
      identifier: "brain.example.com",
      appPassword: "secret",
      fetch: fetchMock,
    });

    const session = await client.createSession();

    expect(session.did).toBe("did:plc:repo");
    expect(calls[0]?.url).toBe(
      "https://pds.example.com/xrpc/com.atproto.server.createSession",
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(
      JSON.stringify({ identifier: "brain.example.com", password: "secret" }),
    );
  });

  it("creates records with an authenticated session", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: FetchLike = (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("com.atproto.server.createSession")) {
        return Promise.resolve(
          jsonResponse({
            did: "did:plc:repo",
            handle: "brain.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({ uri: "at://repo/record", cid: "cid" }),
      );
    };

    const client = new AtprotoPdsClient({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
      fetch: fetchMock,
    });

    const result = await client.createRecord({
      repo: "did:plc:repo",
      collection: "ai.rizom.brain.card",
      rkey: "self",
      record: { name: "Brain", createdAt: "2026-05-28T00:00:00.000Z" },
    });

    expect(result.uri).toBe("at://repo/record");
    expect(calls[1]?.url).toBe(
      "https://pds.example.com/xrpc/com.atproto.repo.createRecord",
    );
    expect(calls[1]?.init?.headers).toEqual({
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    });
    expect(calls[1]?.init?.body).toBe(
      JSON.stringify({
        repo: "did:plc:repo",
        collection: "ai.rizom.brain.card",
        record: { name: "Brain", createdAt: "2026-05-28T00:00:00.000Z" },
        rkey: "self",
      }),
    );
  });

  it("puts records with an authenticated session", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: FetchLike = (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("com.atproto.server.createSession")) {
        return Promise.resolve(
          jsonResponse({
            did: "did:plc:repo",
            handle: "brain.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({ uri: "at://repo/card/self", cid: "cid" }),
      );
    };

    const client = new AtprotoPdsClient({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
      fetch: fetchMock,
    });

    const result = await client.putRecord({
      repo: "did:plc:repo",
      collection: "ai.rizom.brain.card",
      rkey: "self",
      validate: false,
      record: { name: "Brain", createdAt: "2026-05-28T00:00:00.000Z" },
    });

    expect(result.uri).toBe("at://repo/card/self");
    expect(calls[1]?.url).toBe(
      "https://pds.example.com/xrpc/com.atproto.repo.putRecord",
    );
    expect(calls[1]?.init?.headers).toEqual({
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    });
    expect(calls[1]?.init?.body).toBe(
      JSON.stringify({
        repo: "did:plc:repo",
        collection: "ai.rizom.brain.card",
        record: { name: "Brain", createdAt: "2026-05-28T00:00:00.000Z" },
        rkey: "self",
        validate: false,
      }),
    );
  });

  it("gets records without creating an authenticated session", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: FetchLike = (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      return Promise.resolve(
        jsonResponse({
          uri: "at://did:plc:repo/ai.rizom.brain.card/self",
          cid: "cid",
          value: { name: "Brain", createdAt: "2026-05-28T00:00:00.000Z" },
        }),
      );
    };

    const client = new AtprotoPdsClient({
      pdsEndpoint: "https://pds.example.com",
      identifier: "",
      appPassword: "",
      fetch: fetchMock,
    });

    const result = await client.getRecord({
      repo: "did:plc:repo",
      collection: "ai.rizom.brain.card",
      rkey: "self",
    });

    expect(result.uri).toBe("at://did:plc:repo/ai.rizom.brain.card/self");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://pds.example.com/xrpc/com.atproto.repo.getRecord?repo=did%3Aplc%3Arepo&collection=ai.rizom.brain.card&rkey=self",
    );
    expect(calls[0]?.init?.method).toBe("GET");
  });

  it("uploads blobs with an authenticated session", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock: FetchLike = (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("com.atproto.server.createSession")) {
        return Promise.resolve(
          jsonResponse({
            did: "did:plc:repo",
            handle: "brain.example.com",
            accessJwt: "access-token",
            refreshJwt: "refresh-token",
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          blob: {
            ref: { $link: "blob-cid" },
            mimeType: "text/plain",
            size: 5,
          },
        }),
      );
    };

    const client = new AtprotoPdsClient({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
      fetch: fetchMock,
    });

    const result = await client.uploadBlob({
      data: Buffer.from("hello"),
      mimeType: "text/plain",
    });

    expect(result.blob).toEqual({
      ref: { $link: "blob-cid" },
      mimeType: "text/plain",
      size: 5,
    });
    expect(calls[1]?.url).toBe(
      "https://pds.example.com/xrpc/com.atproto.repo.uploadBlob",
    );
    expect(calls[1]?.init?.headers).toEqual({
      Authorization: "Bearer access-token",
      "Content-Type": "text/plain",
    });
    expect(calls[1]?.init?.body).toBeInstanceOf(Blob);
  });

  it("surfaces AT Protocol error messages", async () => {
    const fetchMock: FetchLike = () =>
      Promise.resolve(jsonResponse({ message: "Invalid identifier" }, 400));

    const client = new AtprotoPdsClient({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
      fetch: fetchMock,
    });

    try {
      await client.createSession();
      throw new Error("Expected createSession to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Invalid identifier");
    }
  });

  it("surfaces the HTTP status when an error body is not JSON", async () => {
    const fetchMock: FetchLike = () =>
      Promise.resolve(
        new Response("<html>Bad Gateway</html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
      );

    const client = new AtprotoPdsClient({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
      fetch: fetchMock,
    });

    expect(client.createSession()).rejects.toThrow(
      "AT Protocol request failed with 502",
    );
  });

  it("surfaces the HTTP status when an error body is empty", async () => {
    const fetchMock: FetchLike = () =>
      Promise.resolve(new Response(null, { status: 503 }));

    const client = new AtprotoPdsClient({
      pdsEndpoint: "https://pds.example.com",
      identifier: "brain.example.com",
      appPassword: "secret",
      fetch: fetchMock,
    });

    expect(client.createSession()).rejects.toThrow(
      "AT Protocol request failed with 503",
    );
  });
});
