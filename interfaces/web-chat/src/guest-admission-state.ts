import { z } from "@brains/utils/zod";
import type { GuestExecutionPolicy } from "@brains/contracts/chat";

type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;
const integer = z.number().int().nonnegative();
const digest = z.string().regex(/^[a-f0-9]{64}$/);

const outcomeSchema: z.ZodEnum<{
  completed: "completed";
  failed: "failed";
  interrupted: "interrupted";
}> = z.enum(["completed", "failed", "interrupted"]);
export type GuestTurnOutcome = z.output<typeof outcomeSchema>;

const receiptSchema: Strict<{
  id: z.ZodString;
  visitor: z.ZodString;
  conversation: z.ZodString;
  fingerprint: z.ZodString;
  createdAt: z.ZodNumber;
  settledAt: z.ZodOptional<z.ZodNumber>;
  retainUntil: z.ZodNumber;
  deadline: z.ZodNumber;
  reservedMicroUsd: z.ZodNumber;
  state: z.ZodUnion<readonly [z.ZodLiteral<"active">, typeof outcomeSchema]>;
}> = z
  .strictObject({
    id: z.string().uuid(),
    visitor: digest,
    conversation: digest,
    fingerprint: digest,
    createdAt: integer,
    settledAt: integer.optional(),
    retainUntil: integer,
    deadline: integer,
    reservedMicroUsd: z.number().int().positive(),
    state: z.union([z.literal("active"), outcomeSchema]),
  })
  .refine(
    (receipt) =>
      receipt.state === "active"
        ? receipt.settledAt === undefined
        : receipt.settledAt !== undefined &&
          receipt.settledAt >= receipt.createdAt &&
          receipt.retainUntil >= receipt.settledAt,
    "Guest receipt settlement must match its terminal state",
  );
export type GuestAdmissionReceipt = z.output<typeof receiptSchema>;

export const guestAdmissionStateSchema: Strict<{
  version: z.ZodLiteral<1>;
  revision: z.ZodNumber;
  policy: z.ZodString;
  enabled: z.ZodBoolean;
  lastSeenAt: z.ZodNumber;
  receipts: z.ZodRecord<z.ZodString, typeof receiptSchema>;
}> = z.strictObject({
  version: z.literal(1),
  revision: integer,
  policy: digest,
  enabled: z.boolean(),
  lastSeenAt: integer,
  receipts: z.record(digest, receiptSchema),
});
export type GuestAdmissionState = z.output<typeof guestAdmissionStateSchema>;
export const guestAdmissionNamespace = "web-chat.guest-admission";

/** Timeout, credential expiry and disconnection never prove remote completion. */
export function retainedGuestReceipts(
  state: GuestAdmissionState,
  now: number,
): GuestAdmissionState["receipts"] {
  return Object.fromEntries(
    Object.entries(state.receipts).filter(
      ([, receipt]) => receipt.state === "active" || now < receipt.retainUntil,
    ),
  );
}

export interface GuestExecutionLease {
  key: string;
  id: string;
  execution: GuestExecutionPolicy;
}

export type GuestAdmissionDenial =
  | "unavailable"
  | "invalid-input"
  | "conversation-unavailable"
  | "submission-conflict"
  | "visitor-busy"
  | "deployment-busy"
  | "visitor-rate-limit"
  | "deployment-rate-limit"
  | "conversation-limit"
  | "budget-exhausted";

export type GuestAdmissionResult =
  | { kind: "reserved"; lease: GuestExecutionLease }
  | { kind: "duplicate"; state: GuestAdmissionReceipt["state"] | "uncertain" }
  | { kind: "denied"; reason: GuestAdmissionDenial };
