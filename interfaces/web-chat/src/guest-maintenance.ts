import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { GuestVisitorStore } from "./guest-access";
import {
  guestAdmissionNamespace,
  guestAdmissionStateSchema,
  retainedGuestReceipts,
  type GuestAdmissionState,
} from "./guest-admission-state";

/** No policy application or generation authority. Stored expiries remain usable
 * with guest admission disabled, and each origin keeps its existing kill switch.
 */
export class GuestStateMaintenance {
  private readonly visitors: GuestVisitorStore;
  private readonly ledgers: IRuntimeStateStore<GuestAdmissionState>;
  private visitorCursor: string | undefined;
  private ledgerCursor: string | undefined;
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
      this.cleanLedgerPage(),
    ]);
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Guest maintenance unavailable");
  }

  private async cleanVisitors(): Promise<void> {
    const result = await this.visitors.cleanup(this.visitorCursor, 100);
    this.visitorCursor = result.nextCursor ?? undefined;
  }

  private async cleanLedgerPage(): Promise<void> {
    const records = await this.ledgers.list({
      afterKey: this.ledgerCursor,
      limit: 1,
    });
    const record = records[0];
    if (!record) {
      this.ledgerCursor = undefined;
      return;
    }
    // Advance even after contention: revisit on the next sweep, not at the
    // expense of every other origin. Invalid pages remain an operator alert.
    this.ledgerCursor = record.key;
    for (let attempt = 0; attempt < 4; attempt++) {
      const state = await this.ledgers.get(record.key);
      if (!state) return; // Maintenance never recreates a deleted ledger.
      const now = this.now();
      if (!Number.isSafeInteger(now) || now < 0 || now < state.lastSeenAt)
        throw new Error("Guest maintenance unavailable");
      const receipts = retainedGuestReceipts(state, now);
      if (Object.keys(receipts).length === Object.keys(state.receipts).length)
        return;
      if (
        await this.ledgers.compareAndSet(record.key, state, {
          ...state,
          receipts,
          revision: state.revision + 1,
          lastSeenAt: now,
        })
      )
        return;
    }
    throw new Error("Guest maintenance unavailable");
  }
}
