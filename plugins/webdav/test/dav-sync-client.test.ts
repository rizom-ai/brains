import { describe, expect, it } from "bun:test";
import { doc, drive, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

function library(): FakeBrain {
  return fakeBrain([
    entity("post", "first", { content: doc("First", "status: draft\n") }),
  ]);
}

const PATH = "/dav/post/first.md";
const SYNC = { "x-brain-sync": "1" };
const laptop: As = { user: "laptop" };

function stored(brain: FakeBrain): string {
  return (
    brain.entities.find((candidate) => candidate.id === "first")?.content ?? ""
  );
}

/** Another writer changes the entry: Studio, an agent, a file import. */
function editInBrain(brain: FakeBrain, text: string): void {
  const index = brain.entities.findIndex(
    (candidate) => candidate.id === "first",
  );
  const current = brain.entities[index];
  if (!current) throw new Error("No such entity");
  brain.entities[index] = {
    ...current,
    content: text,
    contentHash: `hash-after-${text.length}`,
  };
}

/**
 * A sync client keeps its own copy and its own record of versions. It wants
 * the truth at once: what was stored, under which version, and a refusal it
 * can act on. The drive's ways of keeping a desktop's mount quiet are for
 * clients that cannot show a refusal, and a sync client opts out of them.
 */
describe("the drive and a sync client", () => {
  it("answers a save with the stored version and says it was stored as sent", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("PUT", PATH, {
      headers: { ...SYNC, "if-match": '"hash-post-first"' },
      body: doc("Edited", "status: draft\n"),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("x-brain-stored")).toBe("as-sent");
    const etag = response.headers.get("etag");
    expect(etag).not.toBeNull();
    const read = await dav("GET", PATH, { headers: SYNC });
    expect(read.headers.get("etag")).toBe(etag);
  });

  it("names the stored version of a save stored in another form, and shows it at once", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("PUT", PATH, {
      as: laptop,
      headers: { ...SYNC, "if-match": '"hash-post-first"' },
      body: doc("NORMALIZE"),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("x-brain-stored")).toBe("other-form");
    const read = await dav("GET", PATH, { as: laptop, headers: SYNC });
    // Nothing is held back: the next read is the stored form.
    expect(await read.text()).toBe(
      doc("NORMALIZE").replace("NORMALIZE", "Normalized"),
    );
    expect(read.headers.get("etag")).toBe(response.headers.get("etag"));
  });

  it("refuses a save over a newer version with 412 unless asked to keep it", async () => {
    const brain = library();
    const dav = drive(brain);
    editInBrain(brain, doc("Studio", "status: draft\n"));

    const refused = await dav("PUT", PATH, {
      headers: { ...SYNC, "if-match": '"hash-post-first"' },
      body: doc("Mine", "status: draft\n"),
    });

    expect(refused.status).toBe(412);
    expect(brain.conflicts).toEqual([]);
    expect(stored(brain)).toBe(doc("Studio", "status: draft\n"));
  });

  it("keeps a save over a newer version as a conflict when asked, and names it", async () => {
    const brain = library();
    const dav = drive(brain);
    editInBrain(brain, doc("Studio", "status: draft\n"));

    const kept = await dav("PUT", PATH, {
      headers: {
        ...SYNC,
        "x-brain-keep": "conflict",
        "if-match": '"hash-post-first"',
      },
      body: doc("Mine", "status: draft\n"),
    });

    expect(kept.status).toBe(204);
    expect(kept.headers.get("x-brain-conflict")).toBe("conflict-1");
    expect(kept.headers.get("etag")).toBe(
      `"hash-after-${doc("Studio", "status: draft\n").length}"`,
    );
    expect(stored(brain)).toBe(doc("Studio", "status: draft\n"));
    expect(brain.conflicts).toEqual([
      expect.objectContaining({
        entityType: "post",
        entityId: "first",
        origin: "drive",
        base: "hash-post-first",
        text: doc("Mine", "status: draft\n"),
      }),
    ]);
  });

  it("keeps a new file whose name is taken as a conflict when asked", async () => {
    const brain = library();

    const kept = await drive(brain)("PUT", PATH, {
      headers: { ...SYNC, "x-brain-keep": "conflict", "if-none-match": "*" },
      body: doc("Mine, made elsewhere", "status: draft\n"),
    });

    expect(kept.status).toBe(204);
    expect(kept.headers.get("x-brain-conflict")).toBe("conflict-1");
    expect(brain.conflicts[0]).not.toHaveProperty("base");
    expect(stored(brain)).toBe(doc("First", "status: draft\n"));
  });

  it("does not keep a save that changes nothing as a conflict", async () => {
    const brain = library();
    editInBrain(brain, doc("Studio", "status: draft\n"));

    const response = await drive(brain)("PUT", PATH, {
      headers: {
        ...SYNC,
        "x-brain-keep": "conflict",
        "if-match": '"hash-post-first"',
      },
      body: doc("Studio", "status: draft\n"),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("x-brain-conflict")).toBeNull();
    expect(brain.conflicts).toEqual([]);
  });

  it("refuses with 412 when asked to keep a conflict nothing can hold", async () => {
    const brain = library();
    brain.conflictsAvailable = false;
    editInBrain(brain, doc("Studio", "status: draft\n"));

    const response = await drive(brain)("PUT", PATH, {
      headers: {
        ...SYNC,
        "x-brain-keep": "conflict",
        "if-match": '"hash-post-first"',
      },
      body: doc("Mine", "status: draft\n"),
    });

    expect(response.status).toBe(412);
  });

  it("lists every type's folder, empty or not, and takes a save into an empty one", async () => {
    const brain = fakeBrain(
      [entity("post", "first", { content: doc("First", "status: draft\n") })],
      ["note", "post", "topic"],
    );
    const dav = drive(brain);

    const root = await (
      await dav("PROPFIND", "/dav/", { headers: { ...SYNC, depth: "1" } })
    ).text();
    expect(root).toContain("<D:href>/dav/topic/</D:href>");
    // A desktop's mount shows only folders that hold something.
    const plain = await (
      await dav("PROPFIND", "/dav/", { headers: { depth: "1" } })
    ).text();
    expect(plain).not.toContain("<D:href>/dav/topic/</D:href>");

    const created = await dav("PUT", "/dav/topic/first-topic.md", {
      headers: { ...SYNC, "if-none-match": "*" },
      body: doc("First topic"),
    });
    expect(created.status).toBe(201);
  });

  it("describes the brain's types to a sync client, and to no one else", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("GET", "/dav/.brain/vault-shapes.json", {
      headers: SYNC,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
    expect(await response.json()).toEqual({
      shapes: [expect.objectContaining({ entityType: "post" })],
    });
    expect((await dav("GET", "/dav/.brain/vault-shapes.json")).status).toBe(
      404,
    );
  });

  it("describes only the types that have a place of their own in a vault", async () => {
    const brain = fakeBrain(
      [entity("book", "walden", { content: doc("Walden") })],
      ["note", "book", "book-section"],
    );
    const reader = brain.options.reader;
    brain.options.reader = {
      ...reader,
      // A section is kept inside its book's folder.
      getEntityTypeConfig: (
        type,
      ): ReturnType<typeof reader.getEntityTypeConfig> =>
        type === "book-section" ? { containedIn: "book" } : {},
    };

    const response = await drive(brain)(
      "GET",
      "/dav/.brain/vault-shapes.json",
      {
        headers: SYNC,
      },
    );
    const body: unknown = await response.json();

    expect(body).toEqual({
      shapes: [
        expect.objectContaining({ entityType: "note" }),
        expect.objectContaining({ entityType: "book" }),
      ],
    });
  });

  it("leaves a desktop client's mount as it was", async () => {
    const brain = library();
    const dav = drive(brain);

    // Without the header, a save stored in another form has no ETag.
    const response = await dav("PUT", PATH, {
      headers: { "if-match": '"hash-post-first"' },
      body: doc("NORMALIZE"),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("etag")).toBeNull();
    expect(response.headers.get("x-brain-stored")).toBeNull();
  });
});
