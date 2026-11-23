import { afterEach, describe, expect, it } from "bun:test";
import { connect, fresh, stored, type Synced } from "./helpers/setup";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

async function withTea(): Promise<Synced> {
  const made = await fresh();
  await made.brain.write("note", "tea", "# Tea\n\nSteep it.\n");
  await connect(made);
  return made;
}

/** Phase 2: a note edited in the vault reaches the brain. */
describe("editing a note", () => {
  it("uploads a saved note over the version it was edited from", async () => {
    synced = await withTea();
    synced.vault.setText("tea.md", "# Tea\n\nThree minutes.\n");

    const report = await synced.engine.syncFile("tea.md");

    expect(report.uploaded).toEqual(["tea.md"]);
    expect(await stored(synced, "tea")).toBe("# Tea\n\nThree minutes.\n");
    // In step afterwards: the next sync has nothing to do.
    const next = await synced.engine.sync();
    expect(next.uploaded).toEqual([]);
    expect(next.downloaded).toEqual([]);
  });

  it("shows the form the brain stored a note in", async () => {
    synced = await withTea();
    // The note type keeps a stated title in frontmatter and writes it back
    // in its own form.
    synced.vault.setText(
      "tea.md",
      "---\ntitle:    Tea\n---\n\n# Tea\n\nSteep it.\n",
    );

    const report = await synced.engine.sync();

    expect(report.issues).toEqual([]);
    const brainForm = await stored(synced, "tea");
    expect(synced.vault.text("tea.md")).toBe(brainForm);
    const next = await synced.engine.sync();
    expect(next.uploaded).toEqual([]);
    expect(next.downloaded).toEqual([]);
  });

  it("never writes into a note while the person is typing in it", async () => {
    synced = await withTea();
    await synced.brain.write("note", "tea", "# Tea\n\nFrom Studio.\n");
    synced.vault.busy.add("tea.md");

    await synced.engine.sync();

    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nSteep it.\n");
    synced.vault.busy.delete("tea.md");
    await synced.engine.sync();
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nFrom Studio.\n");
  });

  it("uploads a note edited a moment ago when a sync runs", async () => {
    synced = await withTea();
    synced.vault.setText("tea.md", "# Tea\n\nJust typed.\n");
    synced.vault.setText("coffee.md", "# Coffee\n");
    synced.vault.busy.add("tea.md");
    synced.vault.busy.add("coffee.md");

    const report = await synced.engine.sync();

    expect(report.uploaded.sort()).toEqual(["coffee.md", "tea.md"]);
    expect(await stored(synced, "tea")).toBe("# Tea\n\nJust typed.\n");
  });

  it("leaves a note the person changed while it was downloading", async () => {
    synced = await withTea();
    await synced.brain.write("note", "tea", "# Tea\n\nFrom Studio.\n");
    const vault = synced.vault;
    const replace = vault.replaceText.bind(vault);
    // The person types just before the download is written.
    vault.replaceText = async (path, expected, next): Promise<boolean> => {
      vault.setText(path, "# Tea\n\nTyped meanwhile.\n");
      return replace(path, expected, next);
    };

    await synced.engine.sync();

    expect(vault.text("tea.md")).toBe("# Tea\n\nTyped meanwhile.\n");
  });

  it("does not upload what a read-only app password cannot save, and says why", async () => {
    synced = await fresh({ readOnly: true });
    await synced.brain.write("note", "tea", "# Tea\n");
    await connect(synced);
    synced.vault.setText("tea.md", "# Tea, mine\n");

    const report = await synced.engine.sync();

    expect(report.uploaded).toEqual([]);
    expect(report.issues.map((issue) => issue.path)).toEqual(["tea.md"]);
    expect(synced.vault.text("tea.md")).toBe("# Tea, mine\n");
    expect(await stored(synced, "tea")).toBe("# Tea\n");
  });
});

/** Phase 3: an edit made in both places is never lost. */
describe("a note changed in both places", () => {
  it("keeps the brain's version in the vault and the other in Conflicts and the brain", async () => {
    synced = await withTea();
    await synced.brain.write("note", "tea", "# Tea\n\nFrom Studio.\n");
    synced.vault.setText("tea.md", "# Tea\n\nFrom Obsidian.\n");

    const report = await synced.engine.sync();

    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nFrom Studio.\n");
    expect(await stored(synced, "tea")).toBe("# Tea\n\nFrom Studio.\n");
    const copy = "Conflicts/tea 2026-11-22 09.30.15.md";
    expect(synced.vault.text(copy)).toBe("# Tea\n\nFrom Obsidian.\n");
    expect(report.notices).toEqual([
      { kind: "conflict", path: "tea.md", copy, inInbox: true },
    ]);
    const conflicts = await synced.brain.conflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.content).toContain("From Obsidian.");
  });

  it("makes no second conflict or copy on the next sync", async () => {
    synced = await withTea();
    await synced.brain.write("note", "tea", "# Tea\n\nFrom Studio.\n");
    synced.vault.setText("tea.md", "# Tea\n\nFrom Obsidian.\n");
    await synced.engine.sync();

    const again = await synced.engine.sync();

    expect(again.notices).toEqual([]);
    expect(await synced.brain.conflicts()).toHaveLength(1);
    const copies = (await synced.vault.listFiles()).filter((path) =>
      path.startsWith("Conflicts/"),
    );
    expect(copies).toHaveLength(1);
    // The Conflicts folder never goes to the brain.
    expect(await synced.brain.get("note", "Conflicts")).toBeNull();
  });

  it("keeps a second device's losing edit in that device's Conflicts folder", async () => {
    synced = await withTea();
    // A second device saved first; this one's edit loses.
    const other = synced.device();
    await connect(other);
    other.vault.setText("tea.md", "# Tea\n\nOther device.\n");
    await other.engine.sync();
    synced.vault.setText("tea.md", "# Tea\n\nThis device.\n");

    const report = await synced.engine.sync();

    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nOther device.\n");
    const notice = report.notices[0];
    expect(notice?.kind).toBe("conflict");
    if (notice?.kind === "conflict") {
      expect(synced.vault.text(notice.copy)).toBe("# Tea\n\nThis device.\n");
    }
  });
});

/** Phase 4: new notes and deletes, both ways, with the delete rules. */
describe("new notes and deletes", () => {
  it("uploads a new note and downloads one made in the brain", async () => {
    synced = await withTea();
    synced.vault.setText("coffee.md", "# Coffee\n");
    await synced.brain.write("note", "water", "# Water\n");

    const report = await synced.engine.sync();

    expect(report.uploaded).toEqual(["coffee.md"]);
    expect(await stored(synced, "coffee")).toBe("# Coffee\n");
    expect(synced.vault.text("water.md")).toBe("# Water\n");
  });

  it("deletes an entry the person deleted in the vault", async () => {
    synced = await withTea();
    await synced.vault.trash("tea.md");
    await synced.engine.noteDeleted("tea.md");

    const report = await synced.engine.sync();

    expect(report.deletedInBrain).toEqual(["tea.md"]);
    expect(await synced.brain.get("note", "tea")).toBeNull();
  });

  it("brings an entry back when it changed in the brain after the person deleted it", async () => {
    synced = await withTea();
    await synced.vault.trash("tea.md");
    await synced.engine.noteDeleted("tea.md");
    await synced.brain.write("note", "tea", "# Tea\n\nFrom Studio.\n");

    await synced.engine.sync();

    expect(await stored(synced, "tea")).toBe("# Tea\n\nFrom Studio.\n");
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nFrom Studio.\n");
  });

  it("deletes nothing for files that went missing without a delete, and asks", async () => {
    synced = await withTea();
    await synced.brain.write("note", "coffee", "# Coffee\n");
    await synced.engine.sync();
    // The vault folder was emptied outside Obsidian.
    synced.vault.files.clear();

    const report = await synced.engine.sync();

    expect(report.deletedInBrain).toEqual([]);
    expect(report.decision?.localMissing.sort()).toEqual([
      "coffee.md",
      "tea.md",
    ]);
    expect(await synced.brain.get("note", "tea")).not.toBeNull();

    const restored = await synced.engine.resolveDeletes({
      localMissing: { paths: ["coffee.md", "tea.md"], action: "restore" },
    });
    expect(restored.downloaded.sort()).toEqual(["coffee.md", "tea.md"]);
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nSteep it.\n");
  });

  it("asks before deleting more than five entries at once, and deletes on a yes", async () => {
    synced = await fresh();
    const ids = ["a", "b", "c", "d", "e", "f"];
    for (const id of ids) await synced.brain.write("note", id, `# ${id}\n`);
    await connect(synced);
    for (const id of ids) {
      await synced.vault.trash(`${id}.md`);
      await synced.engine.noteDeleted(`${id}.md`);
    }

    const report = await synced.engine.sync();

    expect(report.deletedInBrain).toEqual([]);
    expect(report.decision?.localMissing).toHaveLength(6);
    const decided = await synced.engine.resolveDeletes({
      localMissing: {
        paths: report.decision?.localMissing ?? [],
        action: "delete",
      },
    });
    expect(decided.deletedInBrain).toHaveLength(6);
    expect(await synced.brain.get("note", "a")).toBeNull();
  });

  it("asks before trashing more than five files the brain deleted", async () => {
    synced = await fresh();
    const ids = ["a", "b", "c", "d", "e", "f"];
    for (const id of ids) await synced.brain.write("note", id, `# ${id}\n`);
    await connect(synced);
    for (const id of ids) await synced.brain.remove("note", id);

    const report = await synced.engine.sync();

    expect(report.trashed).toEqual([]);
    expect(report.decision?.remoteGone).toHaveLength(6);
    // Kept: the files go back into the brain.
    const kept = await synced.engine.resolveDeletes({
      remoteGone: { paths: report.decision?.remoteGone ?? [], action: "keep" },
    });
    expect(kept.uploaded).toHaveLength(6);
    expect(await stored(synced, "a")).toBe("# a\n");
  });

  it("keeps an edit to a note the brain deleted as a new entry", async () => {
    synced = await withTea();
    await synced.brain.remove("note", "tea");
    synced.vault.setText("tea.md", "# Tea\n\nStill mine.\n");

    await synced.engine.sync();

    expect(await stored(synced, "tea")).toBe("# Tea\n\nStill mine.\n");
  });

  it("keeps a file in the vault that the brain has no place for, and says why", async () => {
    synced = await withTea();
    synced.vault.setText("Projects/plan.md", "# Plan\n");
    synced.vault.setText("diagram.canvas", "{}");

    const report = await synced.engine.sync();

    expect(report.localOnly.map((file) => file.path).sort()).toEqual([
      "Projects/plan.md",
      "diagram.canvas",
    ]);
    expect(report.uploaded).toEqual([]);
    expect(await synced.brain.get("note", "plan")).toBeNull();
  });
});

/** Phase 5: the first sync of a vault that already holds files. */
describe("the first sync of a vault that already holds files", () => {
  it("plans every case and writes nothing before the yes", async () => {
    synced = await fresh();
    await synced.brain.write("note", "brain-only", "# Brain only\n");
    await synced.brain.write("note", "same", "# Same\n");
    await synced.brain.write("note", "differs", "# Differs, brain\n");
    synced.vault.setText("vault-only.md", "# Vault only\n");
    synced.vault.setText("same.md", "# Same\n");
    synced.vault.setText("differs.md", "# Differs, vault\n");
    synced.vault.setText("Projects/plan.md", "# Plan\n");
    const before = await synced.vault.listFiles();

    const report = await synced.engine.sync();

    expect(report.firstSync).toEqual({
      download: ["brain-only.md"],
      upload: ["vault-only.md"],
      agreed: ["same.md"],
      replace: ["differs.md"],
      localOnly: [expect.objectContaining({ path: "Projects/plan.md" })],
    });
    expect(await synced.vault.listFiles()).toEqual(before);
    expect(await synced.brain.get("note", "vault-only")).toBeNull();
  });

  it("makes the plan on a yes, putting the vault's differing file aside", async () => {
    synced = await fresh();
    await synced.brain.write("note", "brain-only", "# Brain only\n");
    await synced.brain.write("note", "same", "# Same\n");
    await synced.brain.write("note", "differs", "# Differs, brain\n");
    synced.vault.setText("vault-only.md", "# Vault only\n");
    synced.vault.setText("same.md", "# Same\n");
    synced.vault.setText("differs.md", "# Differs, vault\n");

    const report = await connect(synced);

    expect(report.status).toBe("synced");
    expect(synced.vault.text("brain-only.md")).toBe("# Brain only\n");
    expect(await stored(synced, "vault-only")).toBe("# Vault only\n");
    expect(synced.vault.text("differs.md")).toBe("# Differs, brain\n");
    expect(synced.vault.text("Conflicts/differs 2026-11-22 09.30.15.md")).toBe(
      "# Differs, vault\n",
    );
    // Never edits of the brain's version: nothing goes to the Inbox.
    expect(await synced.brain.conflicts()).toEqual([]);
    const next = await synced.engine.sync();
    expect(next.uploaded).toEqual([]);
    expect(next.downloaded).toEqual([]);
  });
});
