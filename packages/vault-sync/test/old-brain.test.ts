import { afterEach, describe, expect, it } from "bun:test";
import { DriveClient, type HttpResponse } from "../src";
import { PASSWORD, USERNAME } from "../src/test";
import { connect, fresh, stored, type Synced } from "../src/test";

let synced: Synced | undefined;
afterEach(async () => synced?.brain.close());

/** A brain from before the sync endpoints: it answers them as any unknown path. */
function asOldBrain(made: Synced): void {
  const reachable = made.brain.fetch;
  made.brain.fetch = async (request): Promise<HttpResponse> =>
    request.url.includes("/.brain/")
      ? {
          status: 404,
          headers: {},
          body: new TextEncoder().encode("Not found"),
        }
      : reachable(request);
}

/**
 * The plugin needs a brain with the drive's sync endpoints. An older brain
 * would hold its saves back and refuse its renames, so the plugin does not
 * sync with one, and says which version it needs.
 */
describe("a brain older than the plugin needs", () => {
  it("is not synced with, and nothing is planned, read or written", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");
    synced.vault.setText("coffee.md", "# Coffee\n");
    asOldBrain(synced);

    const report = await synced.engine.sync();

    expect(report.status).toBe("old-brain");
    expect(report.firstSync).toBeUndefined();
    expect(await synced.vault.listFiles()).toEqual(["coffee.md"]);
    expect(await synced.brain.get("note", "coffee")).toBeNull();
    expect((await synced.engine.applyFirstSync()).status).toBe("old-brain");
  });

  it("stops a vault that was syncing, and changes nothing", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");
    await connect(synced);
    // The brain was rolled back to an older release.
    const again = synced.device();
    asOldBrain(synced);
    await again.store.save(synced.store.current);
    again.vault.setText("tea.md", "# Tea, mine\n");

    const report = await again.engine.sync();

    expect(report.status).toBe("old-brain");
    expect((await again.engine.syncFile("tea.md")).status).toBe("old-brain");
    expect(await stored(synced, "tea")).toBe("# Tea\n");
  });

  it("is told apart from a brain that has the endpoints", async () => {
    synced = await fresh();
    const made = synced;
    const drive = new DriveClient(
      {
        address: "https://brain.example",
        username: USERNAME,
        password: PASSWORD,
      },
      (request) => made.brain.fetch(request),
    );

    expect(await drive.supportsSync()).toBe(true);
    asOldBrain(made);
    expect(await drive.supportsSync()).toBe(false);
  });
});
