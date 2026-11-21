import { describe, expect, it } from "bun:test";
import { SAVE_HOLD_MS, SaveHolds } from "../src/dav-holds";
import { doc, drive, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

function library(): FakeBrain {
  return fakeBrain([
    entity("post", "first", { content: doc("First", "status: draft\n") }),
  ]);
}

const PATH = "/dav/post/first.md";
const laptop: As = { user: "laptop" };
const desktop: As = { user: "desktop" };

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

function lengthIn(multistatus: string, href: string): number | undefined {
  const response = multistatus
    .split("<D:response>")
    .find((part) => part.includes(`<D:href>${href}</D:href>`));
  const length = /<D:getcontentlength>(\d+)<\/D:getcontentlength>/.exec(
    response ?? "",
  )?.[1];
  return length === undefined ? undefined : Number(length);
}

/** The mount read the entry, the brain changed it, and the mount saved over it. */
async function losingSave(
  brain: FakeBrain,
  clock = { now: 1_800_000_000_000 },
): Promise<ReturnType<typeof drive>> {
  const dav = drive(brain, clock);
  await dav("GET", PATH, { as: laptop });
  editInBrain(brain, doc("Studio"));
  const save = await dav("PUT", PATH, { as: laptop, body: doc("Mine") });
  expect(save.status).toBe(204);
  expect(save.headers.get("etag")).toBeNull();
  return dav;
}

/**
 * rclone reads a file back after it uploads it and takes any other size as a
 * corrupted upload: it deletes the file and uploads again, for as long as it
 * is mounted. A save the drive keeps as a conflict, or stores in another
 * form, is shown back to the app password that sent it as it was sent, for a
 * while; nobody else sees it and nothing is stored.
 */
describe("a save held for the app password that sent it", () => {
  it("shows a losing save back as it was sent: GET, HEAD and PROPFIND", async () => {
    const brain = library();
    const dav = await losingSave(brain);
    const sent = new TextEncoder().encode(doc("Mine")).byteLength;

    const read = await dav("GET", PATH, { as: laptop });
    const head = await dav("HEAD", PATH, { as: laptop });
    const file = await dav("PROPFIND", PATH, {
      as: laptop,
      headers: { depth: "0" },
    });
    const folder = await dav("PROPFIND", "/dav/post/", {
      as: laptop,
      headers: { depth: "1" },
    });

    expect(await read.text()).toBe(doc("Mine"));
    expect(read.headers.get("content-length")).toBe(String(sent));
    expect(head.headers.get("content-length")).toBe(String(sent));
    expect(head.headers.get("etag")).toBe(read.headers.get("etag"));
    expect(lengthIn(await file.text(), PATH)).toBe(sent);
    expect(lengthIn(await folder.text(), PATH)).toBe(sent);
  });

  it("keeps the server's version for every other app password and in the brain", async () => {
    const brain = library();
    const dav = await losingSave(brain);
    const current = new TextEncoder().encode(doc("Studio")).byteLength;

    const other = await dav("GET", PATH, { as: desktop });
    const listing = await dav("PROPFIND", "/dav/post/", {
      as: desktop,
      headers: { depth: "1" },
    });

    expect(await other.text()).toBe(doc("Studio"));
    expect(lengthIn(await listing.text(), PATH)).toBe(current);
    expect(stored(brain)).toBe(doc("Studio"));
    expect(brain.updates).toEqual([]);
    expect(brain.conflicts.map((conflict) => conflict.text)).toEqual([
      doc("Mine"),
    ]);
  });

  it("does not move the mount's base: a save from the held text is another conflict", async () => {
    const brain = library();
    const dav = await losingSave(brain);

    const held = await (await dav("GET", PATH, { as: laptop })).text();
    const again = await dav("PUT", PATH, {
      as: laptop,
      body: `${held}\n\nMore of mine`,
    });

    expect(again.status).toBe(204);
    expect(stored(brain)).toBe(doc("Studio"));
    expect(brain.updates).toEqual([]);
    expect(brain.conflicts.map((conflict) => conflict.text)).toEqual([
      doc("Mine"),
      `${doc("Mine")}\n\nMore of mine`,
    ]);
  });

  it("takes the held version's ETag as the losing base, never as the stored one", async () => {
    const brain = library();
    const dav = await losingSave(brain);
    const etag = (await dav("HEAD", PATH, { as: laptop })).headers.get("etag");

    const save = await dav("PUT", PATH, {
      as: laptop,
      headers: { "if-match": etag ?? "" },
      body: doc("Mine, edited"),
    });
    // The edited save is held now, under its own ETag.
    const again = (await dav("HEAD", PATH, { as: laptop })).headers.get("etag");
    const remove = await dav("DELETE", PATH, {
      as: laptop,
      headers: { "if-match": again ?? "" },
    });

    expect(save.status).toBe(204);
    expect(remove.status).toBe(409);
    expect(stored(brain)).toBe(doc("Studio"));
    expect(brain.deletes).toEqual([]);
    expect(brain.conflicts).toHaveLength(2);
  });

  it("answers rclone's read-back with the size it sent, so it neither deletes nor retries", async () => {
    const brain = library();
    const dav = await losingSave(brain);
    const sent = new TextEncoder().encode(doc("Mine")).byteLength;

    // What rclone does after every upload: read the size back.
    const readBack = await dav("PROPFIND", PATH, {
      as: laptop,
      headers: { depth: "0" },
    });

    expect(lengthIn(await readBack.text(), PATH)).toBe(sent);
  });

  it("shows a save stored in another form as it was sent", async () => {
    const brain = library();
    const dav = drive(brain);
    const sent = doc("NORMALIZE", "status: draft\n");

    const save = await dav("PUT", PATH, { as: laptop, body: sent });
    const read = await dav("GET", PATH, { as: laptop });
    const other = await dav("GET", PATH, { as: desktop });

    expect(save.headers.get("etag")).toBeNull();
    expect(await read.text()).toBe(sent);
    expect(await other.text()).toContain("title: Normalized");
    expect(stored(brain)).toContain("title: Normalized");
    expect(brain.conflicts).toEqual([]);
  });

  it("takes a save from a held form the brain stored for a save of the stored version", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("GET", PATH, { as: laptop });
    await dav("PUT", PATH, {
      as: laptop,
      body: doc("NORMALIZE", "status: draft\n"),
    });
    const etag = (await dav("HEAD", PATH, { as: laptop })).headers.get("etag");

    const save = await dav("PUT", PATH, {
      as: laptop,
      headers: { "if-match": etag ?? "" },
      body: doc("Edited after", "status: draft\n"),
    });

    expect(save.status).toBe(204);
    expect(stored(brain)).toBe(doc("Edited after", "status: draft\n"));
    expect(brain.conflicts).toEqual([]);
  });

  it("ends after the hold, and the next read is the mount's new base", async () => {
    const brain = library();
    const clock = { now: 1_800_000_000_000 };
    const dav = await losingSave(brain, clock);

    clock.now += SAVE_HOLD_MS;
    const read = await dav("GET", PATH, { as: laptop });
    const save = await dav("PUT", PATH, { as: laptop, body: doc("Mine") });

    expect(await read.text()).toBe(doc("Studio"));
    expect(save.status).toBe(204);
    expect(stored(brain)).toBe(doc("Mine"));
    expect(brain.conflicts).toHaveLength(1);
  });

  it("is still held just before the hold ends", async () => {
    const brain = library();
    const clock = { now: 1_800_000_000_000 };
    const dav = await losingSave(brain, clock);

    clock.now += SAVE_HOLD_MS - 1;

    expect(await (await dav("GET", PATH, { as: laptop })).text()).toBe(
      doc("Mine"),
    );
  });

  it("ends early once the entry changes again", async () => {
    const brain = library();
    const dav = await losingSave(brain);

    editInBrain(brain, doc("Studio, later"));

    expect(await (await dav("GET", PATH, { as: laptop })).text()).toBe(
      doc("Studio, later"),
    );
  });

  it("ends early once its conflict is resolved", async () => {
    const brain = library();
    const dav = await losingSave(brain);

    brain.resolveConflicts();

    expect(await (await dav("GET", PATH, { as: laptop })).text()).toBe(
      doc("Studio"),
    );
  });

  it("ends early when the same mount's next save is stored as sent", async () => {
    const brain = library();
    const dav = drive(brain);
    await dav("PUT", PATH, {
      as: laptop,
      body: doc("NORMALIZE", "status: draft\n"),
    });

    const save = await dav("PUT", PATH, {
      as: laptop,
      body: doc("As sent", "status: draft\n"),
    });

    expect(save.headers.get("etag")).not.toBeNull();
    expect(await (await dav("GET", PATH, { as: laptop })).text()).toBe(
      doc("As sent", "status: draft\n"),
    );
  });

  it("is refreshed by the same losing save sent again", async () => {
    const brain = library();
    const clock = { now: 1_800_000_000_000 };
    const dav = await losingSave(brain, clock);

    clock.now += SAVE_HOLD_MS - 1;
    await dav("PUT", PATH, { as: laptop, body: doc("Mine") });
    clock.now += SAVE_HOLD_MS - 1;

    expect(await (await dav("GET", PATH, { as: laptop })).text()).toBe(
      doc("Mine"),
    );
    expect(brain.conflicts).toHaveLength(1);
  });

  it("holds nothing for a refused save", async () => {
    const brain = library();
    const dav = drive(brain);

    await dav("PUT", PATH, { as: laptop, body: doc("INVALID") });

    expect(await (await dav("GET", PATH, { as: laptop })).text()).toBe(
      doc("First", "status: draft\n"),
    );
  });
});

describe("the saves held for one app password", () => {
  const clock = { now: 0 };
  const save = (bytes: number): Parameters<SaveHolds["hold"]>[2] => ({
    bytes: new Uint8Array(bytes),
    storedHash: "hash",
  });

  it("drops the oldest once the held bytes pass the cap", () => {
    const holds = new SaveHolds(() => clock.now, 10);

    holds.hold("pw", ["a.md"], save(6));
    holds.hold("pw", ["b.md"], save(6));

    expect(holds.get("pw", ["a.md"])).toBeUndefined();
    expect(holds.get("pw", ["b.md"])).toBeDefined();
  });

  it("keeps each app password's holds apart", () => {
    const holds = new SaveHolds(() => clock.now, 10);

    holds.hold("pw", ["a.md"], save(6));
    holds.hold("other", ["a.md"], save(6));

    expect(holds.get("pw", ["a.md"])).toBeDefined();
    expect(holds.get("other", ["a.md"])).toBeDefined();
  });
});
