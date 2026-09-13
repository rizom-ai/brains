import { z } from "@brains/utils/zod";
import {
  errorSchema,
  type ProofError,
} from "../../../src/turso-worker/error-protocol";

export const CURSOR_SCAN_SIZE: number = 65539;
export type CursorScenario =
  "complete" | "cancel" | "return-ack" | "close-ack" | "rollback-ack";
export type CursorPhase = "row" | "statement-closed" | "rollback-completed";
export interface CursorObservation {
  rows: number;
  nextCalls: number;
  returnCalls: number;
  closeCalls: number;
  rollbackCalls: number;
  probeCalls: number;
  probeQueued: boolean;
  inTransaction: boolean;
}
export interface CursorBoot {
  plan: "sorted" | "offsets-first";
  url: string;
  scenario: CursorScenario;
  operation: "scan" | "recover";
}
export const cursorBootSchema: z.ZodType<CursorBoot> = z.strictObject({
  plan: z.enum(["sorted", "offsets-first"]),
  url: z.string().url(),
  scenario: z.enum([
    "complete",
    "cancel",
    "return-ack",
    "close-ack",
    "rollback-ack",
  ]),
  operation: z.enum(["scan", "recover"]),
});
export type CursorCommand =
  { kind: "probe" } | { kind: "release"; phase: CursorPhase };
export const cursorCommandSchema: z.ZodType<CursorCommand> =
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("probe") }),
    z.strictObject({
      kind: z.literal("release"),
      phase: z.enum(["row", "statement-closed", "rollback-completed"]),
    }),
  ]);
const observationSchema: z.ZodType<CursorObservation> = z.strictObject({
  rows: z.number().int().min(0).max(3),
  nextCalls: z.number().int().min(0).max(4),
  returnCalls: z.number().int().min(0).max(1),
  closeCalls: z.number().int().min(0).max(1),
  rollbackCalls: z.number().int().min(0).max(1),
  probeCalls: z.number().int().min(0).max(1),
  probeQueued: z.boolean(),
  inTransaction: z.boolean(),
});
export type CursorEvent =
  | { kind: "gate"; phase: CursorPhase; state: CursorObservation }
  | {
      kind: "done";
      state: CursorObservation;
      nativeClosed: boolean;
      recovered: boolean;
      error?: ProofError | undefined;
    }
  | { kind: "failed"; error: ProofError };
export const cursorEventSchema: z.ZodType<CursorEvent> = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({
      kind: z.literal("gate"),
      phase: z.enum(["row", "statement-closed", "rollback-completed"]),
      state: observationSchema,
    }),
    z.strictObject({
      kind: z.literal("done"),
      state: observationSchema,
      nativeClosed: z.boolean(),
      recovered: z.boolean(),
      error: errorSchema.optional(),
    }),
    z.strictObject({ kind: z.literal("failed"), error: errorSchema }),
  ],
);
