import type { JsonValue } from "@brains/contracts";
import { createHash, randomUUID } from "node:crypto";

const PREPARED_CONFIRMATION_TTL_MS = 5 * 60 * 1_000;
const MAX_PREPARED_CONFIRMATIONS_PER_WORKSPACE = 1_000;

/** Who may redeem a prepared confirmation, for which action and input. */
export interface PreparedConfirmationClaim {
  readonly callerId: string;
  readonly actionId: string;
  readonly input: JsonValue;
}

export interface IssuedPreparedConfirmation {
  readonly token: string;
  readonly expiresAt: number;
}

export interface RedeemedPreparedConfirmation {
  readonly revision: string;
}

export interface PreparedConfirmationStore {
  /** Store a single-use token bound to the claim and the prepared revision. */
  issue(
    claim: PreparedConfirmationClaim & { readonly revision: string },
  ): IssuedPreparedConfirmation;
  /**
   * Consume the token and return its prepared revision when it is live and
   * matches the claim; a rejected token is consumed as well.
   */
  redeem(
    token: string | undefined,
    claim: PreparedConfirmationClaim,
  ): RedeemedPreparedConfirmation | undefined;
}

interface PreparedConfirmationRecord {
  readonly callerId: string;
  readonly actionId: string;
  readonly inputDigest: string;
  readonly revision: string;
  readonly expiresAt: number;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`)
    .join(",")}}`;
}

function inputDigest(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** In-memory, per-workspace store of prepared action confirmations. */
export function createPreparedConfirmationStore(
  options: {
    readonly now?: () => number;
    readonly maxRecords?: number;
  } = {},
): PreparedConfirmationStore {
  const now = options.now ?? ((): number => Date.now());
  const maxRecords =
    options.maxRecords ?? MAX_PREPARED_CONFIRMATIONS_PER_WORKSPACE;
  const records = new Map<string, PreparedConfirmationRecord>();

  function makeRoom(at: number): void {
    records.forEach((record, token) => {
      if (record.expiresAt <= at) records.delete(token);
    });
    Array.from(records.keys())
      .slice(0, Math.max(0, records.size - maxRecords + 1))
      .forEach((token) => records.delete(token));
  }

  return {
    issue({ callerId, actionId, input, revision }): IssuedPreparedConfirmation {
      const issuedAt = now();
      makeRoom(issuedAt);
      const token = randomUUID();
      const expiresAt = issuedAt + PREPARED_CONFIRMATION_TTL_MS;
      records.set(token, {
        callerId,
        actionId,
        inputDigest: inputDigest(input),
        revision,
        expiresAt,
      });
      return { token, expiresAt };
    },
    redeem(
      token,
      { callerId, actionId, input },
    ): RedeemedPreparedConfirmation | undefined {
      const record = token ? records.get(token) : undefined;
      if (token) records.delete(token);
      if (
        record === undefined ||
        record.expiresAt <= now() ||
        record.callerId !== callerId ||
        record.actionId !== actionId ||
        record.inputDigest !== inputDigest(input)
      ) {
        return undefined;
      }
      return { revision: record.revision };
    },
  };
}
