/**
 * A write that reads an entity, changes it and writes it back, without ever
 * passing over a version that changed in between: the write names the
 * version it read, and when that version has moved on, the change is made
 * again on the current one. Background work uses it; it holds no edit a
 * person made, so it records no conflict.
 */
export interface WriteOnCurrentOptions<T extends { contentHash: string }> {
  /** The current version, or null when the entity is gone. */
  read(): Promise<T | null>;
  /** A version the caller already read; read first when not given. */
  from?: T | undefined;
  /**
   * The entity with the change made, from the version given. Undefined when
   * the change no longer applies to that version: the result is dropped.
   */
  change(current: T): T | undefined | Promise<T | undefined>;
  /** Write only over the version with this hash. */
  write(
    entity: T,
    expectedContentHash: string,
  ): Promise<{ skipReason?: "content-conflict" | undefined }>;
  /** How many versions to try before giving up. */
  attempts?: number;
}

export type WriteOnCurrentOutcome = "written" | "dropped" | "gone";

const DEFAULT_ATTEMPTS = 5;

export async function writeOnCurrent<T extends { contentHash: string }>(
  options: WriteOnCurrentOptions<T>,
): Promise<WriteOnCurrentOutcome> {
  return attempt(
    options,
    options.from ?? (await options.read()),
    options.attempts ?? DEFAULT_ATTEMPTS,
  );
}

async function attempt<T extends { contentHash: string }>(
  options: WriteOnCurrentOptions<T>,
  current: T | null,
  attemptsLeft: number,
): Promise<WriteOnCurrentOutcome> {
  if (!current) return "gone";
  const changed = await options.change(current);
  if (changed === undefined) return "dropped";
  const result = await options.write(changed, current.contentHash);
  if (result.skipReason !== "content-conflict") return "written";
  if (attemptsLeft <= 1) {
    throw new Error("The entity kept changing while it was being written");
  }
  return attempt(options, await options.read(), attemptsLeft - 1);
}
