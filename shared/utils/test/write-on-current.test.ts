import { describe, expect, it } from "bun:test";
import { writeOnCurrent } from "../src/write-on-current";

interface Doc {
  text: string;
  contentHash: string;
}

/** A store of one document that another writer can change at any moment. */
interface DocStore {
  current: Doc | null;
  writes: Array<{ text: string; over: string }>;
  /** Run just before the next write is applied: another writer. */
  beforeNextWrite: (() => void) | undefined;
  read(): Promise<Doc | null>;
  write(
    doc: Doc,
    expectedContentHash: string,
  ): Promise<{ skipReason?: "content-conflict" }>;
}

function store(initial: Doc | null): DocStore {
  const state: DocStore = {
    current: initial,
    writes: [],
    beforeNextWrite: undefined,
    read: async () => state.current,
    write: async (doc, expectedContentHash) => {
      state.beforeNextWrite?.();
      state.beforeNextWrite = undefined;
      if (state.current?.contentHash !== expectedContentHash) {
        return { skipReason: "content-conflict" };
      }
      state.writes.push({ text: doc.text, over: expectedContentHash });
      state.current = { text: doc.text, contentHash: `hash:${doc.text}` };
      return {};
    },
  };
  return state;
}

const first: Doc = { text: "one", contentHash: "hash:one" };
const tagged = (doc: Doc): Doc => ({ ...doc, text: `${doc.text} +tag` });

describe("writeOnCurrent", () => {
  it("writes the change over the version it read", async () => {
    const docs = store(first);

    const outcome = await writeOnCurrent({ ...docs, change: tagged });

    expect(outcome).toBe("written");
    expect(docs.writes).toEqual([{ text: "one +tag", over: "hash:one" }]);
  });

  it("does its work again on the current version when another writer got there first", async () => {
    const docs = store(first);
    docs.beforeNextWrite = (): void => {
      docs.current = { text: "edited", contentHash: "hash:edited" };
    };

    const outcome = await writeOnCurrent({ ...docs, change: tagged });

    expect(outcome).toBe("written");
    // The other writer's edit is kept, with the change made on top of it.
    expect(docs.current?.text).toBe("edited +tag");
    expect(docs.writes).toEqual([{ text: "edited +tag", over: "hash:edited" }]);
  });

  it("starts from a version the caller already read, and names it in the write", async () => {
    const docs = store({ text: "edited", contentHash: "hash:edited" });

    // The caller worked from an older read.
    const outcome = await writeOnCurrent({
      ...docs,
      from: first,
      change: tagged,
    });

    expect(outcome).toBe("written");
    expect(docs.current?.text).toBe("edited +tag");
  });

  it("drops the result when the change no longer applies", async () => {
    const docs = store(first);
    docs.beforeNextWrite = (): void => {
      docs.current = { text: "edited", contentHash: "hash:edited" };
    };

    const outcome = await writeOnCurrent({
      ...docs,
      // Work that was done for the first version only.
      change: (doc) => (doc.text === "one" ? tagged(doc) : undefined),
    });

    expect(outcome).toBe("dropped");
    expect(docs.current?.text).toBe("edited");
    expect(docs.writes).toEqual([]);
  });

  it("writes nothing when the entity is gone", async () => {
    const docs = store(null);

    expect(await writeOnCurrent({ ...docs, change: tagged })).toBe("gone");
    expect(docs.writes).toEqual([]);
  });

  it("gives up on an entity that keeps changing", async () => {
    const docs = store(first);
    let edits = 0;
    const write = docs.write;
    const outcome = writeOnCurrent({
      read: docs.read,
      change: tagged,
      write: async (doc, expected) => {
        edits += 1;
        docs.current = { text: `edit ${edits}`, contentHash: `hash:${edits}` };
        return write(doc, expected);
      },
      attempts: 3,
    });

    expect(await outcome.catch((error: unknown) => String(error))).toContain(
      "kept changing",
    );
    expect(edits).toBe(3);
    expect(docs.writes).toEqual([]);
  });
});
