import { describe, expect, it } from "bun:test";
import type { AuthAppPasswordGrant } from "@brains/contracts";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { createDavRoutes } from "../src/dav-routes";
import { noWrites } from "./fake-brain";
import { entity, fakeReader } from "./fake-reader";

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const PNG_REF = `asset://sha256/${"a".repeat(64)}` as const;

const library: BaseEntity[] = [
  entity("note", "readme"),
  entity("note", "secret-plan", { visibility: "restricted" }),
  entity("post", "first"),
  entity("post", "second", { visibility: "shared" }),
  entity("post", "third"),
  entity("post", "board-only", { visibility: "restricted" }),
  entity("site-content", "home:hero"),
  entity("book", "dune"),
  entity("book-section", "dune:intro"),
  entity("book-section", "dune:arrakis"),
  // A contained entity with no container segment reads back as a book.
  entity("book-section", "orphan"),
  entity("image", "cover", {
    content: PNG_REF,
    metadata: { format: "png" },
  }),
  entity("image", "pending", { content: "", metadata: { format: "png" } }),
  entity("memo", "board", { visibility: "restricted" }),
];

type Level = "admin" | "trusted";

function grant(level: Level): AuthAppPasswordGrant {
  return {
    principal: {
      userId: `usr_${level}`,
      personId: `prsn_${level}`,
      displayName: level,
      role: level,
      status: "active",
      permissionLevel: level,
      isAnchor: false,
    },
    access: "read",
    appPasswordId: `pw_${level}`,
  };
}

function drive(): (
  method: string,
  path: string,
  options?: { as?: Level | "nobody"; headers?: Record<string, string> },
) => Promise<Response> {
  const routes = createDavRoutes({
    basePath: "/dav",
    realm: "Test Brain",
    writes: noWrites,
    reader: fakeReader({
      entities: library,
      containedIn: { "book-section": "book" },
      assets: { [PNG_REF]: PNG },
    }),
    resolveAppPassword: async (request) => {
      const who = request.headers.get("x-test-as");
      return who === "admin" || who === "trusted" ? grant(who) : undefined;
    },
  });
  return async (method, path, options = {}) => {
    const route = routes.find((candidate) => candidate.method === method);
    if (!route) throw new Error(`No ${method} route`);
    expect(route).toMatchObject({
      path: "/dav",
      match: "prefix",
      public: true,
    });
    return route.handler(
      new Request(`https://brain.example${path}`, {
        method,
        headers: {
          ...(options.as === "nobody"
            ? {}
            : { "x-test-as": options.as ?? "trusted" }),
          ...options.headers,
        },
      }),
    );
  };
}

/** Each response in a multistatus body: its href and the properties it names. */
function responses(xml: string): Array<{ href: string; xml: string }> {
  return [...xml.matchAll(/<D:response>([\s\S]*?)<\/D:response>/g)].map(
    (match) => ({
      href: /<D:href>([^<]*)<\/D:href>/.exec(match[1] ?? "")?.[1] ?? "",
      xml: match[1] ?? "",
    }),
  );
}

async function hrefs(response: Response): Promise<string[]> {
  expect(response.status).toBe(207);
  expect(response.headers.get("content-type")).toBe(
    'application/xml; charset="utf-8"',
  );
  return responses(await response.text()).map((entry) => entry.href);
}

describe("WebDAV routes", () => {
  it("declares one prefix route per method", () => {
    const routes = createDavRoutes({
      basePath: "/dav",
      realm: "Test Brain",
      writes: noWrites,
      reader: fakeReader({ entities: [] }),
      resolveAppPassword: async () => undefined,
    });
    expect(routes.map((route) => route.method)).toEqual([
      "OPTIONS",
      "GET",
      "HEAD",
      "PROPFIND",
      "POST",
      "PUT",
      "DELETE",
      "MOVE",
      "COPY",
      "PROPPATCH",
      "MKCOL",
      "LOCK",
      "UNLOCK",
    ]);
  });

  it("challenges a request without a valid app password", async () => {
    const dav = drive();
    for (const method of ["PROPFIND", "GET", "HEAD"]) {
      const response = await dav(method, "/dav/post/first.md", {
        as: "nobody",
        headers: { depth: "0" },
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        'Basic realm="Test Brain", charset="UTF-8"',
      );
    }
  });

  it("answers OPTIONS without credentials as a class 2 server", async () => {
    const response = await drive()("OPTIONS", "/dav/", { as: "nobody" });
    expect(response.status).toBe(200);
    expect(response.headers.get("dav")).toBe("1, 2");
    expect(response.headers.get("allow")).toBe(
      "OPTIONS, GET, HEAD, PROPFIND, PUT, DELETE, MOVE, COPY, PROPPATCH, MKCOL, LOCK, UNLOCK",
    );
  });

  it("marks every response inert for a browser on the brain's origin", async () => {
    const dav = drive();
    const all = await Promise.all([
      dav("OPTIONS", "/dav/", { as: "nobody" }),
      dav("GET", "/dav/post/first.md", { as: "nobody" }),
      dav("GET", "/dav/post/first.md"),
      dav("GET", "/dav/post/missing.md"),
      dav("GET", "/dav/image/cover.png"),
      dav("PROPFIND", "/dav/", { headers: { depth: "1" } }),
      dav("PROPFIND", "/dav/"),
    ]);
    for (const response of all) {
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toBe("sandbox");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("lists the root: a folder per type with something visible, and the notes", async () => {
    const dav = drive();
    expect(
      await hrefs(await dav("PROPFIND", "/dav/", { headers: { depth: "1" } })),
    ).toEqual([
      "/dav/",
      "/dav/book/",
      "/dav/image/",
      "/dav/post/",
      "/dav/site-content/",
      "/dav/readme.md",
    ]);
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav", { as: "admin", headers: { depth: "1" } }),
      ),
    ).toEqual([
      "/dav/",
      "/dav/book/",
      "/dav/image/",
      "/dav/memo/",
      "/dav/post/",
      "/dav/site-content/",
      "/dav/readme.md",
      "/dav/secret-plan.md",
    ]);
  });

  it("lists only the resource itself at depth 0 and refuses an unbounded listing", async () => {
    const dav = drive();
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/post/", { headers: { depth: "0" } }),
      ),
    ).toEqual(["/dav/post/"]);

    for (const headers of [{ depth: "infinity" }, {}]) {
      const response = await dav("PROPFIND", "/dav/post/", { headers });
      expect(response.status).toBe(403);
      expect(await response.text()).toContain("<D:propfind-finite-depth/>");
    }
  });

  it("lists a type folder through every page, scoped to the caller", async () => {
    const dav = drive();
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/post", { headers: { depth: "1" } }),
      ),
    ).toEqual([
      "/dav/post/",
      "/dav/post/first.md",
      "/dav/post/second.md",
      "/dav/post/third.md",
    ]);
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/post/", {
          as: "admin",
          headers: { depth: "1" },
        }),
      ),
    ).toContain("/dav/post/board-only.md");
  });

  it("describes a file with its size, ETag and modification time, and a folder as a collection", async () => {
    const dav = drive();
    const first = library.find((candidate) => candidate.id === "first");
    const [folder, file] = responses(
      await (
        await dav("PROPFIND", "/dav/post/", { headers: { depth: "1" } })
      ).text(),
    );
    expect(folder?.xml).toContain(
      "<D:resourcetype><D:collection/></D:resourcetype>",
    );
    expect(file?.xml).toContain("<D:resourcetype/>");
    expect(file?.xml).toContain(
      `<D:getcontentlength>${Buffer.byteLength(first?.content ?? "")}</D:getcontentlength>`,
    );
    expect(file?.xml).toContain('<D:getetag>"hash-post-first"</D:getetag>');
    expect(file?.xml).toContain(
      "<D:getlastmodified>Mon, 02 Nov 2026 12:30:00 GMT</D:getlastmodified>",
    );
    expect(file?.xml).toContain("<D:status>HTTP/1.1 200 OK</D:status>");
  });

  it("turns id segments into folders", async () => {
    const dav = drive();
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/site-content/", {
          headers: { depth: "1" },
        }),
      ),
    ).toEqual(["/dav/site-content/", "/dav/site-content/home/"]);
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/site-content/home/", {
          headers: { depth: "1" },
        }),
      ),
    ).toEqual(["/dav/site-content/home/", "/dav/site-content/home/hero.md"]);
  });

  it("keeps a contained type inside its container's folder", async () => {
    const dav = drive();
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/book/", { headers: { depth: "1" } }),
      ),
    ).toEqual(["/dav/book/", "/dav/book/dune/", "/dav/book/dune.md"]);
    expect(
      await hrefs(
        await dav("PROPFIND", "/dav/book/dune/", { headers: { depth: "1" } }),
      ),
    ).toEqual([
      "/dav/book/dune/",
      "/dav/book/dune/arrakis.md",
      "/dav/book/dune/intro.md",
    ]);
    expect(
      (await dav("PROPFIND", "/dav/book-section/", { headers: { depth: "1" } }))
        .status,
    ).toBe(404);
    expect((await dav("GET", "/dav/book/dune/intro.md")).status).toBe(200);
    // The unplaceable section is not on the drive under any name.
    expect((await dav("GET", "/dav/book/orphan.md")).status).toBe(404);
  });

  it("serves a file's stored markdown as plain text with its ETag", async () => {
    const dav = drive();
    const first = library.find((candidate) => candidate.id === "first");
    const response = await dav("GET", "/dav/post/first.md");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("etag")).toBe('"hash-post-first"');
    expect(response.headers.get("last-modified")).toBe(
      "Mon, 02 Nov 2026 12:30:00 GMT",
    );
    expect(await response.text()).toBe(first?.content ?? "");

    const head = await dav("HEAD", "/dav/post/first.md");
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(
      String(Buffer.byteLength(first?.content ?? "")),
    );
    expect(head.headers.get("etag")).toBe('"hash-post-first"');
    expect(await head.text()).toBe("");
  });

  it("answers a root note at the root and a folder read with no file", async () => {
    const dav = drive();
    expect((await dav("GET", "/dav/readme.md")).status).toBe(200);
    expect((await dav("GET", "/dav/post/")).status).toBe(405);
    expect((await dav("GET", "/dav/")).status).toBe(405);
  });

  it("hides what the caller may not see as if it did not exist", async () => {
    const dav = drive();
    for (const path of [
      "/dav/post/board-only.md",
      "/dav/secret-plan.md",
      "/dav/memo/board.md",
      "/dav/post/missing.md",
    ]) {
      expect((await dav("GET", path)).status).toBe(404);
      expect(
        (await dav("PROPFIND", path, { headers: { depth: "0" } })).status,
      ).toBe(404);
    }
    expect(
      (await dav("PROPFIND", "/dav/memo/", { headers: { depth: "1" } })).status,
    ).toBe(404);
    expect(
      (await dav("GET", "/dav/post/board-only.md", { as: "admin" })).status,
    ).toBe(200);
  });

  it("serves only the canonical path of an entity", async () => {
    const dav = drive();
    for (const path of [
      "/dav/post/first",
      "/dav/post/first.txt",
      "/dav/post/first.md/",
      "/dav/note/readme.md",
      "/dav/post%2Ffirst.md",
      "/dav/post//first.md",
      "/dav/post/first.md%00",
      "/dav/post/%E0%A4%A.md",
    ]) {
      expect((await dav("GET", path)).status).toBe(404);
    }
    expect((await dav("GET", "/dav/post/first.md")).status).toBe(200);
  });

  it("streams an image's bytes under its own extension and lists its size", async () => {
    const dav = drive();
    const response = await dav("GET", "/dav/image/cover.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(String(PNG.byteLength));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);

    const listing = responses(
      await (
        await dav("PROPFIND", "/dav/image/", { headers: { depth: "1" } })
      ).text(),
    );
    // An image whose bytes are still pending has no file yet.
    expect(listing.map((entry) => entry.href)).toEqual([
      "/dav/image/",
      "/dav/image/cover.png",
    ]);
    expect(listing[1]?.xml).toContain(
      `<D:getcontentlength>${PNG.byteLength}</D:getcontentlength>`,
    );
    expect((await dav("GET", "/dav/image/cover.md")).status).toBe(404);
    expect((await dav("GET", "/dav/image/pending.png")).status).toBe(404);
  });

  it("escapes names in hrefs", async () => {
    const routes = createDavRoutes({
      basePath: "/dav",
      realm: "Test Brain",
      writes: noWrites,
      reader: fakeReader({ entities: [entity("post", "a b&c")] }),
      resolveAppPassword: async () => grant("trusted"),
    });
    const propfind = routes.find((route) => route.method === "PROPFIND");
    const get = routes.find((route) => route.method === "GET");
    const listing = await propfind?.handler(
      new Request("https://brain.example/dav/post/", {
        method: "PROPFIND",
        headers: { depth: "1" },
      }),
    );
    expect(await listing?.text()).toContain(
      "<D:href>/dav/post/a%20b%26c.md</D:href>",
    );
    expect(
      (
        await get?.handler(
          new Request("https://brain.example/dav/post/a%20b%26c.md"),
        )
      )?.status,
    ).toBe(200);
  });
});
