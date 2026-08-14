import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrokerJournal } from "../../../src/lib/broker/journal";
import type {
  ActiveRequestRecord,
  TerminalRequestRecord,
} from "../../../src/lib/broker/journal";

let scratch: string | undefined;

async function openJournal(): Promise<BrokerJournal> {
  scratch = await mkdtemp(join(tmpdir(), "broker-journal-"));
  return BrokerJournal.open(join(scratch, "git-broker"));
}

function activeRecord(
  overrides: Partial<ActiveRequestRecord> = {},
): ActiveRequestRecord {
  return {
    requestId: "req_0123456789ab",
    repositoryKey: "brain-data",
    operationClass: "network",
    args: ["pull", "--ff-only"],
    startedAt: "2026-08-14T07:00:00.000Z",
    stdoutBytes: 0,
    stderrBytes: 0,
    wrapperPid: 4242,
    ...overrides,
  };
}

function terminalRecord(
  overrides: Partial<TerminalRequestRecord> = {},
): TerminalRequestRecord {
  return {
    requestId: "req_0123456789ab",
    outcome: "exit",
    exitCode: 0,
    signal: null,
    stdout: "Already up to date.\n",
    stderr: "",
    truncated: false,
    startedAt: "2026-08-14T07:00:00.000Z",
    completedAt: "2026-08-14T07:00:01.000Z",
    ...overrides,
  };
}

async function mode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("broker journal", () => {
  it("creates its directory with owner-only permissions", async () => {
    const journal = await openJournal();
    expect(await mode(journal.directory)).toBe(0o700);
  });

  it("round-trips an active record and lists it", async () => {
    const journal = await openJournal();
    const record = activeRecord();
    await journal.writeActive(record);

    expect(await journal.readActive(record.requestId)).toEqual(record);
    expect(await journal.listActive()).toEqual([record]);
  });

  it("round-trips a terminal record", async () => {
    const journal = await openJournal();
    const record = terminalRecord();
    await journal.writeTerminal(record);

    expect(await journal.readTerminal(record.requestId)).toEqual(record);
  });

  it("writes records readable only by their owner", async () => {
    const journal = await openJournal();
    await journal.writeActive(activeRecord());
    const entries = await readdir(journal.directory);
    const modes = await Promise.all(
      entries.map((entry) => mode(join(journal.directory, entry))),
    );

    expect(entries.length).toBeGreaterThan(0);
    expect(modes.every((value) => value === 0o600)).toBe(true);
  });

  it("clears an active record once it is terminal", async () => {
    const journal = await openJournal();
    await journal.writeActive(activeRecord());
    await journal.writeTerminal(terminalRecord());
    await journal.clearActive("req_0123456789ab");

    expect(await journal.readActive("req_0123456789ab")).toBeNull();
    expect(await journal.listActive()).toEqual([]);
  });

  it("returns null for an unknown request", async () => {
    const journal = await openJournal();
    expect(await journal.readTerminal("req_missing00000")).toBeNull();
    expect(await journal.readActive("req_missing00000")).toBeNull();
  });

  it("quarantines a partially written record instead of trusting it", async () => {
    const journal = await openJournal();
    const record = activeRecord();
    await journal.writeActive(record);
    // A crash between open and fsync leaves a truncated JSON body.
    const [name] = await readdir(journal.directory);
    if (!name) throw new Error("expected a written record");
    await writeFile(join(journal.directory, name), '{"requestId":"req_012');

    expect(await journal.readActive(record.requestId)).toBeNull();
    expect(await journal.quarantineCorrupt()).toEqual([name]);
    expect(await readdir(journal.directory)).not.toContain(name);
  });

  it("quarantines a record whose shape no longer matches its schema", async () => {
    const journal = await openJournal();
    await journal.writeActive(activeRecord());
    const [name] = await readdir(journal.directory);
    if (!name) throw new Error("expected a written record");
    await writeFile(
      join(journal.directory, name),
      JSON.stringify({ requestId: "req_0123456789ab", unexpected: true }),
    );

    expect(await journal.listActive()).toEqual([]);
    expect(await journal.quarantineCorrupt()).toEqual([name]);
  });

  it("never persists credentials from arguments or output", async () => {
    const journal = await openJournal();
    await journal.writeActive(
      activeRecord({
        args: ["clone", "https://x-access-token:secret123@example.com/r.git"],
      }),
    );
    await journal.writeTerminal(
      terminalRecord({
        stderr:
          "fatal: could not read from https://x-access-token:secret123@example.com/r.git",
      }),
    );

    const entries = await readdir(journal.directory);
    const bodies = await Promise.all(
      entries.map((entry) => Bun.file(join(journal.directory, entry)).text()),
    );
    const joined = bodies.join("\n");

    expect(joined).not.toContain("secret123");
    expect(joined).toContain("<redacted>");
  });

  it("bounds captured output and records the truncation", async () => {
    const journal = await openJournal();
    const journalWithBound = await BrokerJournal.open(
      join(journal.directory, "..", "bounded"),
      { maxOutputBytes: 32 },
    );
    await journalWithBound.writeTerminal(
      terminalRecord({ stdout: "x".repeat(4096) }),
    );
    const stored = await journalWithBound.readTerminal("req_0123456789ab");

    expect(stored?.stdout.length).toBeLessThanOrEqual(32);
    expect(stored?.truncated).toBe(true);
  });
});
