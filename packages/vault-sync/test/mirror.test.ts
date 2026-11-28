import { afterEach, describe, expect, it } from "bun:test";
import type { HttpResponse } from "../src";
import { connect, fresh, stored, type Synced } from "../src/test";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

/**
 * Phase 1: the vault mirrors the brain's notes. The brain's structure leads:
 * a note is a file at the vault's top, named by the note's id.
 */
describe("a vault that mirrors the brain's notes", () => {
  it("plans the first sync and writes nothing before the person says yes", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n\nSteep it.\n");

    const report = await synced.engine.sync();

    expect(report.status).toBe("first-sync");
    expect(report.firstSync?.download).toEqual(["tea.md"]);
    expect(await synced.vault.listFiles()).toEqual([]);
    expect(synced.brain.requests.some((r) => r.startsWith("PUT"))).toBe(false);
  });

  it("downloads the brain's notes once the first sync is confirmed", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n\nSteep it.\n");

    const report = await connect(synced);

    expect(report.status).toBe("synced");
    expect(report.downloaded).toEqual(["tea.md"]);
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nSteep it.\n");
  });

  it("follows a note that changes, appears or disappears in the brain", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n\nSteep it.\n");
    await synced.brain.write("note", "coffee", "# Coffee\n");
    await connect(synced);

    await synced.brain.write("note", "tea", "# Tea\n\nThree minutes.\n");
    await synced.brain.write("note", "water", "# Water\n");
    await synced.brain.remove("note", "coffee");
    const report = await synced.engine.sync();

    expect(report.status).toBe("synced");
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nThree minutes.\n");
    expect(synced.vault.text("water.md")).toBe("# Water\n");
    expect(await synced.vault.exists("coffee.md")).toBe(false);
    expect(synced.vault.trashed).toEqual(["coffee.md"]);
  });

  it("does nothing when nothing changed", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");
    await connect(synced);
    synced.brain.requests.length = 0;

    const report = await synced.engine.sync();

    expect(report.downloaded).toEqual([]);
    expect(report.uploaded).toEqual([]);
    // Listings, and the brain's description of its types.
    expect(
      synced.brain.requests.every(
        (r) =>
          r.startsWith("PROPFIND") || r === "GET /dav/.brain/vault-shapes.json",
      ),
    ).toBe(true);
  });

  it("stops at a refused password and changes nothing", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");
    await connect(synced);
    await synced.brain.write("note", "tea", "# Tea, changed\n");
    synced.vault.setText("tea.md", "# Tea, mine\n");
    const engine = synced.engine;
    const reachable = synced.brain.fetch;
    // The app password was revoked.
    synced.brain.fetch = async (): Promise<HttpResponse> => ({
      status: 401,
      headers: {},
      body: new Uint8Array(),
    });

    const report = await engine.sync();

    expect(report.status).toBe("signed-out");
    synced.brain.fetch = reachable;
    expect(synced.vault.text("tea.md")).toBe("# Tea, mine\n");
    expect(await stored(synced, "tea")).toBe("# Tea, changed\n");
  });

  it("leaves everything as it was when the brain cannot be reached", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");
    await connect(synced);
    synced.vault.setText("tea.md", "# Tea, mine\n");
    synced.brain.online = false;

    const report = await synced.engine.sync();

    expect(report.status).toBe("offline");
    synced.brain.online = true;
    // The edit is still there to upload.
    const later = await synced.engine.sync();
    expect(later.uploaded).toEqual(["tea.md"]);
    expect(await stored(synced, "tea")).toBe("# Tea, mine\n");
  });

  it("says there is no drive at an address that has none", async () => {
    synced = await fresh();
    synced.brain.fetch = async (): Promise<HttpResponse> => ({
      status: 404,
      headers: {},
      body: new TextEncoder().encode("Not found"),
    });

    expect((await synced.engine.sync()).status).toBe("no-drive");
  });
});
