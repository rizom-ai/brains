import { describe, expect, it } from "bun:test";
import type { AuthAppPasswordGrant } from "@brains/contracts";
import { createDavRoutes } from "../src/dav-routes";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

type Level = "admin" | "trusted";
interface As {
  level?: Level;
  access?: "read" | "write";
  user?: string;
}

const doc = (title: string, extra = ""): string =>
  `---\ntitle: ${title}\n${extra}---\n\nBody of ${title}`;

function library(): FakeBrain {
  return fakeBrain([
    entity("note", "readme", { content: doc("Readme") }),
    entity("post", "first", { content: doc("First", "status: draft\n") }),
    entity("post", "team-only", {
      content: doc("Team", "visibility: shared\n"),
      visibility: "shared",
    }),
    entity("post", "board-only", { visibility: "restricted" }),
    entity("locked", "rules", { content: doc("Rules") }),
    entity("image", "cover", {
      content: `asset://sha256/${"a".repeat(64)}`,
      metadata: { format: "png" },
    }),
  ]);
}

function drive(
  brain: FakeBrain,
  clock: { now: number } = { now: 1_800_000_000_000 },
): (
  method: string,
  path: string,
  options?: { as?: As; headers?: Record<string, string>; body?: BodyInit },
) => Promise<Response> {
  const routes = createDavRoutes({
    basePath: "/dav",
    realm: "Test Brain",
    ...brain.options,
    now: () => clock.now,
    resolveAppPassword: async (request): Promise<AuthAppPasswordGrant> => {
      const level =
        request.headers.get("x-level") === "admin" ? "admin" : "trusted";
      const user = request.headers.get("x-user") ?? `usr_${level}`;
      return {
        principal: {
          userId: user,
          personId: `prsn_${user}`,
          displayName: user,
          role: level,
          status: "active",
          permissionLevel: level,
          isAnchor: false,
        },
        access: request.headers.get("x-access") === "read" ? "read" : "write",
        appPasswordId: `pw_${user}`,
      };
    },
  });
  return async (method, path, options = {}) => {
    const route = routes.find((candidate) => candidate.method === method);
    if (!route) throw new Error(`No ${method} route`);
    return route.handler(
      new Request(`https://brain.example${path}`, {
        method,
        headers: {
          "x-level": options.as?.level ?? "trusted",
          "x-access": options.as?.access ?? "write",
          ...(options.as?.user ? { "x-user": options.as.user } : {}),
          ...options.headers,
        },
        ...(options.body !== undefined ? { body: options.body } : {}),
      }),
    );
  };
}

function stored(brain: FakeBrain, entityType: string, id: string): string {
  return (
    brain.entities.find(
      (candidate) => candidate.entityType === entityType && candidate.id === id,
    )?.content ?? ""
  );
}

const dest = (path: string): Record<string, string> => ({
  destination: `https://brain.example${path}`,
});

describe("WebDAV saves", () => {
  it("declares the writing methods and stays a class 1 server", async () => {
    const response = await drive(library())("OPTIONS", "/dav/");
    expect(response.headers.get("dav")).toBe("1");
    expect(response.headers.get("allow")).toBe(
      "OPTIONS, GET, HEAD, PROPFIND, PUT, DELETE, MOVE, COPY, PROPPATCH, MKCOL",
    );
  });

  it("refuses every writing method with a read-only app password", async () => {
    const brain = library();
    const dav = drive(brain);
    const as: As = { access: "read" };
    const refused = await Promise.all([
      dav("PUT", "/dav/post/first.md", { as, body: doc("Changed") }),
      dav("PUT", "/dav/post/.first.md.swp", { as, body: "swap" }),
      dav("DELETE", "/dav/post/first.md", { as }),
      dav("MOVE", "/dav/post/first.md", {
        as,
        headers: dest("/dav/post/x.md"),
      }),
      dav("COPY", "/dav/post/first.md", {
        as,
        headers: dest("/dav/post/x.md"),
      }),
      dav("PROPPATCH", "/dav/post/first.md", { as, body: "<x/>" }),
    ]);
    expect(refused.map((response) => response.status)).toEqual([
      403, 403, 403, 403, 403, 403,
    ]);
    expect(stored(brain, "post", "first")).toBe(
      doc("First", "status: draft\n"),
    );
    expect(brain.updates).toEqual([]);
    expect((await dav("GET", "/dav/post/.first.md.swp", { as })).status).toBe(
      404,
    );
    // Reading still works.
    expect((await dav("GET", "/dav/post/first.md", { as })).status).toBe(200);
  });

  it("saves an existing file as its owner, with the new ETag when stored as sent", async () => {
    const brain = library();
    const dav = drive(brain);
    const body = doc("First, edited", "status: draft\n");

    const response = await dav("PUT", "/dav/post/first.md", { body });

    expect(response.status).toBe(204);
    expect(stored(brain, "post", "first")).toBe(body);
    expect(brain.updates).toEqual([
      expect.objectContaining({
        expectedContentHash: "hash-post-first",
        interfaceType: "webdav",
        actorUserId: "usr_trusted",
      }),
    ]);
    const saved = brain.entities.find((candidate) => candidate.id === "first");
    expect(response.headers.get("etag")).toBe(`"${saved?.contentHash}"`);
    expect(saved?.metadata).toEqual({
      title: "First, edited",
      status: "draft",
    });
    expect(brain.audit).toEqual([
      {
        actorUserId: "usr_trusted",
        action: "webdav.entity.update.allowed",
        targetType: "entity",
        targetId: "first",
        metadata: {
          entityType: "post",
          interfaceType: "webdav",
          outcome: "allowed",
        },
      },
    ]);
    expect(await (await dav("GET", "/dav/post/first.md")).text()).toBe(body);
  });

  it("names no ETag when the brain stores the file in another form", async () => {
    const brain = library();
    const response = await drive(brain)("PUT", "/dav/post/first.md", {
      body: doc("NORMALIZE", "status: draft\n"),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("etag")).toBeNull();
    expect(stored(brain, "post", "first")).toContain("title: Normalized");
  });

  it("saves only over the version the client names, and the last write wins without one", async () => {
    const brain = library();
    const dav = drive(brain);

    const stale = await dav("PUT", "/dav/post/first.md", {
      headers: { "if-match": '"some-older-hash"' },
      body: doc("Stale"),
    });
    expect(stale.status).toBe(412);
    expect(brain.updates).toEqual([]);

    const current = await dav("PUT", "/dav/post/first.md", {
      headers: { "if-match": '"hash-post-first"' },
      body: doc("Current"),
    });
    expect(current.status).toBe(204);

    const blind = await dav("PUT", "/dav/post/first.md", {
      body: doc("Blind"),
    });
    expect(blind.status).toBe(204);
    expect(stored(brain, "post", "first")).toBe(doc("Blind"));
  });

  it("does not overwrite a change another writer made while the save was in flight", async () => {
    const brain = library();
    brain.beforeNextUpdate = (): void => {
      const index = brain.entities.findIndex((c) => c.id === "first");
      const current = brain.entities[index];
      if (current) {
        brain.entities[index] = {
          ...current,
          content: doc("Agent edit"),
          contentHash: "hash-agent",
        };
      }
    };

    const response = await drive(brain)("PUT", "/dav/post/first.md", {
      body: doc("Mine"),
    });

    expect(response.status).toBe(412);
    expect(stored(brain, "post", "first")).toBe(doc("Agent edit"));
  });

  it("refuses a file its type cannot read and leaves the entity unchanged", async () => {
    const brain = library();
    const response = await drive(brain)("PUT", "/dav/post/first.md", {
      body: doc("INVALID"),
    });

    expect(response.status).toBe(422);
    expect(await response.text()).toContain("title: must not be INVALID");
    expect(stored(brain, "post", "first")).toBe(
      doc("First", "status: draft\n"),
    );
    expect(brain.updates).toEqual([]);
  });
  it("refuses a file whose frontmatter cannot be parsed, with the parser's message", async () => {
    const brain = library();
    const response = await drive(brain)("PUT", "/dav/post/first.md", {
      body: doc("UNPARSEABLE"),
    });

    expect(response.status).toBe(422);
    expect(await response.text()).toContain(
      "unexpected end of the stream (3:1)",
    );
    expect(brain.updates).toEqual([]);
  });

  it("refuses bytes that are not UTF-8 text and a file over the size limit", async () => {
    const brain = library();
    const dav = drive(brain);
    expect(
      (
        await dav("PUT", "/dav/post/first.md", {
          body: new Uint8Array([0xff, 0xfe, 0xfd]),
        })
      ).status,
    ).toBe(422);
    expect(
      (await dav("PUT", "/dav/post/first.md", { body: "x".repeat(1025) }))
        .status,
    ).toBe(413);
    expect(
      (await dav("PUT", "/dav/post/.big.tmp", { body: "x".repeat(1025) }))
        .status,
    ).toBe(413);
    expect(brain.updates).toEqual([]);
  });

  it("applies the type's action policy and records the refusal", async () => {
    const brain = library();
    const response = await drive(brain)("PUT", "/dav/locked/rules.md", {
      body: doc("New rules"),
    });

    expect(response.status).toBe(403);
    expect(brain.updates).toEqual([]);
    expect(brain.audit).toEqual([
      expect.objectContaining({
        action: "webdav.entity.update.denied",
        targetId: "rules",
        metadata: expect.objectContaining({ reason: "entity-action-policy" }),
      }),
    ]);
  });

  it("needs the publish action to move a file into a published status", async () => {
    const brain = library();
    const dav = drive(brain);
    const published = doc("First", "status: published\n");

    expect(
      (await dav("PUT", "/dav/post/first.md", { body: published })).status,
    ).toBe(403);
    expect(brain.updates).toEqual([]);
    expect(
      (
        await dav("PUT", "/dav/post/first.md", {
          as: { level: "admin" },
          body: published,
        })
      ).status,
    ).toBe(204);
  });

  it("keeps the stored visibility when the file names none and refuses a tier above the caller", async () => {
    const brain = library();
    const dav = drive(brain);

    expect(
      (
        await dav("PUT", "/dav/post/team-only.md", {
          body: doc("Team, edited"),
        })
      ).status,
    ).toBe(204);
    expect(brain.updates[0]?.entity.visibility).toBe("shared");

    const raised = await dav("PUT", "/dav/post/first.md", {
      body: doc("First", "visibility: restricted\n"),
    });
    expect(raised.status).toBe(403);
    expect(brain.audit.at(-1)).toMatchObject({
      action: "webdav.entity.update.denied",
      metadata: { reason: "visibility-policy" },
    });
    expect(brain.updates).toHaveLength(1);

    expect(
      (
        await dav("PUT", "/dav/post/first.md", {
          as: { level: "admin" },
          body: doc("First", "visibility: restricted\n"),
        })
      ).status,
    ).toBe(204);
    expect(brain.updates.at(-1)?.entity.visibility).toBe("restricted");
  });

  it("takes no binary yet, and no content for a folder", async () => {
    const brain = library();
    const dav = drive(brain);
    expect(
      (
        await dav("PUT", "/dav/post/photo.png", {
          body: new Uint8Array([1, 2]),
        })
      ).status,
    ).toBe(403);
    expect((await dav("PUT", "/dav/post/", { body: "x" })).status).toBe(405);
    expect((await dav("PUT", "/dav/post", { body: "x" })).status).toBe(405);
    expect(brain.updates).toEqual([]);
  });

  it("refuses renaming and copying entities, and setting properties", async () => {
    const brain = library();
    const dav = drive(brain);
    expect(
      (
        await dav("MOVE", "/dav/post/first.md", {
          headers: dest("/dav/post/renamed.md"),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await dav("COPY", "/dav/post/first.md", {
          headers: dest("/dav/post/copy.md"),
        })
      ).status,
    ).toBe(403);
    expect(
      (await dav("PROPPATCH", "/dav/post/first.md", { body: "<x/>" })).status,
    ).toBe(403);
    expect(stored(brain, "post", "first")).toBe(
      doc("First", "status: draft\n"),
    );
    expect(brain.creates).toEqual([]);
    expect(brain.deletes).toEqual([]);
  });
});

describe("WebDAV editor temporary files", () => {
  it("keeps a temporary file for its owner only, served as an inert attachment", async () => {
    const brain = library();
    const dav = drive(brain);

    const created = await dav("PUT", "/dav/post/.first.md.swp", {
      body: "swap bytes",
    });
    expect(created.status).toBe(201);
    expect(
      (await dav("PUT", "/dav/post/.first.md.swp", { body: "swap v2" })).status,
    ).toBe(204);

    const read = await dav("GET", "/dav/post/.first.md.swp");
    expect(read.status).toBe(200);
    expect(await read.text()).toBe("swap v2");
    expect(read.headers.get("content-type")).toBe("application/octet-stream");
    expect(read.headers.get("content-disposition")).toBe("attachment");
    expect(read.headers.get("content-security-policy")).toBe("sandbox");

    const listing = await (
      await dav("PROPFIND", "/dav/post/", { headers: { depth: "1" } })
    ).text();
    expect(listing).toContain("<D:href>/dav/post/.first.md.swp</D:href>");
    expect(listing).toContain("<D:href>/dav/post/first.md</D:href>");

    const other: As = { user: "usr_other" };
    expect(
      (await dav("GET", "/dav/post/.first.md.swp", { as: other })).status,
    ).toBe(404);
    expect(
      await (
        await dav("PROPFIND", "/dav/post/", {
          as: other,
          headers: { depth: "1" },
        })
      ).text(),
    ).not.toContain(".first.md.swp");
    expect(brain.updates).toEqual([]);
  });

  it("treats backup, lock and unknown-extension names as temporary", async () => {
    const dav = drive(library());
    for (const name of [
      "first.md~",
      ".goutputstream-AB12CD",
      "4913",
      "first.md.tmp",
      "._first.md",
      ".~lock.first.md%23",
    ]) {
      expect(
        (await dav("PUT", `/dav/post/${name}`, { body: "t" })).status,
      ).toBe(201);
      expect((await dav("GET", `/dav/post/${name}`)).status).toBe(200);
    }
    expect((await dav("PUT", "/dav/.root-temp", { body: "t" })).status).toBe(
      201,
    );
  });

  it("deletes a temporary file and forgets one left idle for ten minutes", async () => {
    const clock = { now: 1_800_000_000_000 };
    const dav = drive(library(), clock);

    await dav("PUT", "/dav/post/.a.swp", { body: "a" });
    expect((await dav("DELETE", "/dav/post/.a.swp")).status).toBe(204);
    expect((await dav("GET", "/dav/post/.a.swp")).status).toBe(404);
    expect((await dav("DELETE", "/dav/post/.a.swp")).status).toBe(404);

    await dav("PUT", "/dav/post/.b.swp", { body: "b" });
    clock.now += 9 * 60 * 1000;
    expect((await dav("GET", "/dav/post/.b.swp")).status).toBe(200);
    clock.now += 10 * 60 * 1000 - 1;
    expect((await dav("HEAD", "/dav/post/.b.swp")).status).toBe(200);
    clock.now += 10 * 60 * 1000;
    expect((await dav("GET", "/dav/post/.b.swp")).status).toBe(404);
  });

  it("holds at most 16 MiB of temporary files per person", async () => {
    const brain = library();
    brain.options.writes.maxFileBytes = 9 * 1024 * 1024;
    const dav = drive(brain);
    const eight = new Uint8Array(8 * 1024 * 1024);

    expect((await dav("PUT", "/dav/.one.tmp", { body: eight })).status).toBe(
      201,
    );
    expect((await dav("PUT", "/dav/.two.tmp", { body: eight })).status).toBe(
      201,
    );
    expect(
      (await dav("PUT", "/dav/.three.tmp", { body: new Uint8Array(1) })).status,
    ).toBe(507);
    // Replacing a file counts its new size, not both.
    expect((await dav("PUT", "/dav/.two.tmp", { body: eight })).status).toBe(
      204,
    );
    expect(
      (
        await dav("PUT", "/dav/.mine.tmp", {
          as: { user: "usr_other" },
          body: eight,
        })
      ).status,
    ).toBe(201);
  });

  it("saves when an editor renames its temporary file onto the real one", async () => {
    const brain = library();
    const dav = drive(brain);
    const body = doc("First, via rename", "status: draft\n");
    await dav("PUT", "/dav/post/.first.md.tmp", { body });

    const moved = await dav("MOVE", "/dav/post/.first.md.tmp", {
      headers: dest("/dav/post/first.md"),
    });

    expect(moved.status).toBe(204);
    expect(stored(brain, "post", "first")).toBe(body);
    expect(brain.updates).toHaveLength(1);
    expect((await dav("GET", "/dav/post/.first.md.tmp")).status).toBe(404);
  });

  it("keeps the temporary file when the rename is refused", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("PUT", "/dav/post/.first.md.tmp", { body: doc("INVALID") });

    const invalid = await dav("MOVE", "/dav/post/.first.md.tmp", {
      headers: dest("/dav/post/first.md"),
    });
    expect(invalid.status).toBe(422);
    expect((await dav("GET", "/dav/post/.first.md.tmp")).status).toBe(200);

    const guarded = await dav("MOVE", "/dav/post/.first.md.tmp", {
      headers: { ...dest("/dav/post/first.md"), overwrite: "F" },
    });
    expect(guarded.status).toBe(412);
    expect(brain.updates).toEqual([]);
  });

  it("renames one temporary file to another and refuses a destination elsewhere", async () => {
    const dav = drive(library());
    await dav("PUT", "/dav/post/.a.tmp", { body: "a" });

    expect(
      (
        await dav("MOVE", "/dav/post/.a.tmp", {
          headers: dest("/dav/post/.b.tmp"),
        })
      ).status,
    ).toBe(201);
    expect((await dav("GET", "/dav/post/.a.tmp")).status).toBe(404);
    expect(await (await dav("GET", "/dav/post/.b.tmp")).text()).toBe("a");

    expect(
      (
        await dav("MOVE", "/dav/post/.missing.tmp", {
          headers: dest("/dav/post/.c.tmp"),
        })
      ).status,
    ).toBe(404);
    expect((await dav("MOVE", "/dav/post/.b.tmp")).status).toBe(400);
    expect(
      (
        await dav("MOVE", "/dav/post/.b.tmp", {
          headers: { destination: "https://elsewhere.example/dav/post/.c.tmp" },
        })
      ).status,
    ).toBe(502);
    expect(
      (
        await dav("MOVE", "/dav/post/.b.tmp", {
          headers: { destination: "https://brain.example/studio/x" },
        })
      ).status,
    ).toBe(502);
  });
});
