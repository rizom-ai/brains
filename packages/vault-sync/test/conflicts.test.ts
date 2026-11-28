import { afterEach, describe, expect, it } from "bun:test";
import type { HttpResponse } from "../src";
import type { OpenConflict, SyncReport } from "../src";
import { connect, fresh, stored, type Synced } from "../src/test";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

const COPY = "Conflicts/tea 2026-11-22 09.30.15.md";
const STUDIO = "# Tea\n\nFrom Studio.\n";
const MINE = "# Tea\n\nFrom Obsidian.\n";

/** A note changed in Studio and in Obsidian, synced: the brain's version won. */
async function withConflict(): Promise<Synced> {
  const made = await fresh();
  await made.brain.write("note", "tea", "# Tea\n\nSteep it.\n");
  await connect(made);
  await made.brain.write("note", "tea", STUDIO);
  made.vault.setText("tea.md", MINE);
  await made.engine.sync();
  expect(made.vault.text(COPY)).toBe(MINE);
  expect(await made.brain.conflicts()).toHaveLength(1);
  return made;
}

/** Choose a version of a conflict as the screen does: as it was shown. */
async function choose(
  made: Synced,
  keep: "brain" | "mine",
  copy = COPY,
): Promise<SyncReport> {
  const shown = (await made.engine.openConflicts()).find(
    (one) => one.copy === copy,
  );
  const conflict: OpenConflict = shown ?? { path: "", copy, flavor: "text" };
  return made.engine.settleConflict(conflict, keep);
}

/**
 * A conflict is settled where it is seen: the person compares the two
 * versions in Obsidian and keeps one. The copy in Conflicts/ and the
 * brain's Inbox entry are both cleared by that choice.
 */
describe("a conflict waiting for the person", () => {
  it("is listed with both versions", async () => {
    synced = await withConflict();

    expect(await synced.engine.openConflicts()).toMatchObject([
      {
        path: "tea.md",
        copy: COPY,
        flavor: "text",
        brains: STUDIO,
        yours: MINE,
      },
    ]);
  });

  it("is listed without text when it is an image", async () => {
    synced = await withConflict();
    const state = await synced.store.load();
    await synced.vault.write("Conflicts/cup 1.png", new Uint8Array([1, 2, 3]));
    await synced.store.save({
      ...state,
      conflicts: [
        ...state.conflicts,
        { path: "image/cup.png", copy: "Conflicts/cup 1.png" },
      ],
    });

    expect((await synced.engine.openConflicts())[1]).toMatchObject({
      path: "image/cup.png",
      copy: "Conflicts/cup 1.png",
      flavor: "file",
    });
  });

  it("is settled for the brain's version when its copy was removed by hand", async () => {
    synced = await withConflict();
    await synced.vault.trash(COPY);

    expect(await synced.engine.openConflicts()).toEqual([]);
    await synced.engine.sync();

    expect((await synced.store.load()).conflicts).toEqual([]);
    // Removing the copy is choosing the brain's version: its entry goes too.
    expect(await synced.brain.conflicts()).toEqual([]);
  });

  it("follows its note when the note is renamed", async () => {
    synced = await withConflict();
    await synced.vault.rename("tea.md", "green tea.md");
    await synced.engine.noteRenamed("tea.md", "green tea.md");

    expect((await synced.engine.openConflicts())[0]?.path).toBe("green tea.md");
  });
});

describe("keeping the brain's version", () => {
  it("removes the copy and the brain's Inbox entry, and changes no note", async () => {
    synced = await withConflict();

    const report = await choose(synced, "brain");

    expect(report.status).toBe("synced");
    expect(report.uploaded).toEqual([]);
    expect(synced.vault.text("tea.md")).toBe(STUDIO);
    expect(await stored(synced, "tea")).toBe(STUDIO);
    expect(await synced.vault.exists(COPY)).toBe(false);
    expect(synced.vault.trashed).toContain(COPY);
    expect(await synced.brain.conflicts()).toEqual([]);
    expect(await synced.engine.openConflicts()).toEqual([]);
  });

  it("clears the brain's entry at the next sync when the brain was away", async () => {
    synced = await withConflict();
    synced.brain.online = false;

    const report = await choose(synced, "brain");

    expect(report.status).toBe("offline");
    // The choice is made here and now; only telling the brain waits.
    expect(await synced.vault.exists(COPY)).toBe(false);
    expect(await synced.engine.openConflicts()).toEqual([]);

    synced.brain.online = true;
    expect(await synced.brain.conflicts()).toHaveLength(1);
    await synced.engine.sync();

    expect(await synced.brain.conflicts()).toEqual([]);
    expect((await synced.store.load()).settled).toEqual([]);
  });

  it("leaves it to the Inbox on a brain that cannot be told", async () => {
    synced = await withConflict();
    const reachable = synced.brain.fetch;
    synced.brain.fetch = async (request): Promise<HttpResponse> =>
      request.url.includes("/.brain/conflicts/")
        ? { status: 404, headers: {}, body: new Uint8Array() }
        : reachable(request);

    const report = await choose(synced, "brain");

    expect(report.status).toBe("synced");
    expect(await synced.vault.exists(COPY)).toBe(false);
    // Not asked again at every sync.
    expect((await synced.store.load()).settled).toEqual([]);
    expect(await synced.brain.conflicts()).toHaveLength(1);
  });
});

describe("a brain that cannot settle conflicts for now", () => {
  it("still syncs, and is told again later", async () => {
    synced = await withConflict();
    const reachable = synced.brain.fetch;
    synced.brain.fetch = async (request): Promise<HttpResponse> =>
      request.url.includes("/.brain/conflicts/")
        ? { status: 503, headers: {}, body: new Uint8Array() }
        : reachable(request);

    const settled = await choose(synced, "mine");

    // The choice is made, and the note went up as any edit does.
    expect(settled.status).toBe("synced");
    expect(settled.uploaded).toEqual(["tea.md"]);
    expect(await stored(synced, "tea")).toBe(MINE);
    expect((await synced.store.load()).settled).toHaveLength(1);

    // Every sync goes on as before while the brain cannot be told.
    synced.vault.setText("tea.md", "# Tea\n\nLater.\n");
    const next = await synced.engine.sync();
    expect(next.status).toBe("synced");
    expect(next.uploaded).toEqual(["tea.md"]);
    expect((await synced.store.load()).settled).toHaveLength(1);

    synced.brain.fetch = reachable;
    await synced.engine.sync();
    expect((await synced.store.load()).settled).toEqual([]);
    expect(await synced.brain.conflicts()).toEqual([]);
  });
});

describe("keeping the person's version", () => {
  it("puts it in the note and in the brain, and clears the copy and the Inbox entry", async () => {
    synced = await withConflict();

    const report = await choose(synced, "mine");

    expect(report.uploaded).toEqual(["tea.md"]);
    expect(report.notices).toEqual([]);
    expect(synced.vault.text("tea.md")).toBe(MINE);
    expect(await stored(synced, "tea")).toBe(MINE);
    expect(await synced.vault.exists(COPY)).toBe(false);
    expect(await synced.brain.conflicts()).toEqual([]);
    expect(await synced.engine.openConflicts()).toEqual([]);

    const next = await synced.engine.sync();
    expect(next.uploaded).toEqual([]);
    expect(next.downloaded).toEqual([]);
    expect(next.notices).toEqual([]);
  });

  it("is a new conflict when the brain's note changed again meanwhile", async () => {
    synced = await withConflict();
    const AGAIN = "# Tea\n\nFrom Studio, again.\n";
    await synced.brain.write("note", "tea", AGAIN);

    const report = await choose(synced, "mine");

    expect(report.uploaded).toEqual([]);
    expect(report.notices.map((notice) => notice.kind)).toEqual(["conflict"]);
    expect(synced.vault.text("tea.md")).toBe(AGAIN);
    expect(await stored(synced, "tea")).toBe(AGAIN);
    // Nothing is lost: the person's text waits again, here and in the brain.
    const open = await synced.engine.openConflicts();
    expect(open).toHaveLength(1);
    expect(open[0]?.yours).toBe(MINE);
    expect(open[0]?.brains).toBe(AGAIN);
    const kept = await synced.brain.conflicts();
    expect(kept).toHaveLength(1);
    expect(kept[0]?.content).toContain("From Obsidian.");
  });

  it("keeps it in the note when the brain is away, and uploads it at the next sync", async () => {
    synced = await withConflict();
    synced.brain.online = false;

    const report = await choose(synced, "mine");

    expect(report.status).toBe("offline");
    expect(synced.vault.text("tea.md")).toBe(MINE);
    expect(await synced.vault.exists(COPY)).toBe(false);

    synced.brain.online = true;
    const next = await synced.engine.sync();

    expect(next.uploaded).toEqual(["tea.md"]);
    expect(await stored(synced, "tea")).toBe(MINE);
    expect(await synced.brain.conflicts()).toEqual([]);
  });

  it("brings the note back when it was deleted in the vault meanwhile", async () => {
    synced = await withConflict();
    await synced.vault.trash("tea.md");

    await choose(synced, "mine");

    expect(synced.vault.text("tea.md")).toBe(MINE);
    expect(await stored(synced, "tea")).toBe(MINE);
  });
});

describe("a note that changed after its versions were shown", () => {
  it("is not replaced by the person's version, and says so", async () => {
    synced = await withConflict();
    const [shown] = await synced.engine.openConflicts();
    if (!shown) throw new Error("No conflict");
    // A sync brought a newer version meanwhile, or the person typed in it.
    synced.vault.setText("tea.md", "# Tea\n\nNewer, and never shown.\n");

    const report = await synced.engine.settleConflict(shown, "mine");

    expect(report.notices).toEqual([
      { kind: "conflict-changed", path: "tea.md" },
    ]);
    expect(report.uploaded).toEqual([]);
    expect(synced.vault.text("tea.md")).toBe(
      "# Tea\n\nNewer, and never shown.\n",
    );
    expect(synced.vault.text(COPY)).toBe(MINE);
    expect(await synced.engine.openConflicts()).toHaveLength(1);
    expect(await synced.brain.conflicts()).toHaveLength(1);
  });

  it("is not replaced when it came back after being shown as gone", async () => {
    synced = await withConflict();
    await synced.vault.trash("tea.md");
    const [shown] = await synced.engine.openConflicts();
    if (!shown) throw new Error("No conflict");
    synced.vault.setText("tea.md", "# Tea\n\nBack.\n");

    const report = await synced.engine.settleConflict(shown, "mine");

    expect(report.notices.map((notice) => notice.kind)).toEqual([
      "conflict-changed",
    ]);
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nBack.\n");
  });
});

describe("a save that loses while the person types on", () => {
  it("keeps what they typed, and makes the conflict of it at the next sync", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n\nSteep it.\n");
    await connect(synced);
    await synced.brain.write("note", "tea", STUDIO);
    synced.vault.setText("tea.md", MINE);
    const NEWER = "# Tea\n\nFrom Obsidian, and more.\n";
    const made = synced;
    const reachable = made.brain.fetch;
    made.brain.fetch = async (request): Promise<HttpResponse> => {
      const response = await reachable(request);
      // Typed while the save was on its way.
      if (request.method === "PUT") made.vault.setText("tea.md", NEWER);
      return response;
    };

    const report = await synced.engine.sync();
    made.brain.fetch = reachable;

    // The note is the person's, so there is nothing to compare yet.
    expect(report.notices).toEqual([]);
    expect(synced.vault.text("tea.md")).toBe(NEWER);
    expect(await synced.engine.openConflicts()).toEqual([]);
    expect(await synced.vault.exists(COPY)).toBe(false);

    const next = await synced.engine.sync();

    expect(next.notices.map((notice) => notice.kind)).toEqual(["conflict"]);
    expect(synced.vault.text("tea.md")).toBe(STUDIO);
    const open = await synced.engine.openConflicts();
    expect(open).toHaveLength(1);
    expect(open[0]?.yours).toBe(NEWER);
    // The text typed over is not kept twice.
    expect(await synced.brain.conflicts()).toHaveLength(1);
  });
});

describe("two versions that lost in the same second", () => {
  it("are kept as two copies", async () => {
    synced = await withConflict();
    const AGAIN = "# Tea\n\nFrom Studio, again.\n";
    const MINE_AGAIN = "# Tea\n\nFrom Obsidian, again.\n";
    await synced.brain.write("note", "tea", AGAIN);
    synced.vault.setText("tea.md", MINE_AGAIN);

    await synced.engine.sync();

    const open = await synced.engine.openConflicts();
    expect(open.map((one) => one.yours)).toEqual([MINE, MINE_AGAIN]);
    expect(new Set(open.map((one) => one.copy)).size).toBe(2);
    expect(synced.vault.text(COPY)).toBe(MINE);
  });
});

describe("a conflict on a note renamed a moment ago", () => {
  it("is settled on the renamed note, and makes no second note", async () => {
    synced = await withConflict();
    await synced.vault.rename("tea.md", "green-tea.md");
    await synced.engine.noteRenamed("tea.md", "green-tea.md");

    const report = await choose(synced, "mine");

    expect(report.notices).toEqual([]);
    expect(synced.vault.text("green-tea.md")).toBe(MINE);
    expect(await stored(synced, "green-tea")).toBe(MINE);
    expect(await synced.brain.get("note", "tea")).toBeNull();
  });
});

describe("what a settled conflict says of the other files", () => {
  it("says it compared no type, so what is known of them stands", async () => {
    synced = await withConflict();

    expect((await choose(synced, "brain")).scope).toEqual([]);
  });
});

describe("a choice that is no longer there to make", () => {
  it("does nothing for a copy that is not a conflict's", async () => {
    synced = await withConflict();
    synced.vault.setText("Conflicts/other.md", "# Other\n");

    const report = await choose(synced, "mine", "Conflicts/other.md");

    expect(report.uploaded).toEqual([]);
    expect(synced.vault.text("Conflicts/other.md")).toBe("# Other\n");
    expect(await synced.engine.openConflicts()).toHaveLength(1);
  });
});

describe("the first sync of a vault that differs from the brain", () => {
  it("leaves the replaced files as conflicts to settle", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", STUDIO);
    synced.vault.setText("tea.md", MINE);

    await connect(synced);

    expect(await synced.engine.openConflicts()).toMatchObject([
      {
        path: "tea.md",
        copy: COPY,
        flavor: "text",
        brains: STUDIO,
        yours: MINE,
      },
    ]);

    await choose(synced, "mine");

    expect(await stored(synced, "tea")).toBe(MINE);
    expect(await synced.engine.openConflicts()).toEqual([]);
  });
});
