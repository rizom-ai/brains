import { afterEach, describe, expect, it } from "bun:test";
import type { HttpResponse } from "../src";
import { connect, fresh, type Synced } from "../src/test";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

/** Count how many downloads are on their way at once, each taking a moment. */
function slowDownloads(made: Synced): { most: () => number } {
  const reachable = made.brain.fetch;
  let now = 0;
  let most = 0;
  made.brain.fetch = async (request): Promise<HttpResponse> => {
    if (request.method !== "GET" || request.url.includes("/.brain/")) {
      return reachable(request);
    }
    now += 1;
    most = Math.max(most, now);
    await Bun.sleep(15);
    try {
      return await reachable(request);
    } finally {
      now -= 1;
    }
  };
  return { most: () => most };
}

const ids = Array.from({ length: 14 }, (_, index) => `note-${index + 1}`);

/**
 * A brain far away answers each request slowly. Files that only need
 * fetching are fetched several at once, so a first sync takes a fraction of
 * the time it would one by one.
 */
describe("downloads", () => {
  it("fetches several files at once on the first sync, never more than six", async () => {
    synced = await fresh();
    for (const id of ids) await synced.brain.write("note", id, `# ${id}\n`);
    const downloads = slowDownloads(synced);

    const report = await connect(synced);

    expect(report.downloaded.sort()).toEqual(
      ids.map((id) => `${id}.md`).sort(),
    );
    for (const id of ids) {
      expect(synced.vault.text(`${id}.md`)).toBe(`# ${id}\n`);
    }
    expect(downloads.most()).toBeGreaterThan(1);
    expect(downloads.most()).toBeLessThanOrEqual(6);
    // In step afterwards.
    const next = await synced.engine.sync();
    expect(next.downloaded).toEqual([]);
    expect(next.uploaded).toEqual([]);
  });

  it("fetches several changed files at once on a later sync", async () => {
    synced = await fresh();
    for (const id of ids) await synced.brain.write("note", id, `# ${id}\n`);
    await connect(synced);
    for (const id of ids) {
      await synced.brain.write("note", id, `# ${id}\n\nChanged.\n`);
    }
    const downloads = slowDownloads(synced);

    const report = await synced.engine.sync();

    expect(report.downloaded).toHaveLength(ids.length);
    expect(synced.vault.text("note-3.md")).toBe("# note-3\n\nChanged.\n");
    expect(downloads.most()).toBeGreaterThan(1);
    expect(downloads.most()).toBeLessThanOrEqual(6);
  });

  it("stops at once, and keeps what it fetched, when the brain goes away halfway", async () => {
    synced = await fresh();
    for (const id of ids) await synced.brain.write("note", id, `# ${id}\n`);
    const made = synced;
    const reachable = made.brain.fetch;
    let fetched = 0;
    made.brain.fetch = async (request): Promise<HttpResponse> => {
      if (request.method === "GET" && !request.url.includes("/.brain/")) {
        fetched += 1;
        if (fetched > 8) throw new Error("connect ECONNREFUSED");
      }
      return reachable(request);
    };
    await made.engine.sync();

    const report = await made.engine.applyFirstSync();

    expect(report.status).toBe("offline");
    made.brain.fetch = reachable;
    const later = await connect(made);
    expect(later.status).toBe("synced");
    for (const id of ids) {
      expect(made.vault.text(`${id}.md`)).toBe(`# ${id}\n`);
    }
  });
});
