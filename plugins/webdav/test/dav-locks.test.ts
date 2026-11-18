import { describe, expect, it } from "bun:test";
import { dest, doc, drive, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

const LOCK_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype><D:owner><D:href>mira</D:href></D:owner></D:lockinfo>`;

function library(): FakeBrain {
  return fakeBrain(
    [
      entity("note", "readme", { content: doc("Readme") }),
      entity("post", "first", { content: doc("First") }),
      entity("post", "second", { content: doc("Second") }),
    ],
    ["note", "post"],
  );
}

function tokenOf(response: Response): string {
  const token = /<(opaquelocktoken:[^>]+)>/.exec(
    response.headers.get("lock-token") ?? "",
  )?.[1];
  if (!token) throw new Error("No lock token");
  return token;
}

const holding = (token: string): Record<string, string> => ({
  if: `(<${token}>)`,
});

describe("WebDAV locks", () => {
  it("is a class 2 server", async () => {
    const response = await drive(library())("OPTIONS", "/dav/");
    expect(response.headers.get("dav")).toBe("1, 2");
    expect(response.headers.get("allow")).toBe(
      "OPTIONS, GET, HEAD, PROPFIND, PUT, DELETE, MOVE, COPY, PROPPATCH, MKCOL, LOCK, UNLOCK",
    );
  });

  it("grants an exclusive write lock with a token and a capped timeout", async () => {
    const dav = drive(library());

    const response = await dav("LOCK", "/dav/post/first.md", {
      headers: { timeout: "Second-3600" },
      body: LOCK_BODY,
    });

    expect(response.status).toBe(200);
    const token = tokenOf(response);
    expect(response.headers.get("content-type")).toBe(
      'application/xml; charset="utf-8"',
    );
    const xml = await response.text();
    expect(xml).toContain("<D:lockdiscovery><D:activelock>");
    expect(xml).toContain("<D:lockscope><D:exclusive/></D:lockscope>");
    expect(xml).toContain("<D:locktype><D:write/></D:locktype>");
    expect(xml).toContain("<D:timeout>Second-600</D:timeout>");
    expect(xml).toContain(
      `<D:locktoken><D:href>${token}</D:href></D:locktoken>`,
    );
    expect(xml).toContain(
      "<D:lockroot><D:href>/dav/post/first.md</D:href></D:lockroot>",
    );

    const unbounded = await dav("LOCK", "/dav/post/second.md", {
      headers: { timeout: "Infinite, Second-4100000000" },
      body: LOCK_BODY,
    });
    expect(await unbounded.text()).toContain(
      "<D:timeout>Second-600</D:timeout>",
    );
  });

  it("lets only the lock's holder change the file while it is locked", async () => {
    const brain = library();
    const dav = drive(brain);
    const token = tokenOf(
      await dav("LOCK", "/dav/post/first.md", { body: LOCK_BODY }),
    );
    const other: As = { user: "usr_other" };

    expect(
      (await dav("PUT", "/dav/post/first.md", { body: doc("No token") }))
        .status,
    ).toBe(423);
    expect(
      (
        await dav("PUT", "/dav/post/first.md", {
          as: other,
          headers: holding(token),
          body: doc("Someone else's token"),
        })
      ).status,
    ).toBe(423);
    expect((await dav("DELETE", "/dav/post/first.md")).status).toBe(423);
    expect(
      (await dav("LOCK", "/dav/post/first.md", { as: other, body: LOCK_BODY }))
        .status,
    ).toBe(423);
    expect(brain.updates).toEqual([]);
    expect(brain.deletes).toEqual([]);

    expect(
      (
        await dav("PUT", "/dav/post/first.md", {
          headers: holding(token),
          body: doc("Mine"),
        })
      ).status,
    ).toBe(204);
    // Reading and other files are untouched by the lock.
    expect((await dav("GET", "/dav/post/first.md", { as: other })).status).toBe(
      200,
    );
    expect(
      (
        await dav("PUT", "/dav/post/second.md", {
          as: other,
          body: doc("Free"),
        })
      ).status,
    ).toBe(204);
  });

  it("guards the destination of a rename onto a locked file", async () => {
    const brain = library();
    const dav = drive(brain);
    const token = tokenOf(
      await dav("LOCK", "/dav/post/first.md", { body: LOCK_BODY }),
    );
    await dav("PUT", "/dav/post/.first.md.tmp", { body: doc("Atomic") });

    expect(
      (
        await dav("MOVE", "/dav/post/.first.md.tmp", {
          headers: dest("/dav/post/first.md"),
        })
      ).status,
    ).toBe(423);
    expect(
      (
        await dav("MOVE", "/dav/post/.first.md.tmp", {
          headers: { ...dest("/dav/post/first.md"), ...holding(token) },
        })
      ).status,
    ).toBe(204);
  });

  it("releases a lock on UNLOCK by its holder with its token", async () => {
    const dav = drive(library());
    const token = tokenOf(
      await dav("LOCK", "/dav/post/first.md", { body: LOCK_BODY }),
    );
    const unlock = (
      headers: Record<string, string>,
      as?: As,
    ): Promise<Response> =>
      dav("UNLOCK", "/dav/post/first.md", { headers, ...(as ? { as } : {}) });

    expect((await unlock({})).status).toBe(400);
    expect(
      (await unlock({ "lock-token": "<opaquelocktoken:not-this-one>" })).status,
    ).toBe(409);
    expect(
      (await unlock({ "lock-token": `<${token}>` }, { user: "usr_other" }))
        .status,
    ).toBe(409);
    expect((await unlock({ "lock-token": `<${token}>` })).status).toBe(204);
    expect(
      (await dav("PUT", "/dav/post/first.md", { body: doc("Free again") }))
        .status,
    ).toBe(204);
    expect((await unlock({ "lock-token": `<${token}>` })).status).toBe(409);
  });

  it("lets a lock lapse after its timeout unless the holder refreshes it", async () => {
    const clock = { now: 1_800_000_000_000 };
    const dav = drive(library(), clock);
    const token = tokenOf(
      await dav("LOCK", "/dav/post/first.md", { body: LOCK_BODY }),
    );

    clock.now += 9 * 60 * 1000;
    const refreshed = await dav("LOCK", "/dav/post/first.md", {
      headers: holding(token),
    });
    expect(refreshed.status).toBe(200);
    expect(await refreshed.text()).toContain(token);

    clock.now += 9 * 60 * 1000;
    expect(
      (await dav("PUT", "/dav/post/first.md", { body: doc("Still locked") }))
        .status,
    ).toBe(423);

    clock.now += 60 * 1000;
    expect(
      (await dav("PUT", "/dav/post/first.md", { body: doc("Lapsed") })).status,
    ).toBe(204);
    // A refresh needs a live lock.
    expect(
      (await dav("LOCK", "/dav/post/first.md", { headers: holding(token) }))
        .status,
    ).toBe(412);
  });

  it("locks a name before its file exists, as a client creating one does", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("LOCK", "/dav/post/new.md", { body: LOCK_BODY });
    expect(response.status).toBe(201);
    const token = tokenOf(response);
    // The lock creates nothing.
    expect(
      (await dav("PROPFIND", "/dav/post/new.md", { headers: { depth: "0" } }))
        .status,
    ).toBe(404);

    expect(
      (await dav("PUT", "/dav/post/new.md", { body: doc("No token") })).status,
    ).toBe(423);
    expect(
      (
        await dav("PUT", "/dav/post/new.md", {
          headers: holding(token),
          body: doc("New"),
        })
      ).status,
    ).toBe(201);
  });

  it("refuses a lock to a read-only app password and names what it supports", async () => {
    const dav = drive(library());
    expect(
      (
        await dav("LOCK", "/dav/post/first.md", {
          as: { access: "read" },
          body: LOCK_BODY,
        })
      ).status,
    ).toBe(403);
    expect(
      await (
        await dav("PROPFIND", "/dav/post/first.md", { headers: { depth: "0" } })
      ).text(),
    ).toContain(
      "<D:supportedlock><D:lockentry><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockentry></D:supportedlock>",
    );
  });
});
