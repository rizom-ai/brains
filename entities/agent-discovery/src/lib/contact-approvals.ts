import {
  A2A_CONTACT_APPROVALS_NAMESPACE,
  a2aContactApprovalSchema,
  type A2AContactApproval,
} from "@brains/contracts";
import type {
  ClassRuntimeState,
  ClassRuntimeStateStore,
} from "@brains/sdk/internal/service-runtime";

/**
 * Which peers this brain may contact. The approval is runtime state: an
 * agent's own `status` shows it and never decides it, since an agent is
 * content anyone with the content repo can edit.
 */
export interface ContactApprovals {
  isApproved(domain: string): Promise<boolean>;
  approve(domain: string, actorUserId?: string): Promise<void>;
  revoke(domain: string, actorUserId?: string): Promise<void>;
  /** Every approved peer's domain. */
  list(): Promise<string[]>;
}

type ApprovalStore = ClassRuntimeStateStore<A2AContactApproval>;

/** The approvals a brain keeps, in the namespace the A2A client reads. */
export function contactApprovalStore(state: ClassRuntimeState): ApprovalStore {
  return state.scoped({
    namespace: A2A_CONTACT_APPROVALS_NAMESPACE,
    schema: a2aContactApprovalSchema,
  });
}

/**
 * The approvals of a brain whose runtime state arrives once its packages
 * are set up: the agent type is declared before then, and its Inbox actions
 * approve and dismiss through this. Until bound nothing is approved, and
 * approving is refused.
 */
export class BoundContactApprovals implements ContactApprovals {
  private store: ApprovalStore | undefined;

  bind(state: ClassRuntimeState): void {
    this.store = contactApprovalStore(state);
  }

  async isApproved(domain: string): Promise<boolean> {
    return (await this.store?.has(normalized(domain))) ?? false;
  }

  async list(): Promise<string[]> {
    return ((await this.store?.list()) ?? []).map(({ key }) => key).sort();
  }

  async approve(domain: string, actorUserId?: string): Promise<void> {
    await this.bound().set(normalized(domain), {
      approvedAt: new Date().toISOString(),
      ...(actorUserId && { approvedBy: actorUserId }),
    });
  }

  async revoke(domain: string): Promise<void> {
    await this.bound().delete(normalized(domain));
  }

  private bound(): ApprovalStore {
    if (!this.store) {
      throw new Error(
        "The agent directory is not running, so no peer can be approved",
      );
    }
    return this.store;
  }
}

function normalized(domain: string): string {
  return domain.trim().toLowerCase();
}
