import { createHmac, randomBytes } from "node:crypto";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import {
  formAdmissionPolicySchema,
  formAdmissionStateSchema,
  type FormAdmissionPolicy,
  type FormAdmissionState,
} from "./admission-state";
import { peerNetwork } from "./network";
import { sha256Hex } from "@brains/utils/hash";

export type FormDenialReason =
  | "invalid-network"
  | "invalid-token"
  | "invalid-submission"
  | "submission-conflict"
  | "rate-limited"
  | "capacity"
  | "unavailable";
interface Denied {
  kind: "denied";
  reason: FormDenialReason;
}
export type FormRequestResult = { kind: "allowed" } | Denied;
export type FormIssueResult =
  { kind: "issued"; token: string; expiresAt: number } | Denied;
export type FormReservationResult =
  { kind: "reserved" | "duplicate"; id: string; receivedAt: number } | Denied;
interface Transition<T> {
  result: T;
  next?: FormAdmissionState;
}

function denied(reason: FormDenialReason): Denied {
  return { kind: "denied", reason };
}
const tokenPattern = /^[a-f0-9]{64}$/;
function emptyCounters(): FormAdmissionState["global"] {
  return { requests: 0, forms: 0, submissions: 0 };
}

/** Where a form's admission ledger lives and how its records are named. */
export interface FormAdmissionOptions {
  /** Runtime-state namespace of this form's ledger. */
  namespace: string;
  /** Prefix of the deterministic id a reservation names: `<prefix>-<sha256(token)>`. */
  idPrefix: string;
  /** What joins the prefix and the key: `-` unless the target files its
   * records in a folder per form (`:`). */
  separator?: "-" | ":" | undefined;
}

/** Atomic form issuance and submission reservation, shared across processes.
 * A reservation is NOT evidence that a submission was persisted. A retry must
 * reconcile the deterministic entity id before acknowledging successful intake.
 * Ledger expiry never reissues a token or permits its submission to be replayed.
 */
export class FormAdmission {
  private readonly store: IRuntimeStateStore<FormAdmissionState>;
  private readonly policy: FormAdmissionPolicy;
  private readonly now: () => number;
  private readonly idPrefix: string;
  private readonly separator: "-" | ":";

  constructor(
    state: IRuntimeStateNamespace,
    policy: FormAdmissionPolicy,
    options: FormAdmissionOptions,
    now: () => number = Date.now,
  ) {
    this.policy = formAdmissionPolicySchema.parse(policy);
    this.now = now;
    this.idPrefix = options.idPrefix;
    this.separator = options.separator ?? "-";
    try {
      this.store = state.scoped({
        namespace: options.namespace,
        schema: formAdmissionStateSchema,
      });
    } catch {
      throw new Error("Form admission unavailable");
    }
  }

  /** Call before reading any intake request, including malformed POSTs. */
  async checkRequest(trustedPeer?: string): Promise<FormRequestResult> {
    const network = peerNetwork(trustedPeer);
    if (!network) return denied("invalid-network");
    return this.mutate<FormRequestResult>((state) => {
      const key = sha256Hex(`${state.salt}:${network}`);
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

  async issue(trustedPeer?: string): Promise<FormIssueResult> {
    const network = peerNetwork(trustedPeer);
    if (!network) return denied("invalid-network");
    const token = randomBytes(32).toString("hex");
    const key = sha256Hex(token);
    return this.mutate<FormIssueResult>((state, now) => {
      const bucketKey = sha256Hex(`${state.salt}:${network}`);
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

  /** Reserve a submission the caller has already validated. The payload must be
   * JSON-serializable; identical payloads under one token are the same submission. */
  async reserve(
    token: string,
    payload: unknown,
    trustedPeer?: string,
  ): Promise<FormReservationResult> {
    const network = peerNetwork(trustedPeer);
    if (!network) return denied("invalid-network");
    if (!tokenPattern.test(token)) return denied("invalid-token");
    const key = sha256Hex(token);
    // Key the payload digest with the unpersisted high-entropy form credential.
    // An operator-state copy cannot dictionary-attack low-entropy submitted fields.
    const digest = createHmac("sha256", token)
      .update(JSON.stringify(payload))
      .digest("hex");
    return this.mutate<FormReservationResult>((state, now) => {
      const bucketKey = sha256Hex(`${state.salt}:${network}`);
      const entry = state.entries[key];
      if (entry?.network !== bucketKey)
        return { result: denied("invalid-token") };
      const id = `${this.idPrefix}${this.separator}${key}`;
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

  private hasBucketCapacity(state: FormAdmissionState, key: string): boolean {
    return (
      state.networks[key] !== undefined ||
      Object.keys(state.networks).length < 1000
    );
  }

  private async mutate<
    T extends FormRequestResult | FormIssueResult | FormReservationResult,
  >(
    change: (state: FormAdmissionState, now: number) => Transition<T>,
  ): Promise<T | Denied> {
    try {
      const now = this.now();
      if (
        !Number.isSafeInteger(now) ||
        now < 0 ||
        now > Number.MAX_SAFE_INTEGER - 86400_000
      )
        return denied("unavailable");
      return await this.attempt(change, now, 16);
    } catch {
      // An ambiguous write may have consumed quota. Never guess a refund, retry
      // an uncertain write here, or leak the storage exception to the HTTP layer.
      return denied("unavailable");
    }
  }

  /** One compare-and-set round; losing a race tries again, a bounded number
   * of times. */
  private async attempt<
    T extends FormRequestResult | FormIssueResult | FormReservationResult,
  >(
    change: (state: FormAdmissionState, now: number) => Transition<T>,
    now: number,
    attempts: number,
  ): Promise<T | Denied> {
    if (attempts === 0) return denied("unavailable");
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
      return this.attempt(change, now, attempts - 1);
    }
    if (now < stored.lastNow || stored.revision === Number.MAX_SAFE_INTEGER)
      return denied("unavailable");
    const rollover = now >= stored.windowEnd;
    const state: FormAdmissionState = {
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
    const written = await this.store.compareAndSet("ledger", stored, {
      ...transition.next,
      revision: stored.revision + 1,
      lastNow: now,
    });
    return written
      ? transition.result
      : this.attempt(change, now, attempts - 1);
  }
}
