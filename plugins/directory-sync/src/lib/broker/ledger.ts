import type { BrokerJournal, TerminalRequestRecord } from "./journal";
import type { ExecuteMessage } from "./protocol";

/**
 * Idempotent request accounting for the Git execution broker.
 *
 * Safety invariant 3 of docs/plans/directory-sync-git-execution-broker.md: a
 * lost acknowledgement must never repeat a commit, a conflict resolution, or a
 * push. Every mutation is therefore keyed by request ID, recorded before it
 * runs and again when it finishes, and replayed from the journal rather than
 * re-issued.
 */

export type RequestExecutor = (
  request: ExecuteMessage,
) => Promise<TerminalRequestRecord>;

/**
 * Raised when a request is already owned by a live wrapper — including one
 * left behind by a broker that died. The caller must wait for or recover that
 * request's result; it must not start the command again.
 */
export class RequestInFlightError extends Error {
  readonly requestId: string;

  constructor(requestId: string) {
    super(
      `Git request ${requestId} is already active and must not be re-issued`,
    );
    this.name = "RequestInFlightError";
    this.requestId = requestId;
  }
}

export class BrokerRequestLedger {
  readonly #journal: BrokerJournal;
  readonly #inFlight = new Map<string, Promise<TerminalRequestRecord>>();

  constructor(journal: BrokerJournal) {
    this.#journal = journal;
  }

  /**
   * Deliberately not `async`: the in-flight registration below must happen in
   * the same tick as the call, or two concurrent duplicates would both get
   * past the journal check and run the command twice.
   */
  settle(
    request: ExecuteMessage,
    executor: RequestExecutor,
  ): Promise<TerminalRequestRecord> {
    const running = this.#inFlight.get(request.requestId);
    if (running) return running;

    const settled = this.#settle(request, executor);
    this.#inFlight.set(request.requestId, settled);
    return settled;
  }

  async #settle(
    request: ExecuteMessage,
    executor: RequestExecutor,
  ): Promise<TerminalRequestRecord> {
    try {
      const recorded = await this.#journal.readTerminal(request.requestId);
      if (recorded) return recorded;

      const active = await this.#journal.readActive(request.requestId);
      if (active) throw new RequestInFlightError(request.requestId);

      await this.#journal.writeActive({
        requestId: request.requestId,
        repositoryKey: request.repositoryKey,
        operationClass: request.operationClass,
        args: [...request.args],
        startedAt: new Date().toISOString(),
        stdoutBytes: 0,
        stderrBytes: 0,
        wrapperPid: null,
      });

      const result = await executor(request);
      // Terminal first, then clear: a crash between the two leaves a
      // recoverable duplicate record, never a request with no outcome.
      await this.#journal.writeTerminal(result);
      await this.#journal.clearActive(request.requestId);
      return result;
    } finally {
      this.#inFlight.delete(request.requestId);
    }
  }
}
