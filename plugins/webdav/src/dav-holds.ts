import { createHash } from "node:crypto";

/**
 * How long a save is shown back as it was sent. rclone, with its defaults,
 * uploads a closed file after 5 seconds (`--vfs-write-back`), reads its size
 * back at once, and then trusts its listing for 5 minutes
 * (`--dir-cache-time`). Ten minutes outlasts that listing and the first one
 * rclone fetches after it, so the mount keeps agreeing with the upload it
 * verified, and outlasts rclone's longest wait between retries (5 minutes)
 * for an upload already failing when the drive was updated. After it, the
 * next listing has the server's size and the mount reads the server's
 * version. Editors' temporary files are kept as long.
 */
export const SAVE_HOLD_MS: number = 10 * 60 * 1000;

/** The most bytes one app password's held saves keep in memory. */
export const SAVE_HOLD_CAP_BYTES: number = 16 * 1024 * 1024;

export interface SaveHold {
  /** The file exactly as it was sent. */
  bytes: Uint8Array<ArrayBuffer>;
  /** The content hash of the version the brain kept when the save came. */
  storedHash: string;
  /** The conflict that keeps the save, when it lost to a newer version. */
  conflictId?: string | undefined;
  /** When it was saved, which is when it was last held. */
  savedAt: Date;
  /** The ETag the held file is served with: never the stored version's. */
  etag: string;
}

interface Held extends SaveHold {
  until: number;
}

/**
 * Saves the drive answered as saved but did not store as sent: kept as a
 * conflict, or stored in another form. Each is shown back as sent to the app
 * password that sent it, and to nobody else, until the hold ends; in memory,
 * so a restart ends every hold.
 */
export class SaveHolds {
  private readonly held = new Map<string, Map<string, Held>>();
  private readonly now: () => number;
  private readonly capBytes: number;

  constructor(
    now: () => number = Date.now,
    capBytes: number = SAVE_HOLD_CAP_BYTES,
  ) {
    this.now = now;
    this.capBytes = capBytes;
  }

  hold(
    mount: string,
    segments: string[],
    save: Pick<SaveHold, "bytes" | "storedHash" | "conflictId">,
  ): void {
    const holds = this.live(mount);
    const key = segments.join("/");
    holds.delete(key);
    const now = this.now();
    holds.set(key, {
      ...save,
      savedAt: new Date(now),
      etag: `"held-${createHash("sha256").update(save.bytes).digest("hex")}"`,
      until: now + SAVE_HOLD_MS,
    });
    // Newest first, as a Map keeps the order holds were set in: the newest
    // is always held, and once one does not fit, it and every older one go.
    const start: { bytes: number; full: boolean; dropped: string[] } = {
      bytes: 0,
      full: false,
      dropped: [],
    };
    const { dropped } = [...holds]
      .reverse()
      .reduce((fit, [heldKey, h], index) => {
        const bytes = fit.bytes + h.bytes.byteLength;
        return index > 0 && (fit.full || bytes > this.capBytes)
          ? { ...fit, full: true, dropped: [...fit.dropped, heldKey] }
          : { ...fit, bytes };
      }, start);
    dropped.forEach((oldest) => holds.delete(oldest));
  }

  get(mount: string, segments: string[]): SaveHold | undefined {
    return this.live(mount).get(segments.join("/"));
  }

  release(mount: string, segments: string[]): void {
    this.held.get(mount)?.delete(segments.join("/"));
  }

  private live(mount: string): Map<string, Held> {
    const now = this.now();
    const holds = this.held.get(mount) ?? new Map<string, Held>();
    [...holds].forEach(([key, h]) => {
      if (h.until <= now) holds.delete(key);
    });
    this.held.set(mount, holds);
    return holds;
  }
}
