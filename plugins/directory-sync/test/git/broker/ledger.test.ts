import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrokerJournal } from "../../../src/lib/broker/journal";
import type { TerminalRequestRecord } from "../../../src/lib/broker/journal";
import {
  BrokerRequestLedger,
  RequestInFlightError,
} from "../../../src/lib/broker/ledger";
import type { ExecuteMessage } from "../../../src/lib/broker/protocol";
import { BROKER_PROTOCOL_VERSION } from "../../../src/lib/broker/protocol";

let scratch: string | undefined;

async function openLedger(): Promise<{
  ledger: BrokerRequestLedger;
  journal: BrokerJournal;
}> {
  scratch = await mkdtemp(join(tmpdir(), "broker-ledger-"));
  const journal = await BrokerJournal.open(join(scratch, "git-broker"));
  return { ledger: new BrokerRequestLedger(journal), journal };
}

function request(overrides: Partial<ExecuteMessage> = {}): ExecuteMessage {
  return {
    type: "execute",
    version: BROKER_PROTOCOL_VERSION,
    requestId: "req_0123456789ab",
    repositoryKey: "brain-data",
    operationClass: "mutate",
    args: ["commit", "-m", "auto-export"],
    ...overrides,
  };
}

function terminal(
  overrides: Partial<TerminalRequestRecord> = {},
): TerminalRequestRecord {
  return {
    requestId: "req_0123456789ab",
    outcome: "exit",
    exitCode: 0,
    signal: null,
    stdout: "[main abc1234] auto-export\n",
    stderr: "",
    truncated: false,
    startedAt: "2026-08-14T07:00:00.000Z",
    completedAt: "2026-08-14T07:00:01.000Z",
    ...overrides,
  };
}

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("broker request ledger", () => {
  it("executes an unseen request once and records its result", async () => {
    const { ledger, journal } = await openLedger();
    let calls = 0;

    const result = await ledger.settle(request(), async () => {
      calls++;
      return terminal();
    });

    expect(calls).toBe(1);
    expect(result).toEqual(terminal());
    expect(await journal.readTerminal("req_0123456789ab")).toEqual(terminal());
    expect(await journal.listActive()).toEqual([]);
  });

  it("returns the recorded result for a duplicate request without re-executing", async () => {
    const { ledger } = await openLedger();
    let calls = 0;
    const executor = async (): Promise<TerminalRequestRecord> => {
      calls++;
      return terminal();
    };

    const first = await ledger.settle(request(), executor);
    const second = await ledger.settle(request(), executor);

    expect(calls).toBe(1);
    expect(second).toEqual(first);
  });

  it("never repeats a mutation after the client disconnects before acknowledgement", async () => {
    const { ledger } = await openLedger();
    let commits = 0;

    // The mutation lands and its result is journalled, then the caller goes
    // away before it can read the acknowledgement.
    await ledger.settle(request(), async () => {
      commits++;
      return terminal();
    });

    // The reconnecting client retries the same request ID.
    const replayed = await ledger.settle(request(), async () => {
      commits++;
      return terminal();
    });

    expect(commits).toBe(1);
    expect(replayed).toEqual(terminal());
  });

  it("refuses to re-issue a request a dead broker left active", async () => {
    const { ledger, journal } = await openLedger();
    // A previous broker died with its wrapper and Git process group still live.
    await journal.writeActive({
      requestId: "req_0123456789ab",
      repositoryKey: "brain-data",
      operationClass: "mutate",
      args: ["commit", "-m", "auto-export"],
      startedAt: "2026-08-14T07:00:00.000Z",
      stdoutBytes: 0,
      stderrBytes: 0,
      wrapperPid: 4242,
    });

    let calls = 0;
    const outcome = await ledger
      .settle(request(), async () => {
        calls++;
        return terminal();
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      );

    expect(calls).toBe(0);
    expect(outcome).toBeInstanceOf(RequestInFlightError);
  });

  it("executes concurrent duplicates exactly once", async () => {
    const { ledger } = await openLedger();
    let calls = 0;
    const executor = async (): Promise<TerminalRequestRecord> => {
      calls++;
      await Bun.sleep(5);
      return terminal();
    };

    // Same promise, not merely the same value: `settle` must register the
    // in-flight request before it yields, or two same-tick duplicates would
    // both get past the journal check and run the command twice. Asserting
    // identity is what catches a registration moved after an `await`.
    const first = ledger.settle(request(), executor);
    const second = ledger.settle(request(), executor);
    expect(second).toBe(first);

    const outcomes = await Promise.allSettled([first, second]);

    expect(calls).toBe(1);
    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(
      true,
    );
  });

  it("records a failed command without repeating it", async () => {
    const { ledger } = await openLedger();
    let calls = 0;
    const executor = async (): Promise<TerminalRequestRecord> => {
      calls++;
      return terminal({
        outcome: "timeout",
        exitCode: null,
        signal: "SIGKILL",
      });
    };

    const first = await ledger.settle(request(), executor);
    const second = await ledger.settle(request(), executor);

    expect(calls).toBe(1);
    expect(first.outcome).toBe("timeout");
    expect(second).toEqual(first);
  });

  it("leaves an active record behind when the executor never settles", async () => {
    const { ledger, journal } = await openLedger();
    const started = Promise.withResolvers<void>();

    void ledger.settle(request(), async () => {
      started.resolve();
      return new Promise<TerminalRequestRecord>(() => {});
    });
    await started.promise;
    await Bun.sleep(0);

    const active = await journal.listActive();
    expect(active.map((record) => record.requestId)).toEqual([
      "req_0123456789ab",
    ]);
  });
});
