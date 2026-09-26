import { createHash, createHmac, randomBytes } from "node:crypto";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/sdk/services";
import {
  contactAdmissionPolicySchema,
  contactAdmissionStateSchema,
  type ContactAdmissionPolicy,
  type ContactAdmissionState,
} from "./admission-state";
import { contactSubmissionSchema } from "./entity/schema";
import { contactNetwork } from "./network";

export type ContactDenialReason =
  | "invalid-network"
  | "invalid-token"
  | "invalid-submission"
  | "submission-conflict"
  | "rate-limited"
  | "capacity"
  | "unavailable";
interface Denied {
  kind: "denied";
  reason: ContactDenialReason;
}
export type ContactRequestResult = { kind: "allowed" } | Denied;
export type ContactFormResult =
  { kind: "issued"; token: string; expiresAt: number } | Denied;
export type ContactReservationResult =
  { kind: "reserved" | "duplicate"; id: string; receivedAt: number } | Denied;
interface Transition<T> {
  result: T;
  next?: ContactAdmissionState;
}

function denied(reason: ContactDenialReason): Denied {
  return { kind: "denied", reason };
}
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
const tokenPattern = /^[a-f0-9]{64}$/;
function emptyCounters(): ContactAdmissionState["global"] {
  return { requests: 0, forms: 0, submissions: 0 };
}

/** Atomic form issuance and submission reservation, shared across processes.
 * A reservation is NOT evidence that a contact entity was persisted. A retry must
 * reconcile the deterministic entity id before acknowledging successful intake.
 * Ledger expiry never reissues a token or permits its submission to be replayed.
 */
export class ContactAdmission {
  private readonly store: IRuntimeStateStore<ContactAdmissionState>;
  private readonly policy: ContactAdmissionPolicy;
  private readonly now: () => number;

  constructor(
    state: IRuntimeStateNamespace,
    policy: ContactAdmissionPolicy,
    now: () => number = Date.now,
  ) {
    this.policy = contactAdmissionPolicySchema.parse(policy);
    this.now = now;
    try {
      this.store = state.scoped({
        namespace: "contact.admission",
        schema: contactAdmissionStateSchema,
      });
    } catch {
      throw new Error("Contact admission unavailable");
    }
  }

  /** Call before reading any intake request, including malformed POSTs. */
  async checkRequest(trustedPeer?: string): Promise<ContactRequestResult> {
    const network = contactNetwork(trustedPeer);
    if (!network) return denied("invalid-network");
    return this.mutate<ContactRequestResult>((state) => {
      const key = hash(`${state.salt}:${network}`);
      const bucket = state.networks[key] ?? emptyCounters();
      if (
        state.global.requests >= this.policy.globalRequests ||
        bucket.requests >= this.policy.networkRequests
      )
        return { result: denied("rate-limited") };
      if (!this.hasBucketCapacity(state, key))
        return { result: denied("capacity") };
      return {
        result: { kind: "allowed" },
        next: {
          ...state,
          global: { ...state.global, requests: state.global.requests + 1 },
          networks: {
            ...state.networks,
            [key]: { ...bucket, requests: bucket.requests + 1 },
          },
        },
      };
    });
  }

  async issue(trustedPeer?: string): Promise<ContactFormResult> {
    const network = contactNetwork(trustedPeer);
    if (!network) return denied("invalid-network");
    const token = randomBytes(32).toString("hex");
    const key = hash(token);
    return this.mutate<ContactFormResult>((state, now) => {
      const bucketKey = hash(`${state.salt}:${network}`);
      const bucket = state.networks[bucketKey] ?? emptyCounters();
      if (
        state.global.forms >= this.policy.globalForms ||
        bucket.forms >= this.policy.networkForms
      )
        return { result: denied("rate-limited") };
      if (
        Object.keys(state.entries).length >= this.policy.maxEntries ||
        !this.hasBucketCapacity(state, bucketKey)
      )
        return { result: denied("capacity") };
      if (state.entries[key]) return { result: denied("unavailable") };
      const expiresAt = now + this.policy.tokenTtlSeconds * 1000;
      return {
        result: { kind: "issued", token, expiresAt },
        next: {
          ...state,
          global: { ...state.global, forms: state.global.forms + 1 },
          networks: {
            ...state.networks,
            [bucketKey]: { ...bucket, forms: bucket.forms + 1 },
          },
          entries: {
            ...state.entries,
            [key]: { network: bucketKey, expiresAt, retainUntil: expiresAt },
          },
        },
      };
    });
  }

  async reserve(
    token: string,
    input: unknown,
    trustedPeer?: string,
  ): Promise<ContactReservationResult> {
    const network = contactNetwork(trustedPeer);
    if (!network) return denied("invalid-network");
    if (!tokenPattern.test(token)) return denied("invalid-token");
    const parsed = contactSubmissionSchema.safeParse(input);
    if (!parsed.success) return denied("invalid-submission");
    const key = hash(token);
    // Key the payload digest with the unpersisted high-entropy form credential.
    // An operator-state copy cannot dictionary-attack low-entropy contact fields.
    const digest = createHmac("sha256", token)
      .update(JSON.stringify(parsed.data))
      .digest("hex");
    return this.mutate<ContactReservationResult>((state, now) => {
      const bucketKey = hash(`${state.salt}:${network}`);
      const entry = state.entries[key];
      if (entry?.network !== bucketKey)
        return { result: denied("invalid-token") };
      const id = `contact-${key}`;
      if (entry.submission) {
        return {
          result:
            entry.submission.digest === digest
              ? {
                  kind: "duplicate",
                  id,
                  receivedAt: entry.submission.receivedAt,
                }
              : denied("submission-conflict"),
        };
      }
      if (now >= entry.expiresAt) return { result: denied("invalid-token") };
      const bucket = state.networks[bucketKey] ?? emptyCounters();
      if (
        state.global.submissions >= this.policy.globalSubmissions ||
        bucket.submissions >= this.policy.networkSubmissions
      )
        return { result: denied("rate-limited") };
      if (!this.hasBucketCapacity(state, bucketKey))
        return { result: denied("capacity") };
      return {
        result: { kind: "reserved", id, receivedAt: now },
        next: {
          ...state,
          global: {
            ...state.global,
            submissions: state.global.submissions + 1,
          },
          networks: {
            ...state.networks,
            [bucketKey]: { ...bucket, submissions: bucket.submissions + 1 },
          },
          entries: {
            ...state.entries,
            [key]: {
              ...entry,
              retainUntil: now + this.policy.receiptTtlSeconds * 1000,
              submission: { digest, receivedAt: now },
            },
          },
        },
      };
    });
  }

  private hasBucketCapacity(
    state: ContactAdmissionState,
    key: string,
  ): boolean {
    return (
      state.networks[key] !== undefined ||
      Object.keys(state.networks).length < 1000
    );
  }

  private async mutate<
    T extends
      ContactRequestResult | ContactFormResult | ContactReservationResult,
  >(
    change: (state: ContactAdmissionState, now: number) => Transition<T>,
  ): Promise<T | Denied> {
    try {
      const now = this.now();
      if (
        !Number.isSafeInteger(now) ||
        now < 0 ||
        now > Number.MAX_SAFE_INTEGER - 86400_000
      )
        return denied("unavailable");
      for (let attempt = 0; attempt < 16; attempt++) {
        const stored = await this.store.get("ledger");
        if (!stored) {
          await this.store.setIfNotExists("ledger", {
            revision: 0,
            lastNow: now,
            salt: randomBytes(32).toString("hex"),
            windowEnd: now + this.policy.windowSeconds * 1000,
            global: emptyCounters(),
            networks: {},
            entries: {},
          });
          continue;
        }
        if (now < stored.lastNow || stored.revision === Number.MAX_SAFE_INTEGER)
          return denied("unavailable");
        const rollover = now >= stored.windowEnd;
        const state: ContactAdmissionState = {
          ...stored,
          ...(rollover
            ? {
                windowEnd: now + this.policy.windowSeconds * 1000,
                global: emptyCounters(),
                networks: {},
              }
            : {}),
          entries: Object.fromEntries(
            Object.entries(stored.entries).filter(
              ([, entry]) => now < entry.retainUntil,
            ),
          ),
        };
        const transition = change(state, now);
        if (!transition.next) return transition.result;
        if (
          await this.store.compareAndSet("ledger", stored, {
            ...transition.next,
            revision: stored.revision + 1,
            lastNow: now,
          })
        )
          return transition.result;
      }
    } catch {
      // An ambiguous write may have consumed quota. Never guess a refund, retry
      // an uncertain write here, or leak the storage exception to the HTTP layer.
      return denied("unavailable");
    }
    return denied("unavailable");
  }
}
