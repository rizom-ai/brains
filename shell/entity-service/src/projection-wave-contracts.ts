import { z } from "@brains/utils/zod";

/**
 * A projection wave's place in its lifecycle.
 *
 * A wave starts `running` and reaches exactly one terminal state:
 *
 * - `completed` — every rule in it finished.
 * - `failed` — something went wrong; its inputs were requeued for a later wave.
 * - `superseded` — the admission epoch moved under it, so its work is stale;
 *   its inputs were requeued too.
 */
export type ProjectionWaveStatus =
  "running" | "completed" | "failed" | "superseded";

/**
 * Every identifier in the wave tables obeys the same rule — non-blank once
 * trimmed — so the rule is written once and each caller names what it is
 * parsing. A blank string is not an identifier.
 */
const identifier = z.string().trim().min(1);
const waveTimestamp = z.number().int().nonnegative();

export function parseWaveId(value: unknown): string {
  return identifier.parse(value);
}

export function parseRuleId(value: unknown): string {
  return identifier.parse(value);
}

export function parseJobId(value: unknown): string {
  return identifier.parse(value);
}

/** The fingerprint of the projection graph a wave was claimed against. */
export function parseGraphFingerprint(value: unknown): string {
  return identifier.parse(value);
}

/** A whole, non-negative instant in epoch milliseconds. */
export function parseWaveTimestamp(value: unknown): number {
  return waveTimestamp.parse(value);
}

/**
 * What a lifecycle request should do, given where the wave already is.
 *
 * - `apply` — carry out the transition.
 * - `settled` — the wave is already there; do nothing and report success.
 * - `decline` — the transition does not apply, and that is an ordinary answer.
 * - `refuse` — the transition contradicts a terminal state the wave reached.
 */
export type WaveTransition =
  | { kind: "apply" }
  | { kind: "settled" }
  | { kind: "decline" }
  | { kind: "refuse"; reason: string };

/**
 * Completion is retried by the projection engine, so completing a wave that
 * already completed is a no-op rather than an error. Completing one that
 * failed or was superseded is a contradiction: its inputs have been requeued
 * and another wave may already own them.
 */
export function completionEffect(status: ProjectionWaveStatus): WaveTransition {
  if (status === "completed") return { kind: "settled" };
  if (status === "failed") return { kind: "refuse", reason: "already failed" };
  if (status === "superseded")
    return { kind: "refuse", reason: "was superseded" };
  return { kind: "apply" };
}

/**
 * Failing a wave requeues its inputs, so reporting the same failure twice must
 * not requeue them again — both `failed` and `superseded` have already
 * released them. Failing a completed wave is a contradiction.
 */
export function failureEffect(status: ProjectionWaveStatus): WaveTransition {
  if (status === "completed")
    return { kind: "refuse", reason: "already completed" };
  if (status === "failed" || status === "superseded")
    return { kind: "settled" };
  return { kind: "apply" };
}

/**
 * Supersession answers "is this wave stale?". A wave that already finished,
 * either way, is not stale — that is an ordinary no, not a refusal.
 */
export function supersessionEffect(
  status: ProjectionWaveStatus,
): WaveTransition {
  if (status === "superseded") return { kind: "settled" };
  if (status !== "running") return { kind: "decline" };
  return { kind: "apply" };
}
