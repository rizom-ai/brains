import { afterEach, describe, expect, it } from "bun:test";
import { ChangeWatcher, DriveClient, type HttpResponse } from "../src";
import { PASSWORD, USERNAME } from "../src/test";
import { connect, fresh, stored, type Synced } from "../src/test";

let synced: Synced | undefined;
let watcher: ChangeWatcher | undefined;
afterEach(async () => {
  watcher?.stop();
  watcher = undefined;
  await synced?.brain.close();
});

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

async function withTeaAndCup(): Promise<Synced> {
  const made = await fresh();
  await made.brain.write("note", "tea", "# Tea\n");
  await connect(made);
  await made.vault.write("image/cup.png", PNG);
  await made.engine.sync();
  made.brain.requests.length = 0;
  return made;
}

function driveOf(made: Synced): DriveClient {
  return new DriveClient(
    {
      address: "https://brain.example",
      username: USERNAME,
      password: PASSWORD,
    },
    (request) => made.brain.fetch(request),
  );
}

/** A sync of only the types the brain said changed. */
describe("following a change the brain told of", () => {
  it("fetches a changed note with one listing, and lists no other folder", async () => {
    synced = await withTeaAndCup();
    await synced.brain.write("note", "tea", "# Tea\n\nFrom Studio.\n");

    const report = await synced.engine.syncTypes(["note"]);

    expect(report.downloaded).toEqual(["tea.md"]);
    expect(synced.vault.text("tea.md")).toBe("# Tea\n\nFrom Studio.\n");
    expect(synced.brain.requests).toEqual([
      "PROPFIND /dav/",
      "GET /dav/tea.md",
    ]);
  });

  it("leaves every file of another type as it is", async () => {
    synced = await withTeaAndCup();
    // Changed here, not yet sent: not this sync's to touch.
    synced.vault.busy.add("image/cup.png");
    await synced.brain.remove("note", "tea");

    const report = await synced.engine.syncTypes(["note"]);

    expect(report.trashed).toEqual(["tea.md"]);
    expect(report.decision).toBeUndefined();
    expect(await synced.vault.exists("image/cup.png")).toBe(true);
    expect(synced.store.current.paths["image/cup.png"]).toBeDefined();
  });

  it("fetches a new entry in a type's folder", async () => {
    synced = await withTeaAndCup();
    const other = synced.device();
    await connect(other);
    await other.vault.write("image/pot.png", PNG);
    await other.engine.sync();
    synced.brain.requests.length = 0;

    const report = await synced.engine.syncTypes(["image"]);

    expect(report.downloaded).toEqual(["image/pot.png"]);
    expect(synced.brain.requests).toEqual([
      "PROPFIND /dav/",
      "PROPFIND /dav/image/",
      "GET /dav/image/pot.png",
    ]);
  });

  it("still sends an edit made here to a type that changed", async () => {
    synced = await withTeaAndCup();
    synced.vault.setText("coffee.md", "# Coffee\n");

    await synced.engine.syncTypes(["note"]);

    expect(await stored(synced, "coffee")).toBe("# Coffee\n");
  });

  it("does nothing before the first sync is confirmed, and does not call the vault synced", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");

    const report = await synced.engine.syncTypes(["note"]);

    expect(await synced.vault.listFiles()).toEqual([]);
    expect(report.status).toBe("first-sync");
    expect((await synced.engine.syncFile("tea.md")).status).toBe("first-sync");
  });

  it("asks the brain nothing about a type the vault does not hold", async () => {
    synced = await withTeaAndCup();

    // The brain's own record of lost edits, and a type this brain has not.
    const report = await synced.engine.syncTypes(["conflict", "wishlist"]);

    expect(synced.brain.requests).toEqual([]);
    expect(report.scope).toEqual([]);
  });

  it("says which types it compared", async () => {
    synced = await withTeaAndCup();

    expect((await synced.engine.syncTypes(["note", "conflict"])).scope).toEqual(
      ["note"],
    );
    expect((await synced.engine.sync()).scope).toBeUndefined();
  });
});

/** The plugin waits on the brain for changes, and is told as they happen. */
describe("waiting for the brain's changes", () => {
  it("hears the type of an entry changed in the brain", async () => {
    synced = await fresh();
    await synced.brain.write("note", "tea", "# Tea\n");
    const heard: string[][] = [];
    watcher = new ChangeWatcher({
      drive: driveOf(synced),
      waitSeconds: 1,
      onChange: (types): void => {
        heard.push(types);
      },
      onReset: (): void => {
        heard.push(["reset"]);
      },
    });
    watcher.start();
    await Bun.sleep(100);

    await synced.brain.write("note", "tea", "# Tea\n\nFrom Studio.\n");
    await Bun.sleep(200);

    expect(heard).toEqual([["note"]]);
    expect(watcher.state()).toBe("watching");
  });

  it("asks to compare everything when the brain cannot place its cursor", async () => {
    synced = await fresh();
    const made = synced;
    const reachable = made.brain.fetch;
    let asked = 0;
    // The brain restarted between two asks.
    made.brain.fetch = async (request): Promise<HttpResponse> => {
      if (!request.url.includes("/.brain/changes")) return reachable(request);
      asked += 1;
      return {
        status: 200,
        headers: {},
        body: new TextEncoder().encode(
          JSON.stringify(
            asked === 2
              ? { cursor: "new-run:0", reset: true }
              : { cursor: `run:${asked}`, types: [] },
          ),
        ),
      };
    };
    const heard: string[] = [];
    watcher = new ChangeWatcher({
      drive: driveOf(made),
      waitSeconds: 0,
      onChange: (): void => {
        heard.push("change");
      },
      onReset: (): void => {
        heard.push("reset");
      },
    });
    watcher.start();
    await Bun.sleep(100);
    watcher.stop();

    expect(heard).toEqual(["reset"]);
  });

  it("stops asking a brain that has no change feed", async () => {
    synced = await fresh();
    const made = synced;
    const reachable = made.brain.fetch;
    let asked = 0;
    made.brain.fetch = async (request): Promise<HttpResponse> => {
      if (!request.url.includes("/.brain/changes")) return reachable(request);
      asked += 1;
      return { status: 404, headers: {}, body: new Uint8Array() };
    };
    watcher = new ChangeWatcher({
      drive: driveOf(made),
      waitSeconds: 0,
      onChange: (): void => undefined,
      onReset: (): void => undefined,
    });
    watcher.start();
    await Bun.sleep(100);

    expect(asked).toBe(1);
    expect(watcher.state()).toBe("unsupported");
  });

  it("keeps asking, more slowly, while the brain cannot be reached", async () => {
    synced = await fresh();
    synced.brain.online = false;
    const heard: string[] = [];
    watcher = new ChangeWatcher({
      drive: driveOf(synced),
      waitSeconds: 0,
      retryMilliseconds: 20,
      onChange: (): void => {
        heard.push("change");
      },
      onReset: (): void => {
        heard.push("reset");
      },
    });
    watcher.start();
    await Bun.sleep(60);
    expect(watcher.state()).toBe("retrying");
    synced.brain.online = true;
    await Bun.sleep(200);

    // Back after a gap: whatever happened meanwhile is found by comparing.
    expect(heard).toEqual(["reset"]);
    expect(watcher.state()).toBe("watching");
  });

  it("asks again from its cursor after a held ask fails, without comparing everything", async () => {
    synced = await fresh();
    const made = synced;
    const asks: (string | null)[] = [];
    let heldFailures = 2;
    made.brain.fetch = async (request): Promise<HttpResponse> => {
      const since = new URL(request.url).searchParams.get("since");
      asks.push(since);
      if (since === null) {
        return {
          status: 200,
          headers: {},
          body: new TextEncoder().encode('{"cursor":"run:1","types":[]}'),
        };
      }
      // A proxy cuts the held request, twice.
      if (heldFailures > 0) {
        heldFailures -= 1;
        throw new Error("socket hang up");
      }
      return {
        status: 200,
        headers: {},
        body: new TextEncoder().encode(
          since === "run:1"
            ? '{"cursor":"run:2","types":["note"]}'
            : '{"cursor":"run:2","types":[]}',
        ),
      };
    };
    const heard: string[] = [];
    watcher = new ChangeWatcher({
      drive: driveOf(made),
      waitSeconds: 0,
      retryMilliseconds: 10,
      onChange: (types): void => {
        heard.push(types.join(","));
      },
      onReset: (): void => {
        heard.push("reset");
      },
    });
    watcher.start();
    await Bun.sleep(150);
    watcher.stop();

    expect(heard).toEqual(["note"]);
    // The cursor was fetched once; every retry asked from it.
    expect(asks.filter((since) => since === null)).toHaveLength(1);
    expect(asks.slice(1, 4)).toEqual(["run:1", "run:1", "run:1"]);
  });

  it("waits longer each time while held asks keep failing", async () => {
    synced = await fresh();
    const made = synced;
    let held = 0;
    made.brain.fetch = async (request): Promise<HttpResponse> => {
      if (new URL(request.url).searchParams.get("since") === null) {
        return {
          status: 200,
          headers: {},
          body: new TextEncoder().encode('{"cursor":"run:1","types":[]}'),
        };
      }
      held += 1;
      throw new Error("socket hang up");
    };
    const heard: string[] = [];
    watcher = new ChangeWatcher({
      drive: driveOf(made),
      waitSeconds: 0,
      retryMilliseconds: 20,
      onChange: (): void => undefined,
      onReset: (): void => {
        heard.push("reset");
      },
    });
    watcher.start();
    await Bun.sleep(330);
    watcher.stop();

    // 20, 40, 80, 160 ms apart: four or five asks, never dozens.
    expect(held).toBeLessThanOrEqual(5);
    expect(heard).toEqual([]);
  });

  it("stops when the app password is refused", async () => {
    synced = await fresh();
    synced.brain.fetch = async (): Promise<HttpResponse> => ({
      status: 401,
      headers: {},
      body: new Uint8Array(),
    });
    watcher = new ChangeWatcher({
      drive: driveOf(synced),
      waitSeconds: 0,
      onChange: (): void => undefined,
      onReset: (): void => undefined,
    });
    watcher.start();
    await Bun.sleep(50);

    expect(watcher.state()).toBe("stopped");
  });
});
