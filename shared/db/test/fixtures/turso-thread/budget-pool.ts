// Parent-side bounded metadata ledger, not a native/binary execution path.
import { randomUUID } from "node:crypto";
import { TransferBudget } from "./transfer-budget";
import { NetworkTransferBudget } from "./network-budget";
import { isMainThread, type Worker } from "node:worker_threads";
import { STAGE_BUDGET_BYTES, STAGE_SLOTS } from "./binary-protocol";
import {
  VERIFY_SCRATCH_BYTES,
  VERIFY_SLOTS,
} from "../../../src/turso-worker/blob-protocol";
import {
  budgetGrantSchema,
  type BudgetGrant,
  type BudgetKind,
  type BudgetRequirement,
} from "./budget-protocol";

export const BUDGET_MEMBERS: number = 5;
export interface BudgetStats {
  members: number;
  fencedMembers: number;
  residentBytes: number;
  residentSlots: number;
  scratchBytes: number;
  scratchSlots: number;
}
interface MemberState {
  phase: "unstarted" | "bound" | "fenced" | "exited";
  grants: Map<number, BudgetGrant>;
  lastId: number;
}
export interface BudgetMember {
  bind: (worker: Worker) => void;
  cancelUnstarted: () => void;
  fence: () => void;
  reserve: (id: number, requirement: BudgetRequirement) => BudgetGrant;
  release: (id: number, kind: BudgetKind) => void;
}

/** One 100 MiB/16-slot resident pool and two scratch slots across up to five workers. */
export class ProofBudgetPool {
  public readonly id: string;
  public readonly networkIngress: NetworkTransferBudget =
    new NetworkTransferBudget("ingress");
  public readonly networkEgress: NetworkTransferBudget =
    new NetworkTransferBudget("egress");
  public readonly ingress: TransferBudget = new TransferBudget("ingress");
  public readonly egress: TransferBudget = new TransferBudget("egress");
  private readonly members = new Set<MemberState>();
  public constructor() {
    if (!isMainThread)
      throw new Error(
        "Persistence budget ledger requires the parent controller",
      );
    this.id = randomUUID();
  }
  public stats(): BudgetStats {
    const stats: BudgetStats = {
      members: this.members.size,
      fencedMembers: 0,
      residentBytes: 0,
      residentSlots: 0,
      scratchBytes: 0,
      scratchSlots: 0,
    };
    for (const member of this.members) {
      if (member.phase === "fenced") stats.fencedMembers++;
      for (const grant of member.grants.values()) {
        if (grant.kind === "resident") {
          stats.residentBytes += grant.bytes;
          stats.residentSlots++;
        } else {
          stats.scratchBytes += grant.bytes;
          stats.scratchSlots++;
        }
      }
    }
    return stats;
  }
  public admit(): BudgetMember {
    if (this.members.size >= BUDGET_MEMBERS)
      throw new Error("Persistence budget member capacity exceeded");
    const member: MemberState = {
      phase: "unstarted",
      grants: new Map(),
      lastId: 0,
    };
    this.members.add(member);
    const end = (): void => {
      member.phase = "exited";
      member.grants.clear();
      this.members.delete(member);
    };
    return {
      bind: (worker): void => {
        if (member.phase !== "unstarted")
          throw new Error("Persistence budget member already bound or spent");
        member.phase = "bound";
        // Only an actual worker exit reclaims a bound member's unsettled grants.
        // A rejection, close acknowledgement or terminate request is NOT a join.
        worker.once("exit", end);
      },
      cancelUnstarted: (): void => {
        if (member.phase !== "unstarted")
          throw new Error(
            "Cannot reclaim a bound persistence budget member before exit",
          );
        end();
      },
      fence: (): void => {
        if (member.phase === "bound") member.phase = "fenced";
      },
      reserve: (id, requirement): BudgetGrant => {
        if (member.phase !== "bound")
          throw new Error("Persistence budget member is not live");
        const grant = budgetGrantSchema.parse({
          ...requirement,
          pool: this.id,
          id,
        });
        if (id <= member.lastId)
          throw new Error("Reused persistence budget identity");
        member.lastId = id;
        const stats = this.stats();
        if (grant.kind === "resident") {
          if (
            stats.residentSlots >= STAGE_SLOTS ||
            grant.bytes > STAGE_BUDGET_BYTES - stats.residentBytes
          )
            throw new Error(
              "Binary staging capacity exceeded (shared owner budget)",
            );
        } else {
          if (grant.bytes !== VERIFY_SCRATCH_BYTES)
            throw new Error("Invalid verification scratch reservation");
          if (stats.scratchSlots >= VERIFY_SLOTS)
            throw new Error(
              "BLOB verification scratch capacity exceeded (shared owner budget)",
            );
        }
        member.grants.set(id, { ...grant });
        return grant;
      },
      release: (id, kind): void => {
        if (member.phase !== "bound")
          throw new Error("Persistence budget member is not live");
        const grant = member.grants.get(id);
        if (grant?.kind !== kind)
          throw new Error("Unknown or mismatched persistence budget release");
        member.grants.delete(id);
      },
    };
  }
}
