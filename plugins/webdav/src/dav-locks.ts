import { randomUUID } from "node:crypto";

export const LOCK_MAX_SECONDS: number = 10 * 60;

export interface DavLock {
  token: string;
  userId: string;
  /** The timeout granted, in seconds. */
  seconds: number;
}

interface HeldLock extends DavLock {
  expires: number;
}

/**
 * Advisory exclusive write locks (RFC 4918 class 2), per path, in memory.
 * macOS Finder and Windows only mount a drive writable when it offers them;
 * what keeps saves correct is still the version check each write makes.
 * A lock belongs to the person who took it and lapses after ten minutes at
 * most, so a client that vanished never holds a file for long.
 */
export class LockStore {
  private readonly locks = new Map<string, HeldLock>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Lock a path; nothing when someone holds it already. */
  acquire(
    segments: string[],
    userId: string,
    seconds: number,
  ): DavLock | undefined {
    if (this.live(segments)) return undefined;
    const lock: HeldLock = {
      token: `opaquelocktoken:${randomUUID()}`,
      userId,
      seconds,
      expires: this.now() + seconds * 1000,
    };
    this.locks.set(segments.join("/"), lock);
    return lock;
  }

  /** Extend a lock its holder names by token; nothing when it is not theirs or has lapsed. */
  refresh(
    segments: string[],
    userId: string,
    ifHeader: string,
    seconds: number,
  ): DavLock | undefined {
    const lock = this.live(segments);
    if (!lock || !holds(lock, userId, ifHeader)) return undefined;
    lock.seconds = seconds;
    lock.expires = this.now() + seconds * 1000;
    return lock;
  }

  release(segments: string[], userId: string, token: string): boolean {
    const lock = this.live(segments);
    if (lock?.userId !== userId || lock.token !== token) return false;
    return this.locks.delete(segments.join("/"));
  }

  /**
   * Whether this person may write to a path: it is unlocked, or they hold
   * its lock and the request's `If` header names the token.
   */
  permits(
    segments: string[],
    userId: string,
    ifHeader: string | null,
  ): boolean {
    const lock = this.live(segments);
    return !lock || holds(lock, userId, ifHeader ?? "");
  }

  private live(segments: string[]): HeldLock | undefined {
    const key = segments.join("/");
    const lock = this.locks.get(key);
    if (lock && lock.expires <= this.now()) {
      this.locks.delete(key);
      return undefined;
    }
    return lock;
  }
}

function holds(lock: DavLock, userId: string, ifHeader: string): boolean {
  return lock.userId === userId && ifHeader.includes(`<${lock.token}>`);
}

/** The timeout a `Timeout` header asks for, in seconds, capped. */
export function requestedLockSeconds(header: string | null): number {
  const asked = /Second-(\d+)/i.exec(header ?? "")?.[1];
  return Math.min(asked ? Number(asked) : LOCK_MAX_SECONDS, LOCK_MAX_SECONDS);
}
