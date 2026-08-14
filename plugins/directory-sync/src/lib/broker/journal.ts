import {
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "fs/promises";
import { join } from "path";
import { z } from "@brains/utils/zod";
import { createId } from "@brains/utils/id";
import { GIT_OPERATION_CLASSES } from "./protocol";
import type { GitOperationClass } from "./protocol";
import { redactSecrets } from "./redaction";

/**
 * Durable request state for the Git execution broker.
 *
 * The journal answers one question: did this Git command reach a terminal
 * result, and if not, is a wrapper still responsible for it? It deliberately
 * does not answer "was the resulting HEAD converted into queue work" — that
 * stays with the `directory-sync.git-reconciliation` checkpoint.
 *
 * Every write is atomic (temp file plus rename) and owner-only, so a crash at
 * any instruction boundary leaves either the previous record or the next one,
 * never a half-written one that a replacement broker might trust.
 */

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

const ACTIVE_PREFIX = "active-";
const TERMINAL_PREFIX = "terminal-";
const RECORD_SUFFIX = ".json";
const QUARANTINE_DIRECTORY = "quarantine";
const ABANDONED_DIRECTORY = "abandoned";
const TEMP_PREFIX = ".tmp-";

export interface ActiveRequestRecord {
  requestId: string;
  repositoryKey: string;
  operationClass: GitOperationClass;
  args: string[];
  startedAt: string;
  stdoutBytes: number;
  stderrBytes: number;
  wrapperPid: number | null;
}

export interface TerminalRequestRecord {
  requestId: string;
  outcome: "exit" | "signal" | "timeout";
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  startedAt: string;
  completedAt: string;
}

export interface BrokerJournalOptions {
  maxOutputBytes?: number | undefined;
}

const activeRecordSchema: z.ZodType<ActiveRequestRecord, ActiveRequestRecord> =
  z.object({
    requestId: z.string().min(1),
    repositoryKey: z.string().min(1),
    operationClass: z.enum(GIT_OPERATION_CLASSES),
    args: z.array(z.string()),
    startedAt: z.string().min(1),
    stdoutBytes: z.number().int().nonnegative(),
    stderrBytes: z.number().int().nonnegative(),
    wrapperPid: z.number().int().nullable(),
  });

const terminalRecordSchema: z.ZodType<
  TerminalRequestRecord,
  TerminalRequestRecord
> = z.object({
  requestId: z.string().min(1),
  outcome: z.enum(["exit", "signal", "timeout"]),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
});

/** Trim to a byte budget without splitting a UTF-8 sequence. */
function boundOutput(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  const encoded = new TextEncoder().encode(text);
  if (encoded.length <= maxBytes) return { text, truncated: false };
  return {
    text: new TextDecoder().decode(encoded.subarray(0, maxBytes)),
    truncated: true,
  };
}

function isRecordFile(name: string): boolean {
  return (
    name.endsWith(RECORD_SUFFIX) &&
    (name.startsWith(ACTIVE_PREFIX) || name.startsWith(TERMINAL_PREFIX))
  );
}

export class BrokerJournal {
  readonly directory: string;
  readonly #maxOutputBytes: number;

  private constructor(directory: string, maxOutputBytes: number) {
    this.directory = directory;
    this.#maxOutputBytes = maxOutputBytes;
  }

  static async open(
    directory: string,
    options: BrokerJournalOptions = {},
  ): Promise<BrokerJournal> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    return new BrokerJournal(
      directory,
      options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    );
  }

  async writeActive(record: ActiveRequestRecord): Promise<void> {
    const safe: ActiveRequestRecord = {
      ...record,
      args: record.args.map(redactSecrets),
    };
    await this.#writeAtomic(this.#activeName(record.requestId), safe);
  }

  async readActive(requestId: string): Promise<ActiveRequestRecord | null> {
    return this.#read(this.#activeName(requestId), activeRecordSchema);
  }

  async listActive(): Promise<ActiveRequestRecord[]> {
    const names = (await readdir(this.directory)).filter((name) =>
      name.startsWith(ACTIVE_PREFIX),
    );
    const records = await Promise.all(
      names.map((name) => this.#read(name, activeRecordSchema)),
    );
    return records.filter(
      (record): record is ActiveRequestRecord => record !== null,
    );
  }

  async clearActive(requestId: string): Promise<void> {
    await unlink(join(this.directory, this.#activeName(requestId))).catch(
      () => undefined,
    );
  }

  /**
   * Retire an active record whose wrapper died without reaching a terminal
   * result. Moved aside rather than deleted: its outcome is genuinely unknown,
   * and the record is the only evidence the request ever ran. It is never
   * re-executed — a retry would be a fresh request with a fresh id, and the
   * checkout's true state is re-derived from Git by the reconciliation
   * checkpoint rather than by replaying a command that may already have
   * applied.
   */
  async abandonActive(requestId: string): Promise<void> {
    const abandoned = join(this.directory, ABANDONED_DIRECTORY);
    await mkdir(abandoned, { recursive: true, mode: 0o700 });
    await rename(
      join(this.directory, this.#activeName(requestId)),
      join(abandoned, this.#activeName(requestId)),
    ).catch(() => undefined);
  }

  async writeTerminal(record: TerminalRequestRecord): Promise<void> {
    const stdout = boundOutput(
      redactSecrets(record.stdout),
      this.#maxOutputBytes,
    );
    const stderr = boundOutput(
      redactSecrets(record.stderr),
      this.#maxOutputBytes,
    );
    const safe: TerminalRequestRecord = {
      ...record,
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: record.truncated || stdout.truncated || stderr.truncated,
    };
    await this.#writeAtomic(this.#terminalName(record.requestId), safe);
  }

  async readTerminal(requestId: string): Promise<TerminalRequestRecord | null> {
    return this.#read(this.#terminalName(requestId), terminalRecordSchema);
  }

  /**
   * Move every unreadable record aside so startup reconciliation sees only
   * records it can trust. Returns the names moved, for the operation history.
   */
  async quarantineCorrupt(): Promise<string[]> {
    const names = (await readdir(this.directory)).filter(isRecordFile);
    const checked = await Promise.all(
      names.map(async (name) => {
        const valid = name.startsWith(ACTIVE_PREFIX)
          ? (await this.#read(name, activeRecordSchema)) !== null
          : (await this.#read(name, terminalRecordSchema)) !== null;
        return { name, valid };
      }),
    );
    const corrupt = checked
      .filter((entry) => !entry.valid)
      .map((entry) => entry.name)
      .sort();

    if (corrupt.length === 0) return [];

    const quarantine = join(this.directory, QUARANTINE_DIRECTORY);
    await mkdir(quarantine, { recursive: true, mode: 0o700 });
    await Promise.all(
      corrupt.map((name) =>
        rename(join(this.directory, name), join(quarantine, name)),
      ),
    );
    return corrupt;
  }

  #activeName(requestId: string): string {
    return `${ACTIVE_PREFIX}${requestId}${RECORD_SUFFIX}`;
  }

  #terminalName(requestId: string): string {
    return `${TERMINAL_PREFIX}${requestId}${RECORD_SUFFIX}`;
  }

  async #writeAtomic(name: string, record: unknown): Promise<void> {
    const temporary = join(this.directory, `${TEMP_PREFIX}${createId(10)}`);
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, join(this.directory, name));
  }

  async #read<T>(name: string, schema: z.ZodType<T, T>): Promise<T | null> {
    const body = await readFile(join(this.directory, name), "utf-8").catch(
      () => null,
    );
    if (body === null) return null;

    const parsed = ((): unknown => {
      try {
        return JSON.parse(body);
      } catch {
        // A crash between write and rename can leave a truncated body. Treat
        // it as absent rather than guessing at the missing half.
        return null;
      }
    })();
    if (parsed === null) return null;

    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  }
}
