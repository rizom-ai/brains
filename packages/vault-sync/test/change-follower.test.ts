import { describe, expect, it } from "bun:test";
import {
  ChangeFollower,
  mergePartial,
  type WatchState,
  type Watching,
} from "../src";

interface FakeWatcher {
  key: string;
  current: WatchState;
  stopped: boolean;
  onChange: (types: string[]) => void;
  onReset: () => void;
}

function setup(syncTypes?: (types: string[]) => Promise<void>): {
  follower: ChangeFollower;
  watchers: FakeWatcher[];
  synced: string[][];
  resets: number[];
} {
  const watchers: FakeWatcher[] = [];
  const synced: string[][] = [];
  const resets: number[] = [];
  const follower = new ChangeFollower({
    batchMilliseconds: 10,
    watch: (key, onChange, onReset): Watching => {
      const watcher: FakeWatcher = {
        key,
        current: "watching",
        stopped: false,
        onChange,
        onReset,
      };
      watchers.push(watcher);
      return {
        state: (): WatchState => watcher.current,
        stop: (): void => {
          watcher.stopped = true;
        },
      };
    },
    syncTypes:
      syncTypes ??
      (async (types): Promise<void> => {
        synced.push(types);
      }),
    fullSync: (): void => {
      resets.push(resets.length);
    },
  });
  return { follower, watchers, synced, resets };
}

describe("following the brain's changes", () => {
  it("asks nobody while the settings are being typed", () => {
    const { follower, watchers } = setup();
    follower.follow("https://brain.example/dav/ user secret");

    // Each keystroke is a different brain or password for a moment.
    follower.settingsChanged("https://brain.exampl/dav/ user secret");
    follower.settingsChanged("https://brain.example.co/dav/ user secret");

    expect(watchers).toHaveLength(1);
    expect(watchers[0]?.stopped).toBe(true);
    expect(follower.state()).toBe("idle");
  });

  it("keeps its watcher when the settings end up as they were", () => {
    const { follower, watchers } = setup();
    follower.follow("key");

    follower.settingsChanged("key");

    expect(watchers[0]?.stopped).toBe(false);
  });

  it("asks again, at a sync, a brain that had no feed or refused the password", () => {
    const { follower, watchers } = setup();
    follower.follow("key");
    const [first] = watchers;
    if (!first) throw new Error("no watcher");
    first.current = "unsupported";

    follower.follow("key");

    expect(watchers).toHaveLength(2);
    follower.follow("key");
    expect(watchers).toHaveLength(2);
  });

  it("stops when the vault is no longer connected", () => {
    const { follower, watchers } = setup();
    follower.follow("key");

    follower.follow("");

    expect(watchers[0]?.stopped).toBe(true);
    expect(follower.state()).toBe("idle");
  });

  it("fetches changes that come together in one sync", async () => {
    const { follower, watchers, synced } = setup();
    follower.follow("key");
    watchers[0]?.onChange(["note"]);
    watchers[0]?.onChange(["post", "note"]);

    await Bun.sleep(40);

    expect(synced).toEqual([["note", "post"]]);
  });

  it("runs one sync at a time, and one more for everything that changed meanwhile", async () => {
    const running: string[][] = [];
    let release: (() => void) | undefined;
    const { follower, watchers } = setup(async (types): Promise<void> => {
      running.push(types);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    follower.follow("key");
    const [watcher] = watchers;
    if (!watcher) throw new Error("no watcher");
    watcher.onChange(["note"]);
    await Bun.sleep(30);
    // A burst while the first sync is still running.
    for (const type of ["post", "topic", "post", "note"]) {
      watcher.onChange([type]);
      await Bun.sleep(15);
    }
    expect(running).toEqual([["note"]]);

    release?.();
    await Bun.sleep(40);

    expect(running).toEqual([["note"], ["post", "topic", "note"]]);
    release?.();
  });

  it("passes on the brain's call to compare everything", () => {
    const { follower, watchers, resets } = setup();
    follower.follow("key");

    watchers[0]?.onReset();

    expect(resets).toHaveLength(1);
  });

  it("ignores a watcher it has replaced", async () => {
    const { follower, watchers, synced, resets } = setup();
    follower.follow("old");
    follower.follow("new");

    watchers[0]?.onChange(["note"]);
    watchers[0]?.onReset();
    await Bun.sleep(30);

    expect(synced).toEqual([]);
    expect(resets).toEqual([]);
  });
});

describe("what a partial sync says of the files that need attention", () => {
  const note = (path: string): { path: string; reason: string } => ({
    path,
    reason: `about ${path}`,
  });

  it("replaces what was known of the types it compared, and keeps the rest", () => {
    expect(
      mergePartial(
        [note("tea.md"), note("post/a.md"), note("image/x.png")],
        [note("coffee.md")],
        ["note", "image"],
      ),
    ).toEqual([note("post/a.md"), note("coffee.md")]);
  });

  it("keeps what was known when one file was synced, except of that file", () => {
    const known = [note("tea.md"), note("coffee.md"), note("post/a.md")];

    // A saved file that now went up needs no attention any more.
    expect(mergePartial(known, [], [], ["tea.md"])).toEqual([
      note("coffee.md"),
      note("post/a.md"),
    ]);
    // One that was refused again is listed once, with the new reason.
    expect(
      mergePartial(known, [{ path: "tea.md", reason: "again" }], [], []),
    ).toEqual([
      note("coffee.md"),
      note("post/a.md"),
      { path: "tea.md", reason: "again" },
    ]);
  });

  it("takes a full sync's list as it is", () => {
    expect(mergePartial([note("tea.md")], [note("b.md")], undefined)).toEqual([
      note("b.md"),
    ]);
  });
});
