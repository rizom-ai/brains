import { randomUUID } from "node:crypto";
import type { TransactionMode } from "@libsql/client";
import type { ExecutionOwner, OwnedTransaction } from "./ownership";

export interface LeaseBindings<Claim> {
  /** Validate all claims before attaching; a rejected attachment must be atomic. */
  attach(lease: string, claims: Claim[]): void;
  finishLease(lease: string): void;
}

/** Worker-local registry. Bindings attach BEFORE waiting for the execution gate.
 * Binding cleanup drops logical references; its implementation must not refund
 * uncertain native ownership. No automatic rollback/retry/recovery is added here.
 */
export class LeaseRegistry<Claim> {
  private readonly leases = new Map<string, OwnedTransaction>();
  private readonly owner: ExecutionOwner;
  private readonly bindings: LeaseBindings<Claim>;
  public constructor(owner: ExecutionOwner, bindings: LeaseBindings<Claim>) {
    this.owner = owner;
    this.bindings = bindings;
  }
  public get(id: string): OwnedTransaction {
    const lease = this.leases.get(id);
    if (!lease || lease.closed)
      throw new Error("Unknown or finished transaction lease");
    return lease;
  }
  public async begin(mode: TransactionMode, claims: Claim[]): Promise<string> {
    this.owner.assertHealthy();
    const token = randomUUID();
    this.bindings.attach(token, claims);
    try {
      const lease = await this.owner.transaction(mode);
      this.leases.set(token, lease);
      return token;
    } catch (error) {
      this.releaseBindings(token, { error });
      throw error;
    }
  }
  public async finish(
    id: string,
    action: "commit" | "rollback",
  ): Promise<void> {
    const lease = this.get(id);
    let primary: { error: unknown } | undefined;
    try {
      await lease[action]();
    } catch (error) {
      primary = { error };
    } finally {
      this.leases.delete(id);
      this.releaseBindings(id, primary);
    }
    if (primary) throw primary.error;
  }
  private releaseBindings(id: string, primary?: { error: unknown }): void {
    try {
      this.bindings.finishLease(id);
    } catch (cleanup) {
      const failure = primary
        ? new AggregateError(
            [primary.error, cleanup],
            "Transaction and binding cleanup failed",
            { cause: cleanup },
          )
        : cleanup;
      this.owner.poison("lease binding cleanup", failure);
      throw failure; // Do not lose a new cleanup cause behind an already-cached owner failure.
    }
  }
}
