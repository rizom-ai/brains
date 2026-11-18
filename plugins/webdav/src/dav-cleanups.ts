/** How long after a failed-looking save its cleanup delete is expected. */
export const CLEANUP_WINDOW_MS: number = 30 * 1000;

/**
 * Saves a client takes as failed uploads. rclone deletes the file after an
 * upload the server refuses (backend/webdav `Object.Update`), and after one
 * whose size, read back, is not the size it sent (`operations` copy verify,
 * `removeFailedCopy`): the drive storing a file in another form than it was
 * sent is that. On a disk that removes a broken upload; on the drive the
 * file is the entity, so the delete would remove what the person has. The
 * one delete that follows such a save from the same person, without naming
 * a version, is that cleanup and is refused. rclone retries a failed upload
 * every few minutes for as long as it is mounted, so each retry is
 * remembered again.
 */
export class CleanupGuard {
  /** Expiry of the expected cleanup, by person and path. */
  private readonly expected = new Map<string, number>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** A save to this path was refused, or stored in another form. */
  expect(userId: string, segments: string[]): void {
    const now = this.now();
    for (const [key, expires] of this.expected) {
      if (expires <= now) this.expected.delete(key);
    }
    this.expected.set(keyOf(userId, segments), now + CLEANUP_WINDOW_MS);
  }

  /** Whether a delete now is the cleanup after such a save; each is taken once. */
  take(userId: string, segments: string[]): boolean {
    const key = keyOf(userId, segments);
    const expires = this.expected.get(key);
    if (expires === undefined) return false;
    this.expected.delete(key);
    return expires > this.now();
  }
}

function keyOf(userId: string, segments: string[]): string {
  return `${userId}\n${segments.join("/")}`;
}
