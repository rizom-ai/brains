import { z } from "@brains/utils/zod";
import {
  blobFactsSchema,
  type BlobFacts,
} from "../../shared/db/src/turso-worker/blob-protocol";
import {
  errorSchema,
  type ProofError,
} from "../../shared/db/src/turso-worker/error-protocol";

export const controlActionSchema: z.ZodEnum<{
  complete: "complete";
  cancel: "cancel";
  disconnect: "disconnect";
  "consumer-kill": "consumer-kill";
}> = z.enum(["complete", "cancel", "disconnect", "consumer-kill"]);
export type ControlAction = z.output<typeof controlActionSchema>;
export interface ControlStart {
  kind: "start";
  config: { address: string; secret: string; sessionId: string };
  consumerUrl: string;
  nativeWorkerUrl: string;
  forbiddenUrl: string;
  bunExecutable: string;
}
export const controlStartSchema: z.ZodType<ControlStart> = z.strictObject({
  kind: z.literal("start"),
  config: z.strictObject({
    address: z.string().min(1).max(4096),
    secret: z.string().min(1).max(4096),
    sessionId: z.string().min(1).max(256),
  }),
  consumerUrl: z.string().min(1).max(4096),
  nativeWorkerUrl: z.string().min(1).max(4096),
  forbiddenUrl: z.string().min(1).max(4096),
  bunExecutable: z.string().min(1).max(4096),
});
export type ControlEvent =
  | { kind: "ready"; pid: number; executable: string; sidecarUrl: string }
  | {
      kind: "runtime";
      pid: number;
      executable: string;
      sidecarUrl: string;
      localOpenFenced: true;
    }
  | {
      kind: "offered";
      pid: number;
      connectionId: string;
      ticket: string;
      facts: BlobFacts;
    }
  | { kind: "held"; pid: number; consumerPid: number; prefix: BlobFacts }
  | {
      kind: "finished";
      pid: number;
      action: ControlAction;
      consumerPid: number;
      consumerJoined: true;
      controlReusableAfterCancel: boolean;
    }
  | { kind: "failed"; pid: number; error: ProofError };
export const controlEventSchema: z.ZodType<ControlEvent> = z.discriminatedUnion(
  "kind",
  [
    z.strictObject({
      kind: z.literal("ready"),
      pid: z.number().int().positive(),
      executable: z.string().max(4096),
      sidecarUrl: z.string().max(4096),
    }),
    z.strictObject({
      kind: z.literal("runtime"),
      pid: z.number().int().positive(),
      executable: z.string().max(4096),
      sidecarUrl: z.string().max(4096),
      localOpenFenced: z.literal(true),
    }),
    z.strictObject({
      kind: z.literal("offered"),
      pid: z.number().int().positive(),
      connectionId: z.string().uuid(),
      ticket: z.string().uuid(),
      facts: blobFactsSchema,
    }),
    z.strictObject({
      kind: z.literal("held"),
      pid: z.number().int().positive(),
      consumerPid: z.number().int().positive(),
      prefix: blobFactsSchema,
    }),
    z.strictObject({
      kind: z.literal("finished"),
      pid: z.number().int().positive(),
      action: controlActionSchema,
      consumerPid: z.number().int().positive(),
      consumerJoined: z.literal(true),
      controlReusableAfterCancel: z.boolean(),
    }),
    z.strictObject({
      kind: z.literal("failed"),
      pid: z.number().int().positive(),
      error: errorSchema,
    }),
  ],
);
export const controlCommandSchema: z.ZodType<
  { kind: "endpoint-ready" } | { kind: "finish"; action: ControlAction }
> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("endpoint-ready") }),
  z.strictObject({
    kind: z.literal("finish"),
    action: controlActionSchema,
  }),
]);
