import type { WatchState } from "./change-watcher";
import type { FileNote } from "./engine";

/** A running watcher, as the follower holds it. */
export interface Watching {
  state(): WatchState;
  stop(): void;
}

export interface ChangeFollowerOptions {
  /** Start asking the brain a key names for changes. */
  watch: (
    key: string,
    onChange: (types: string[]) => void,
    onReset: () => void,
  ) => Watching;
  /** Fetch what changed in these types. */
  syncTypes: (types: string[]) => Promise<void>;
  /** Changes may have been missed: compare everything. */
  fullSync: () => void;
  /** How long changes are gathered before one sync fetches them. */
  batchMilliseconds?: number;
}

/**
 * Keeps one watcher on the brain a vault syncs with, and turns what it hears
 * into syncs. A watcher is started only when a sync runs, never while the
 * settings are being typed: each keystroke names another address or
 * password, and none of those is asked. Changes that come together are
 * fetched in one sync, and one sync runs at a time.
 */
export class ChangeFollower {
  private readonly options: ChangeFollowerOptions;
  private watching: Watching | undefined;
  private key = "";
  private changed = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private syncing = false;

  constructor(options: ChangeFollowerOptions) {
    this.options = options;
  }

  state(): WatchState {
    return this.watching?.state() ?? "idle";
  }

  /**
   * A sync is about to run for the brain `key` names ("" when the vault is
   * not connected): watch that brain. A watcher that gave up, on a brain
   * with no feed or a refused password, is replaced, so it is asked again.
   */
  follow(key: string): void {
    const gaveUp = ["unsupported", "stopped"].includes(this.state());
    if (key === this.key && this.watching !== undefined && !gaveUp) return;
    this.release();
    this.key = key;
    if (key === "") return;
    const watching: { current?: Watching } = {};
    // Only the watcher this follower holds is heard: one it replaced is not.
    const mine = (): boolean => this.watching === watching.current;
    watching.current = this.options.watch(
      key,
      (types) => {
        if (mine()) this.gather(types);
      },
      () => {
        if (mine()) this.options.fullSync();
      },
    );
    this.watching = watching.current;
  }

  /** The settings now name `key`: stop asking a brain they no longer name. */
  settingsChanged(key: string): void {
    if (key !== this.key) this.release();
  }

  stop(): void {
    this.release();
  }

  private release(): void {
    this.watching?.stop();
    this.watching = undefined;
    this.key = "";
    this.changed.clear();
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private gather(types: readonly string[]): void {
    for (const type of types) this.changed.add(type);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== undefined || this.syncing || this.changed.size === 0) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.fetch();
    }, this.options.batchMilliseconds ?? 1_000);
  }

  /** One sync for everything gathered; what changes meanwhile waits for the next. */
  private async fetch(): Promise<void> {
    const types = [...this.changed];
    this.changed.clear();
    if (types.length === 0) return;
    this.syncing = true;
    try {
      await this.options.syncTypes(types);
    } finally {
      this.syncing = false;
      this.schedule();
    }
  }
}

/** The type whose folder a vault path is in; notes are at the root. */
export function typeOfPath(path: string): string {
  const slash = path.indexOf("/");
  return slash < 0 ? "note" : path.slice(0, slash);
}

/**
 * The files that need attention after a sync. A full sync's list stands as
 * it is. A partial one replaces what was known of the types it compared,
 * and what was known of every other type stays.
 */
export function mergePartial(
  known: readonly FileNote[],
  fresh: readonly FileNote[],
  scope: readonly string[] | undefined,
): FileNote[] {
  if (scope === undefined) return [...fresh];
  const compared = new Set(scope);
  const reported = new Set(fresh.map((note) => note.path));
  return [
    ...known.filter(
      (note) =>
        !compared.has(typeOfPath(note.path)) && !reported.has(note.path),
    ),
    ...fresh,
  ];
}
