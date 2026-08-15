import { appendFile, mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "@brains/utils/zod";
import { GIT_OPERATIONS, isMutatingOperation } from "./operations";
import type { GitOperationName } from "./operations";

/**
 * What this generation was running, and whether it finished.
 *
 * A broker that is replaced leaves requests whose outcome nobody observed. The
 * journal exists to *report* that, not to resolve it: a mutation made
 * ambiguous by a replacement is never re-executed from intent, because whether
 * it landed is a question only the repository can answer. What this buys is
 * that the ambiguity is known rather than silently assumed away.
 *
 * It records the shape of the work and nothing else — no operation arguments,
 * no remote, no credential. A journal that recorded arguments would be one
 * more place for a path or a token to persist.
 */

const JOURNAL_FILE = "broker-journal.jsonl";
const PREVIOUS_FILE = "broker-journal.prev.jsonl";
const DEFAULT_MAX_BYTES = 1024 * 1024;

export interface JournalStart {
  requestId: string;
  checkoutPath: string;
  operation: GitOperationName;
}

export interface AmbiguousRequest {
  requestId: string;
  checkoutPath: string;
  operation: GitOperationName;
  /** Recovery may replay a read; it may never replay a mutation. */
  mutating: boolean;
  startedAt: number;
}

const startedSchema = z.object({
  requestId: z.string().min(1),
  checkoutPath: z.string().min(1),
  operation: z.enum(GIT_OPERATIONS),
  mutating: z.boolean(),
  startedAt: z.number().int().nonnegative(),
});

const settledSchema = z.object({
  requestId: z.string().min(1),
  settledAt: z.number().int().nonnegative(),
  outcome: z.enum(["ok", "error"]),
});

export interface BrokerJournalOptions {
  now?: (() => number) | undefined;
  maxBytes?: number | undefined;
}

export class BrokerJournal {
  readonly ambiguous: AmbiguousRequest[];

  readonly #path: string;
  readonly #now: () => number;
  readonly #maxBytes: number;
  readonly #open = new Map<string, AmbiguousRequest>();
  #bytes = 0;

  private constructor(
    path: string,
    ambiguous: AmbiguousRequest[],
    options: BrokerJournalOptions,
  ) {
    this.#path = path;
    this.ambiguous = ambiguous;
    this.#now = options.now ?? Date.now;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  /**
   * Read what the previous generation left, then start a clean record.
   *
   * The previous file is kept rather than deleted, so an ambiguity that has
   * been reported once is not reported forever while the evidence survives for
   * anyone investigating.
   */
  static async open(
    runtimeDir: string,
    options: BrokerJournalOptions = {},
  ): Promise<BrokerJournal> {
    await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    const path = join(runtimeDir, JOURNAL_FILE);
    const previous = await readFile(path, "utf-8").catch(() => "");
    const ambiguous = unsettled(previous);

    if (previous.length > 0) {
      await rename(path, join(runtimeDir, PREVIOUS_FILE)).catch(
        () => undefined,
      );
    }
    await writeFile(path, "", { mode: 0o600 });

    return new BrokerJournal(path, ambiguous, options);
  }

  async recordStart(start: JournalStart): Promise<void> {
    const entry: AmbiguousRequest = {
      ...start,
      mutating: isMutatingOperation({ name: start.operation }),
      startedAt: this.#now(),
    };
    this.#open.set(start.requestId, entry);
    await this.#append(JSON.stringify(entry));
  }

  async recordSettled(
    requestId: string,
    outcome: "ok" | "error",
  ): Promise<void> {
    this.#open.delete(requestId);
    await this.#append(
      JSON.stringify({ requestId, settledAt: this.#now(), outcome }),
    );
  }

  async #append(line: string): Promise<void> {
    const payload = `${line}\n`;
    this.#bytes += Buffer.byteLength(payload);
    await appendFile(this.#path, payload);
    if (this.#bytes > this.#maxBytes) await this.#compact();
  }

  /**
   * Settled work is history; open work is the whole point.
   *
   * Rewriting to the still-open entries bounds an otherwise unbounded stream
   * without ever dropping a request whose outcome nobody has observed.
   */
  async #compact(): Promise<void> {
    const retained = [...this.#open.values()]
      .map((entry) => `${JSON.stringify(entry)}\n`)
      .join("");
    await writeFile(this.#path, retained, { mode: 0o600 });
    this.#bytes = Buffer.byteLength(retained);
  }
}

function unsettled(contents: string): AmbiguousRequest[] {
  const open = new Map<string, AmbiguousRequest>();
  for (const line of contents.split("\n")) {
    if (line.length === 0) continue;
    const parsed: unknown = JSON.parse(line);

    const started = startedSchema.safeParse(parsed);
    if (started.success) {
      open.set(started.data.requestId, started.data);
      continue;
    }
    const settled = settledSchema.safeParse(parsed);
    if (settled.success) open.delete(settled.data.requestId);
  }
  return [...open.values()];
}
