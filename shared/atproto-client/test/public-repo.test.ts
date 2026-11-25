import { describe, expect, it } from "bun:test";
import type { FetchLike } from "@brains/utils/fetch-like";
import { UnsafePublicResourceError } from "@brains/utils/safe-public-fetch";
import { PublicRepoReader } from "../src";

const REPO = "did:plc:author";
const PDS = "https://pds.author.example";
const POSTS = "ai.rizom.brain.post";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function post(rkey: string): {
  uri: string;
  cid: string;
  value: Record<string, unknown>;
} {
  return {
    uri: `at://${REPO}/${POSTS}/${rkey}`,
    cid: `cid-${rkey}`,
    value: { title: `Essay ${rkey}` },
  };
}

/**
 * The public network as one author's repo: the PLC directory names its PDS,
 * a resolver knows its handle, and the PDS serves its records a page at a
 * time. Every address asked for is kept.
 */
function network(
  input: {
    pdsEndpoint?: string;
    rkeys?: string[];
  } = {},
): { fetch: FetchLike; urls: string[] } {
  const rkeys = input.rkeys ?? [];
  const urls: string[] = [];
  const fetch: FetchLike = async (request) => {
    const url = new URL(String(request));
    urls.push(url.toString());
    if (url.href === `https://plc.directory/${encodeURIComponent(REPO)}`) {
      return jsonResponse({
        id: REPO,
        service: [
          {
            id: "#atproto_pds",
            type: "AtprotoPersonalDataServer",
            serviceEndpoint: input.pdsEndpoint ?? PDS,
          },
        ],
      });
    }
    if (url.pathname === "/xrpc/com.atproto.identity.resolveHandle") {
      return url.searchParams.get("handle") === "author.example"
        ? jsonResponse({ did: REPO })
        : jsonResponse({ message: "Unable to resolve handle" }, 400);
    }
    if (url.pathname === "/xrpc/com.atproto.repo.listRecords") {
      const limit = Number(url.searchParams.get("limit"));
      const cursor = url.searchParams.get("cursor");
      const start = cursor ? rkeys.indexOf(cursor) + 1 : 0;
      const page = rkeys.slice(start, start + limit);
      const last = page.at(-1);
      return jsonResponse({
        records: page.map(post),
        ...(last !== undefined &&
          start + limit < rkeys.length && { cursor: last }),
      });
    }
    if (url.pathname === "/xrpc/com.atproto.repo.getRecord") {
      const rkey = url.searchParams.get("rkey") ?? "";
      return rkeys.includes(rkey)
        ? jsonResponse(post(rkey))
        : jsonResponse({ message: "Could not locate record" }, 400);
    }
    return jsonResponse({ message: "Not found" }, 404);
  };
  return { fetch, urls };
}

function reader(
  fetch: FetchLike,
  resolveHostname: (hostname: string) => Promise<string[]> = async () => [
    "203.0.114.10",
  ],
): PublicRepoReader {
  return new PublicRepoReader({
    fetch,
    handleResolverEndpoint: "https://resolver.example",
    resolveHostname,
  });
}

describe("PublicRepoReader", () => {
  it("pages through a repo's collection", async () => {
    const { fetch, urls } = network({ rkeys: ["a", "b", "c", "d", "e"] });

    const repo = await reader(fetch).open(REPO);
    const records = await repo.listRecords(POSTS, { pageSize: 2 });

    expect(repo.repoDid).toBe(REPO);
    expect(records).toEqual(["a", "b", "c", "d", "e"].map(post));
    const listing = `${PDS}/xrpc/com.atproto.repo.listRecords?repo=did%3Aplc%3Aauthor&collection=${POSTS}&limit=2`;
    expect(urls).toEqual([
      `https://plc.directory/${encodeURIComponent(REPO)}`,
      listing,
      `${listing}&cursor=b`,
      `${listing}&cursor=d`,
    ]);
  });

  it("refuses a repo whose PDS is not a public address", async () => {
    const { fetch, urls } = network({ rkeys: ["a"] });

    const failure = await reader(fetch, async () => ["10.0.0.5"])
      .open(REPO)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(UnsafePublicResourceError);
    expect(urls.filter((url) => url.startsWith(PDS))).toEqual([]);
  });

  it("refuses a repo whose PDS is not served over HTTPS", async () => {
    const { fetch } = network({ pdsEndpoint: "http://pds.author.example" });

    const failure = await reader(fetch)
      .open(REPO)
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(failure).toBeInstanceOf(UnsafePublicResourceError);
  });

  it("finds a repo by its handle", async () => {
    const { fetch, urls } = network({ rkeys: ["a"] });

    const repo = await reader(fetch).open("author.example");

    expect(repo.repoDid).toBe(REPO);
    expect(repo.pdsEndpoint).toBe(PDS);
    expect(urls[0]).toBe(
      "https://resolver.example/xrpc/com.atproto.identity.resolveHandle?handle=author.example",
    );
  });

  it("says so when a handle resolves to no repo", async () => {
    const { fetch } = network();

    expect(reader(fetch).open("nobody.example")).rejects.toThrow(
      "Could not resolve AT Protocol repo: nobody.example",
    );
  });

  it("reads one record", async () => {
    const { fetch } = network({ rkeys: ["a"] });

    const repo = await reader(fetch).open(REPO);

    expect(await repo.getRecord({ collection: POSTS, rkey: "a" })).toEqual(
      post("a"),
    );
    expect(repo.getRecord({ collection: POSTS, rkey: "gone" })).rejects.toThrow(
      "Could not locate record",
    );
  });
});
