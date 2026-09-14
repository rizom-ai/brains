import { createHash, randomUUID } from "node:crypto";
import { guestExecutionLimitsSchema } from "@brains/contracts/chat";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { attempt, retry } from "./cas-retry";
import { canAccessGuestConversation, type GuestVisitor } from "./guest-access";
import type { WebChatConversation } from "./conversation-access";
import { guestPolicySchema, type EnabledGuestPolicy } from "./guest-policy";
import {
  guestAdmissionStateSchema,
  guestAdmissionNamespace,
  countUncertainGuestReceipts,
  retainedGuestReceipts,
  type GuestAdmissionState,
  type GuestAdmissionReceipt,
  type GuestAdmissionResult,
  type GuestAdmissionDenial,
  type GuestExecutionLease,
  type GuestTurnOutcome,
} from "./guest-admission-state";

const minuteMs = 60_000;
const dayMs = 86_400_000;
const maxAttempts = 32;
const microUsd = 1_000_000;

function digest(...parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function denied(reason: GuestAdmissionDenial): GuestAdmissionResult {
  return { kind: "denied", reason };
}

interface Transition<T> {
  result: T;
  next?: GuestAdmissionState;
}

/**
 * One CAS ledger reserves every applicable limit together. ALL deployment
 * instances must use the SAME transactional backing database; separate local
 * databases do not provide deployment-wide quotas. No process-local fallback.
 *
 * A lease authorizes one execution only after ownership and runtime cost bounds
 * are checked by the caller. Budget is charged at the approved worst-case turn
 * cost, not refunded on failure. Never settle merely because an SSE client left.
 */
export class GuestAdmission {
  private readonly store: IRuntimeStateStore<GuestAdmissionState>;
  private readonly policy: EnabledGuestPolicy;
  private readonly key: string;
  private readonly policyFingerprint: string;
  private readonly now: () => number;
  private readonly isEnabled: () => boolean;
  private readonly turnCost: number;
  private readonly dailyBudget: number;
  private readonly requireAuthorization: boolean;

  constructor(
    runtimeState: IRuntimeStateNamespace,
    policy: EnabledGuestPolicy,
    options: {
      now?: () => number;
      isEnabled?: () => boolean;
      requireAuthorization?: boolean;
    } = {},
  ) {
    const parsed = guestPolicySchema.parse(policy);
    if (!parsed.enabled) throw new Error("Guest admission unavailable");
    this.policy = parsed;
    this.requireAuthorization = options.requireAuthorization === true;
    if (this.requireAuthorization && !parsed.allowance)
      throw new Error("Guest authorization requires a bounded allowance");
    this.store = runtimeState.scoped({
      namespace: guestAdmissionNamespace,
      schema: guestAdmissionStateSchema,
    });
    // Lifetime usage belongs to the deployment, not a replaceable origin name.
    // Existing maintenance prunes receipts but preserves anonymous usage totals.
    this.key = digest(parsed.allowance ? "guest-allowance" : parsed.origin);
    this.policyFingerprint = digest(JSON.stringify(parsed));
    this.now = options.now ?? Date.now;
    this.isEnabled = options.isEnabled ?? ((): boolean => true);
    // Round reservations up and the available budget down. No floating-point credit.
    this.turnCost = Math.ceil(parsed.budget.maxTurnUsd * microUsd);
    this.dailyBudget = Math.floor(parsed.budget.dailyUsd * microUsd);
    if (
      !Number.isSafeInteger(this.turnCost) ||
      !Number.isSafeInteger(this.dailyBudget) ||
      this.turnCost <= 0 ||
      this.dailyBudget < this.turnCost
    ) {
      throw new Error("Guest budget is not representable safely");
    }
  }

  /** Never creates, refreshes, cleans up or settles a receipt. Caller must own the conversation. */
  async status(
    visitor: GuestVisitor,
    conversation: WebChatConversation,
    submissionId: string,
  ): Promise<GuestAdmissionReceipt["state"] | undefined> {
    if (!submissionId.trim() || submissionId.length > 256) return undefined;
    const now = this.now();
    if (
      !Number.isSafeInteger(now) ||
      !canAccessGuestConversation(conversation, visitor, this.policy, now)
    )
      return undefined;
    const state = await this.store.get(this.key);
    if (!state || now < state.lastSeenAt) return undefined;
    return state.receipts[
      digest(this.policy.origin, visitor.id, conversation.id, submissionId)
    ]?.state;
  }

  /**
   * Visitor must come from a server-owned credential read. Conversation must be
   * an owned history read or a server-minted, unpublished creation candidate.
   * Persist a candidate only after a fresh reservation; never execute against an
   * unpersisted candidate or use a duplicate receipt to recreate deleted history.
   */
  async reserve(
    visitor: GuestVisitor,
    conversation: WebChatConversation,
    submissionId: string,
    message: string,
  ): Promise<GuestAdmissionResult> {
    if (!this.isEnabled()) return denied("unavailable");
    if (
      !submissionId.trim() ||
      submissionId.length > 256 ||
      !message.trim() ||
      message.length > this.policy.limits.messageCharacters
    )
      return denied("invalid-input");
    const key = digest(
      this.policy.origin,
      visitor.id,
      conversation.id,
      submissionId,
    );
    const fingerprint = digest(
      this.policy.origin,
      visitor.id,
      conversation.id,
      submissionId,
      message,
    );
    const visitorKey = digest(this.policy.origin, "visitor", visitor.id);
    const conversationKey = digest(
      this.policy.origin,
      "conversation",
      conversation.id,
    );
    const id = randomUUID();

    return this.transact<GuestAdmissionResult>((state, now) => {
      if (
        !this.isEnabled() ||
        !state.enabled ||
        state.policy !== this.policyFingerprint ||
        (this.requireAuthorization && !this.authorizationMatches(state))
      )
        return { result: denied("unavailable") };
      if (
        !canAccessGuestConversation(conversation, visitor, this.policy, now)
      ) {
        return { result: denied("conversation-unavailable") };
      }
      const previous = state.receipts[key];
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          return { result: denied("submission-conflict") };
        return {
          result: {
            kind: "duplicate",
            state:
              previous.state === "active" && now >= previous.deadline
                ? "uncertain"
                : previous.state,
          },
        };
      }
      if (this.policy.allowance) {
        const usage = state.lifetime;
        if (!usage) return { result: denied("unavailable") };
        if (
          usage.requests >= this.policy.allowance.requests ||
          usage.reservedMicroUsd >
            this.policy.allowance.maxCostMicroUsd - this.turnCost
        )
          return { result: denied("budget-exhausted") };
      }
      const receipts = Object.values(state.receipts);
      const active = receipts.filter((receipt) => receipt.state === "active");
      if (active.some((receipt) => receipt.visitor === visitorKey))
        return { result: denied("visitor-busy") };
      if (active.length >= this.policy.limits.globalConcurrency)
        return { result: denied("deployment-busy") };
      const day = receipts.filter((receipt) => now - receipt.createdAt < dayMs);
      const minute = day.filter(
        (receipt) => now - receipt.createdAt < minuteMs,
      );
      const limits = this.policy.limits;
      if (
        day.filter((receipt) => receipt.visitor === visitorKey).length >=
          limits.requestsPerDay ||
        minute.filter((receipt) => receipt.visitor === visitorKey).length >=
          limits.requestsPerMinute
      ) {
        return { result: denied("visitor-rate-limit") };
      }
      if (
        day.length >= limits.globalRequestsPerDay ||
        minute.length >= limits.globalRequestsPerMinute
      ) {
        return { result: denied("deployment-rate-limit") };
      }
      if (
        receipts.filter((receipt) => receipt.conversation === conversationKey)
          .length >= limits.userTurns
      ) {
        return { result: denied("conversation-limit") };
      }
      // Keep every active reservation funded, even after its admission day.
      // Settled work remains charged for a full day after provider execution ends.
      const funded = receipts.filter(
        (receipt) =>
          receipt.state === "active" ||
          (receipt.settledAt !== undefined && now - receipt.settledAt < dayMs),
      );
      const spent = funded.reduce(
        (sum, receipt) => sum + receipt.reservedMicroUsd,
        0,
      );
      if (!Number.isSafeInteger(spent))
        return { result: denied("unavailable") };
      if (spent > this.dailyBudget - this.turnCost)
        return { result: denied("budget-exhausted") };
      const receipt: GuestAdmissionReceipt = {
        id,
        visitor: visitorKey,
        conversation: conversationKey,
        fingerprint,
        createdAt: now,
        retainUntil: Math.max(
          now + dayMs,
          Date.parse(conversation.startedAt) +
            this.policy.retention.maxAgeSeconds * 1000,
        ),
        deadline: now + this.policy.limits.requestTimeoutSeconds * 1000,
        reservedMicroUsd: this.turnCost,
        state: "active",
      };
      return {
        result: {
          kind: "reserved",
          lease: {
            key,
            id,
            execution: {
              limits: guestExecutionLimitsSchema
                .strip()
                .parse(this.policy.limits),
              maxCostMicroUsd: this.turnCost,
            },
          },
        },
        next: {
          ...state,
          receipts: { ...retainedGuestReceipts(state, now), [key]: receipt },
          ...(state.lifetime && this.policy.allowance
            ? {
                lifetime: {
                  requests: state.lifetime.requests + 1,
                  reservedMicroUsd:
                    state.lifetime.reservedMicroUsd + this.turnCost,
                },
              }
            : {}),
        },
      };
    }, denied("unavailable"));
  }

  /** Read-only control state. Missing authorization is closed, never a grant. */
  async accessStatus(): Promise<{
    authorized: boolean;
    enabled: boolean;
    usedRequests: number;
    reservedMicroUsd: number;
  } | null> {
    try {
      const state = await this.store.get(this.key);
      const now = this.now();
      if (
        !Number.isSafeInteger(now) ||
        now < 0 ||
        (state && now < state.lastSeenAt)
      )
        return null;
      if (!state)
        return {
          authorized: false,
          enabled: false,
          usedRequests: 0,
          reservedMicroUsd: 0,
        };
      const usage = state.lifetime;
      const allowance = this.policy.allowance;
      if (!usage || !allowance) return null;
      const authorized =
        this.authorizationMatches(state) &&
        state.policy === this.policyFingerprint;
      return {
        authorized,
        enabled:
          authorized &&
          state.enabled &&
          usage.requests < allowance.requests &&
          usage.reservedMicroUsd <= allowance.maxCostMicroUsd - this.turnCost,
        usedRequests: usage.requests,
        reservedMicroUsd: usage.reservedMicroUsd,
      };
    } catch {
      // Control reads must not reveal storage/accounting details or imply credit.
      return null;
    }
  }

  /** Authenticated operator action only. Repetition/re-enablement never adds credit. */
  async authorize(): Promise<boolean> {
    const allowance = this.policy.allowance;
    if (!this.requireAuthorization || !allowance) return false;
    return this.transact<boolean>((state) => {
      if (
        !state.lifetime ||
        (state.authorization && !this.authorizationMatches(state))
      )
        return { result: false };
      return {
        result: true,
        next: {
          ...state,
          enabled: true,
          policy: this.policyFingerprint,
          authorization: state.authorization ?? {
            origin: this.policy.origin,
            ...allowance,
          },
        },
      };
    }, false);
  }

  private authorizationMatches(state: GuestAdmissionState): boolean {
    const granted = state.authorization;
    const proposed = this.policy.allowance;
    return Boolean(
      granted &&
      proposed &&
      granted.origin === this.policy.origin &&
      granted.requests === proposed.requests &&
      granted.maxCostMicroUsd === proposed.maxCostMicroUsd,
    );
  }

  /** Operator-only action: adopt this policy and shared switch without resetting usage.
   * Never call automatically on restart or expose it through guest admission.
   */
  async applyPolicy(enabled: boolean): Promise<boolean> {
    return this.transact<boolean>(
      (state) => ({
        result: true,
        next: { ...state, enabled, policy: this.policyFingerprint },
      }),
      false,
    );
  }

  /** Call only after the runtime has genuinely finished or acknowledged cancellation. */
  async settle(
    lease: GuestExecutionLease,
    outcome: GuestTurnOutcome,
  ): Promise<boolean> {
    return this.transact<boolean>((state, now) => {
      const receipt = state.receipts[lease.key];
      if (receipt?.id !== lease.id) return { result: false };
      if (receipt.state !== "active")
        return { result: receipt.state === outcome };
      return {
        result: true,
        next: {
          ...state,
          receipts: {
            ...retainedGuestReceipts(state, now),
            [lease.key]: {
              ...receipt,
              state: outcome,
              settledAt: now,
              retainUntil: Math.max(receipt.retainUntil, now + dayMs),
            },
          },
        },
      };
    }, false);
  }

  /** Bounded references outlive content only as required for quotas/deduplication.
   * Active work past its deadline is never released here; it is counted so an
   * operator can reconcile it before it exhausts concurrency or budget.
   */
  async cleanup(): Promise<{ removed: number; uncertain: number } | null> {
    return this.transact<{ removed: number; uncertain: number } | null>(
      (state, now) => {
        const receipts = retainedGuestReceipts(state, now);
        const removed =
          Object.keys(state.receipts).length - Object.keys(receipts).length;
        return {
          result: {
            removed,
            uncertain: countUncertainGuestReceipts(state, now),
          },
          ...(removed > 0 ? { next: { ...state, receipts } } : {}),
        };
      },
      null,
    );
  }

  private async transact<T>(
    transition: (state: GuestAdmissionState, now: number) => Transition<T>,
    unavailable: T,
  ): Promise<T> {
    try {
      return await attempt<T>(
        maxAttempts,
        async () => {
          const stored = await this.store.get(this.key);
          const now = this.now();
          if (
            !Number.isSafeInteger(now) ||
            now < 0 ||
            (stored && now < stored.lastSeenAt)
          )
            return unavailable;
          const state: GuestAdmissionState = stored ?? {
            version: 1,
            revision: 0,
            policy: this.policyFingerprint,
            enabled: !this.requireAuthorization,
            lastSeenAt: now,
            receipts: {},
            ...(this.policy.allowance
              ? { lifetime: { requests: 0, reservedMicroUsd: 0 } }
              : {}),
          };
          const change = transition(state, now);
          if (!change.next) return change.result;
          const next: GuestAdmissionState = {
            ...change.next,
            revision: state.revision + 1,
            lastSeenAt: now,
          };
          const committed = stored
            ? await this.store.compareAndSet(this.key, stored, next)
            : await this.store.setIfNotExists(this.key, next);
          return committed ? change.result : retry;
        },
        () => unavailable,
      );
    } catch {
      // No confirmed reservation means no execution. An ambiguous write may have
      // committed: leave its lease held, never guess a rollback or log raw state.
      return unavailable;
    }
  }
}
