import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { ChangeFeed } from "../src/dav-changes";
import { doc, drive } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

const SYNC = { "x-brain-sync": "1" };
const PATH = "/dav/.brain/changes";

function library(): FakeBrain & { feed: ChangeFeed } {
  const brain = fakeBrain(
    [entity("book", "walden", { content: doc("Walden") })],
    ["note", "post", "book", "book-section"],
  );
  const reader = brain.options.reader;
  brain.options.reader = {
    ...reader,
    getEntityTypeConfig: (
      type,
    ): ReturnType<typeof reader.getEntityTypeConfig> =>
      type === "book-section" ? { containedIn: "book" } : {},
  };
  const feed = new ChangeFeed();
  brain.options.changes = feed;
  return Object.assign(brain, { feed });
}

/** The cursor an answer carries. */
function cursorOf(body: unknown): string {
  return z.object({ cursor: z.string() }).parse(body).cursor;
}

async function changes(
  brain: FakeBrain,
  query: string,
  headers: Record<string, string> = SYNC,
): Promise<{ status: number; body: unknown }> {
  const response = await drive(brain)("GET", `${PATH}${query}`, { headers });
  return {
    status: response.status,
    body: response.status === 200 ? await response.json() : undefined,
  };
}

/**
 * A sync client asks what changed since the cursor it holds, and the brain
 * answers when something does: the vault follows a change within a moment,
 * and an idle vault costs one held request instead of a listing.
 */
describe("the drive's change feed", () => {
  it("gives a first asker a cursor to ask from, and nothing to do", async () => {
    const brain = library();

    const first = await changes(brain, "?wait=0");

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ cursor: expect.any(String), types: [] });
  });

  it("names the types that changed since a cursor, each once, as the vault's folders", async () => {
    const brain = library();
    const first = await changes(brain, "?wait=0");
    const cursor = cursorOf(first.body);
    brain.feed.record("post");
    brain.feed.record("post");
    brain.feed.record("note");
    // A section is in its book's folder.
    brain.feed.record("book-section");

    const next = await changes(brain, `?since=${cursor}&wait=0`);

    expect(next.body).toEqual({
      cursor: expect.any(String),
      types: ["post", "note", "book"],
    });
    const after = cursorOf(next.body);
    expect(after).not.toBe(cursor);
    expect((await changes(brain, `?since=${after}&wait=0`)).body).toEqual({
      cursor: after,
      types: [],
    });
  });

  it("answers a waiting asker the moment something changes", async () => {
    const brain = library();
    const cursor = cursorOf((await changes(brain, "?wait=0")).body);

    const waiting = changes(brain, `?since=${cursor}&wait=20`);
    await Bun.sleep(20);
    brain.feed.record("note");
    const started = Date.now();
    const answer = await waiting;

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(answer.body).toEqual({
      cursor: expect.any(String),
      types: ["note"],
    });
  });

  it("answers an asker nothing after its wait, with the cursor it had", async () => {
    const brain = library();
    const cursor = cursorOf((await changes(brain, "?wait=0")).body);

    const answer = await changes(brain, `?since=${cursor}&wait=0.05`);

    expect(answer.body).toEqual({ cursor, types: [] });
  });

  it("tells an asker with a cursor it cannot place to compare everything", async () => {
    const brain = library();

    // From before a restart, or too long ago to still be kept.
    const answer = await changes(brain, "?since=another-run:12&wait=0");

    expect(answer.body).toEqual({ cursor: expect.any(String), reset: true });
  });

  it("is there for sync clients only", async () => {
    const brain = library();

    expect((await changes(brain, "?wait=0", {})).status).toBe(404);
  });
});

describe("a change feed", () => {
  it("forgets changes older than it keeps, and says so", () => {
    const feed = new ChangeFeed({ keep: 3 });
    const start = feed.cursor();
    for (const type of ["a", "b", "c", "d"]) feed.record(type);

    expect(feed.since(start)).toEqual({ cursor: feed.cursor(), reset: true });
  });
});
