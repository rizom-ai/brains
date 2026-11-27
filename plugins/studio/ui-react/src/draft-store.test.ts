import { describe, expect, it } from "bun:test";
import {
  DRAFT_RETENTION_MS,
  clearDrafts,
  draftKey,
  forgetDraft,
  keepDraft,
  recoverDraft,
} from "./draft-store";

/** A browser's storage, in memory. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length(): number {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const at = Date.parse("2026-11-27T14:02:00.000Z");
const key = draftKey("usr_alex", "post:field-notes");

describe("draft recovery storage", () => {
  it("keeps an unsaved draft for this person and entry, and gives it back", () => {
    const storage = memoryStorage();
    keepDraft(storage, key, {
      draft: { title: "Field notes, revised" },
      body: "New body",
      baseContentHash: "hash-1",
      savedAt: at,
      secretFields: [],
    });
    expect(recoverDraft(storage, key, at + 60_000)).toEqual({
      draft: { title: "Field notes, revised" },
      body: "New body",
      baseContentHash: "hash-1",
      savedAt: at,
    });
    expect(draftKey("usr_sam", "post:field-notes")).not.toBe(key);
  });

  it("never stores a field that holds a credential", () => {
    const storage = memoryStorage();
    keepDraft(storage, key, {
      draft: { title: "Agent", token: "s3cret" },
      body: "",
      savedAt: at,
      secretFields: ["token"],
    });
    expect(storage.getItem(key)).not.toContain("s3cret");
    expect(recoverDraft(storage, key, at)?.draft).toEqual({ title: "Agent" });
  });

  it("forgets a draft after seven days, or when it is discarded", () => {
    const storage = memoryStorage();
    const draft = { draft: {}, body: "x", savedAt: at, secretFields: [] };
    keepDraft(storage, key, draft);
    expect(recoverDraft(storage, key, at + DRAFT_RETENTION_MS + 1)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
    keepDraft(storage, key, draft);
    forgetDraft(storage, key);
    expect(recoverDraft(storage, key, at)).toBeNull();
  });

  it("clears every draft of one person at logout and ignores what it cannot read", () => {
    const storage = memoryStorage();
    const draft = { draft: {}, body: "x", savedAt: at, secretFields: [] };
    keepDraft(storage, draftKey("usr_alex", "post:a"), draft);
    keepDraft(storage, draftKey("usr_alex", "note:create"), draft);
    keepDraft(storage, draftKey("usr_sam", "post:a"), draft);
    storage.setItem("studio.navigation.collapsed", "true");
    clearDrafts(storage, "usr_alex");
    expect(
      recoverDraft(storage, draftKey("usr_alex", "post:a"), at),
    ).toBeNull();
    expect(
      recoverDraft(storage, draftKey("usr_sam", "post:a"), at),
    ).not.toBeNull();
    expect(storage.getItem("studio.navigation.collapsed")).toBe("true");
    storage.setItem(key, "not json");
    expect(recoverDraft(storage, key, at)).toBeNull();
  });
});
