// Metadata-only component fault harness; deliberately not the runtime RPC protocol.
import { z } from "@brains/utils/zod";
import { budgetGrantSchema, type BudgetGrant } from "./budget-protocol";
import {
  errorSchema,
  type ProofError,
} from "../../../src/turso-worker/error-protocol";
import { sealedSchema, type SealedStage } from "./binary-protocol";
import { readStatsSchema, type ReadStats } from "./read-protocol";

export type ScanMaterialization = "incremental" | "adopt";
export const scanMaterializationSchema: z.ZodType<ScanMaterialization> = z.enum(
  ["incremental", "adopt"],
);

export type ScanFault =
  | "none"
  | "query"
  | "statement-ack"
  | "native-state-loss"
  | "rollback-before"
  | "rollback-after"
  | "query-rollback";
export const scanFaultSchema: z.ZodType<ScanFault> = z.enum([
  "none",
  "query",
  "statement-ack",
  "native-state-loss",
  "rollback-before",
  "rollback-after",
  "query-rollback",
]);
export interface ScanState {
  materialization: ScanMaterialization;
  reads: ReadStats;
  scratchSlots: number;
  failed: boolean;
  nativeActive: boolean;
  queryCalls: number;
  gatedBackingBytes: number;
  rollbackCalls: number;
  rollbackCompleted: number;
  queuedNativeCalls: number;
}
export const scanStateSchema: z.ZodType<ScanState> = z.strictObject({
  materialization: scanMaterializationSchema,
  reads: readStatsSchema,
  scratchSlots: z.number().int().nonnegative(),
  failed: z.boolean(),
  nativeActive: z.boolean(),
  queryCalls: z.number().int().nonnegative(),
  gatedBackingBytes: z.number().int().nonnegative(),
  rollbackCalls: z.number().int().nonnegative(),
  rollbackCompleted: z.number().int().nonnegative(),
  queuedNativeCalls: z.number().int().nonnegative(),
});
export type ScanRequest = { id: number } & (
  | { op: "start"; resident: BudgetGrant; scratch: BudgetGrant }
  | { op: "resume"; phase: "scan" | "rollback" }
  | { op: "revoke"; method: "scope" | "discard" | "all" }
  | { op: "inspect" | "claim" | "queue" | "shutdown" }
);
export const scanRequestSchema: z.ZodType<ScanRequest> = z.discriminatedUnion(
  "op",
  [
    z.strictObject({
      id: z.number().int().positive(),
      op: z.literal("start"),
      resident: budgetGrantSchema,
      scratch: budgetGrantSchema,
    }),
    z.strictObject({
      id: z.number().int().positive(),
      op: z.literal("resume"),
      phase: z.enum(["scan", "rollback"]),
    }),
    z.strictObject({
      id: z.number().int().positive(),
      op: z.literal("revoke"),
      method: z.enum(["scope", "discard", "all"]),
    }),
    z.strictObject({
      id: z.number().int().positive(),
      op: z.enum(["inspect", "claim", "queue", "shutdown"]),
    }),
  ],
);
export type ScanOutcome =
  | { ok: true; value?: SealedStage | undefined }
  | { ok: false; error: ProofError };
const outcomeSchema: z.ZodType<ScanOutcome> = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: sealedSchema.optional() }),
  z.strictObject({ ok: z.literal(false), error: errorSchema }),
]);
export type ScanEvent =
  | { kind: "ready"; pid: number; threadId: number }
  | { kind: "gate"; phase: "scan" | "rollback"; state: ScanState }
  | { kind: "release"; id: number }
  | { kind: "reply"; id: number; state: ScanState; outcome: ScanOutcome }
  | {
      kind: "settled";
      state: ScanState;
      read: ScanOutcome;
      write: ScanOutcome;
    };
export const scanEventSchema: z.ZodType<ScanEvent> = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({
      kind: z.literal("ready"),
      pid: z.number().int().positive(),
      threadId: z.number().int().positive(),
    }),
    z.strictObject({
      kind: z.literal("gate"),
      phase: z.enum(["scan", "rollback"]),
      state: scanStateSchema,
    }),
    z.strictObject({
      kind: z.literal("release"),
      id: z.number().int().positive(),
    }),
    z.strictObject({
      kind: z.literal("reply"),
      id: z.number().int().positive(),
      state: scanStateSchema,
      outcome: outcomeSchema,
    }),
    z.strictObject({
      kind: z.literal("settled"),
      state: scanStateSchema,
      read: outcomeSchema,
      write: outcomeSchema,
    }),
  ],
);
