import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrokerJournal } from "../../../src/lib/broker/journal";

/**
 * Phase 5 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * The journal answers one question: what was this generation running, and did
 * it record a terminal result? It deliberately does not answer "what should
 * happen next" — a mutation left ambiguous by a broker replacement is never
 * re-executed from intent, so this exists to *report* ambiguity, not to
 * resolve it. Repository state resolves it.
 */

let scratch: string | undefined;

async function runtimeDir(): Promise<string> {
  scratch = await mkdtemp(join(tmpdir(), "broker-journal-"));
  return scratch;
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("broker journal", () => {
  it("reports what a lost generation left unfinished", async () => {
    const dir = await runtimeDir();
    const first = await BrokerJournal.open(dir);
    expect(first.ambiguous).toEqual([]);

    await first.recordStart({
      requestId: "req_settled0001",
      checkoutPath: "/brain/brain-data",
      operation: "commit",
    });
    await first.recordSettled("req_settled0001", "ok");
    await first.recordStart({
      requestId: "req_lost00000001",
      checkoutPath: "/brain/brain-data",
      operation: "push",
    });

    // The process dies here: no settled record for the push.
    const replacement = await BrokerJournal.open(dir);

    expect(replacement.ambiguous).toHaveLength(1);
    expect(replacement.ambiguous[0]).toMatchObject({
      requestId: "req_lost00000001",
      operation: "push",
      mutating: true,
    });
  });

  it("distinguishes a lost read from a lost mutation", async () => {
    const dir = await runtimeDir();
    const first = await BrokerJournal.open(dir);
    await first.recordStart({
      requestId: "req_readlost0001",
      checkoutPath: "/brain/brain-data",
      operation: "get-status",
    });

    // Recovery may replay a read; it may never replay a mutation. The journal
    // records which kind was lost so that decision is made from a fact.
    const replacement = await BrokerJournal.open(dir);
    expect(replacement.ambiguous[0]).toMatchObject({
      operation: "get-status",
      mutating: false,
    });
  });

  it("starts each generation from its own record", async () => {
    const dir = await runtimeDir();
    const first = await BrokerJournal.open(dir);
    await first.recordStart({
      requestId: "req_lost00000001",
      checkoutPath: "/brain/brain-data",
      operation: "pull",
    });

    const second = await BrokerJournal.open(dir);
    expect(second.ambiguous).toHaveLength(1);

    // The third generation inherits from the second, not from the first: an
    // ambiguity already reported must not be reported forever.
    const third = await BrokerJournal.open(dir);
    expect(third.ambiguous).toEqual([]);
  });

  it("keeps unfinished work when it compacts", async () => {
    const dir = await runtimeDir();
    const journal = await BrokerJournal.open(dir, { maxBytes: 400 });

    await journal.recordStart({
      requestId: "req_survivor0001",
      checkoutPath: "/brain/brain-data",
      operation: "commit",
    });
    for (const index of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const requestId = `req_noise0000${index}`;
      await journal.recordStart({
        requestId,
        checkoutPath: "/brain/brain-data",
        operation: "get-status",
      });
      await journal.recordSettled(requestId, "ok");
    }

    // Compaction is what keeps an unbounded stream of settled work from
    // growing the file; the one thing it may never drop is what is still open.
    const size = (await readFile(join(dir, "broker-journal.jsonl"), "utf-8"))
      .length;
    expect(size).toBeLessThan(2_000);

    const replacement = await BrokerJournal.open(dir);
    expect(replacement.ambiguous.map((entry) => entry.requestId)).toEqual([
      "req_survivor0001",
    ]);
  });

  it("records no credential and no operation arguments", async () => {
    const dir = await runtimeDir();
    const journal = await BrokerJournal.open(dir);
    await journal.recordStart({
      requestId: "req_arguments001",
      checkoutPath: "/brain/brain-data",
      operation: "show-file",
    });

    // Only the shape of the work, never its content: a journal that recorded
    // arguments would be a place for a path or a token to persist.
    const written = await readFile(join(dir, "broker-journal.jsonl"), "utf-8");
    const entry: unknown = JSON.parse(written.trim().split("\n")[0] ?? "{}");
    expect(Object.keys(entry as Record<string, unknown>).sort()).toEqual([
      "checkoutPath",
      "mutating",
      "operation",
      "requestId",
      "startedAt",
    ]);
  });
});
