import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/runtime-state";
import { attempt, retry } from "./cas-retry";
import { GuestVisitorStore } from "./guest-access";
import {
  guestAdmissionNamespace,
  guestAdmissionStateSchema,
  countUncertainGuestReceipts,
  retainedGuestReceipts,
  type GuestAdmissionState,
} from "./guest-admission-state";

const ledgerPageSize = 100;

interface LedgerSweep {
  failed: boolean;
  uncertain: number;
}

/** No policy application or generation authority. Stored expiries remain usable
 * with guest admission disabled, and each origin keeps its existing kill switch.
 */
export class GuestStateMaintenance {
  private readonly visitors: GuestVisitorStore;
  private readonly ledgers: IRuntimeStateStore<GuestAdmissionState>;
  private visitorCursor: string | undefined;
  private readonly now: () => number;

  constructor(
    runtimeState: IRuntimeStateNamespace,
    now: () => number = Date.now,
  ) {
    this.now = now;
    this.visitors = new GuestVisitorStore(
      runtimeState,
      { enabled: false },
      now,
    );
    this.ledgers = runtimeState.scoped({
      namespace: guestAdmissionNamespace,
      schema: guestAdmissionStateSchema,
    });
  }

  async run(): Promise<void> {
    // One failing store must not starve cleanup in the other namespace.
    const results = await Promise.allSettled([
      this.cleanVisitors(),
      this.cleanLedgers(),
    ]);
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Guest maintenance unavailable");
  }

  private async cleanVisitors(): Promise<void> {
    const result = await this.visitors.cleanup(this.visitorCursor, 100);
    this.visitorCursor = result.nextCursor ?? undefined;
    if (result.uncertain > 0)
      throw new Error("Guest credential writes need reconciliation");
  }

  /** Every origin's ledger is swept on every run, so daemon health reflects
   * the whole deployment each tick rather than one page of it. Pruning is
   * committed before any alert; the reservation itself is kept, since only a
   * verified recovery procedure may release it.
   */
  private async cleanLedgers(): Promise<void> {
    const { failed, uncertain } = await this.sweepLedgers(undefined);
    if (failed) throw new Error("Guest maintenance unavailable");
    if (uncertain > 0)
      throw new Error("Guest execution work needs reconciliation");
  }

  private async sweepLedgers(
    afterKey: string | undefined,
  ): Promise<LedgerSweep> {
    const records = await this.ledgers.list({
      afterKey,
      limit: ledgerPageSize,
    });
    // Contention or invalid state on one origin never skips another.
    const outcomes = await Promise.allSettled(
      records.map((record) => this.cleanLedger(record.key)),
    );
    const page = outcomes.reduce<LedgerSweep>(
      (sweep, outcome) =>
        outcome.status === "fulfilled"
          ? { ...sweep, uncertain: sweep.uncertain + outcome.value }
          : { ...sweep, failed: true },
      { failed: false, uncertain: 0 },
    );
    const last = records.at(-1);
    if (!last || records.length < ledgerPageSize) return page;
    const rest = await this.sweepLedgers(last.key);
    return {
      failed: page.failed || rest.failed,
      uncertain: page.uncertain + rest.uncertain,
    };
  }

  /** Prunes terminal references and returns how much active work is past its deadline. */
  private cleanLedger(key: string): Promise<number> {
    return attempt<number>(
      4,
      async () => {
        const state = await this.ledgers.get(key);
        if (!state) return 0; // Maintenance never recreates a deleted ledger.
        const now = this.now();
        if (!Number.isSafeInteger(now) || now < 0 || now < state.lastSeenAt)
          throw new Error("Guest maintenance unavailable");
        const receipts = retainedGuestReceipts(state, now);
        const uncertain = countUncertainGuestReceipts(state, now);
        if (Object.keys(receipts).length === Object.keys(state.receipts).length)
          return uncertain;
        const committed = await this.ledgers.compareAndSet(key, state, {
          ...state,
          receipts,
          revision: state.revision + 1,
          lastSeenAt: now,
        });
        return committed ? uncertain : retry;
      },
      (): number => {
        throw new Error("Guest maintenance unavailable");
      },
    );
  }
}
