import { inboxItemIdSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

interface UnsentDraftViewValue {
  text: string;
  revision: number;
  status: "draft";
  updatedAt: string;
}

interface SentDraftViewValue {
  text: string;
  revision: number;
  status: "sent";
  updatedAt: string;
  sentAt: string;
}

type DraftViewValue = UnsentDraftViewValue | SentDraftViewValue;

const unsentDraftViewSchema: z.ZodType<
  UnsentDraftViewValue,
  UnsentDraftViewValue
> = z.strictObject({
  text: z.string().min(1).max(20_000),
  revision: z.number().int().positive(),
  status: z.literal("draft"),
  updatedAt: z.iso.datetime(),
});

const sentDraftViewSchema: z.ZodType<SentDraftViewValue, SentDraftViewValue> =
  z.strictObject({
    text: z.string().min(1).max(20_000),
    revision: z.number().int().positive(),
    status: z.literal("sent"),
    updatedAt: z.iso.datetime(),
    sentAt: z.iso.datetime(),
  });

export const draftViewSchema: z.ZodType<DraftViewValue, DraftViewValue> =
  z.union([unsentDraftViewSchema, sentDraftViewSchema]);

interface DraftSourceAddressValue {
  name?: string | undefined;
  address: string;
}

const draftSourceAddressSchema: z.ZodType<
  DraftSourceAddressValue,
  DraftSourceAddressValue
> = z.strictObject({
  name: z.string().min(1).max(300).optional(),
  address: z.email().max(320),
});

interface DraftSourceViewValue {
  from: DraftSourceAddressValue;
  replyTo?: DraftSourceAddressValue | undefined;
  subject: string;
  receivedAt: string;
  text: string;
  truncated: boolean;
}

const draftSourceViewSchema: z.ZodType<
  DraftSourceViewValue,
  DraftSourceViewValue
> = z.strictObject({
  from: draftSourceAddressSchema,
  replyTo: draftSourceAddressSchema.optional(),
  subject: z.string().max(1_000),
  receivedAt: z.iso.datetime(),
  text: z.string().max(100_000),
  truncated: z.boolean(),
});

interface EmailReplyDraftWorkspaceSnapshotValue {
  mailItemId: string | null;
  draft: DraftViewValue | null;
}

export const emailReplyDraftWorkspaceSnapshotSchema: z.ZodType<
  EmailReplyDraftWorkspaceSnapshotValue,
  EmailReplyDraftWorkspaceSnapshotValue
> = z.strictObject({
  mailItemId: inboxItemIdSchema.nullable(),
  draft: draftViewSchema.nullable(),
});

interface EmailReplyDraftSourceRequestValue {
  type: "source";
  mailItemId: string;
}

export const emailReplyDraftSourceRequestSchema: z.ZodType<
  EmailReplyDraftSourceRequestValue,
  EmailReplyDraftSourceRequestValue
> = z.strictObject({
  type: z.literal("source"),
  mailItemId: inboxItemIdSchema,
});

interface EmailReplyDraftSourceAvailableValue {
  kind: "source";
  source: DraftSourceViewValue;
}

interface EmailReplyDraftSourceUnavailableValue {
  kind: "source-unavailable";
  error: "Original content is unavailable";
}

type EmailReplyDraftSourceOutcomeValue =
  EmailReplyDraftSourceAvailableValue | EmailReplyDraftSourceUnavailableValue;

export const emailReplyDraftSourceOutcomeSchema: z.ZodType<
  EmailReplyDraftSourceOutcomeValue,
  EmailReplyDraftSourceOutcomeValue
> = z.union([
  z.strictObject({ kind: z.literal("source"), source: draftSourceViewSchema }),
  z.strictObject({
    kind: z.literal("source-unavailable"),
    error: z.literal("Original content is unavailable"),
  }),
]);

interface GenerateDraftActionValue {
  type: "generate";
  mailItemId: string;
}

const generateDraftActionSchema: z.ZodType<
  GenerateDraftActionValue,
  GenerateDraftActionValue
> = z.strictObject({
  type: z.literal("generate"),
  mailItemId: inboxItemIdSchema,
});

interface SaveDraftActionValue {
  type: "save";
  mailItemId: string;
  text: string;
  baseRevision: number;
}

const saveDraftActionSchema: z.ZodType<
  SaveDraftActionValue,
  SaveDraftActionValue
> = z.strictObject({
  type: z.literal("save"),
  mailItemId: inboxItemIdSchema,
  text: z.string().trim().min(1).max(20_000),
  baseRevision: z.number().int().nonnegative(),
});

interface SendDraftActionValue {
  type: "send";
  mailItemId: string;
  revision: number;
  confirmed: boolean;
}

const sendDraftActionSchema: z.ZodType<
  SendDraftActionValue,
  SendDraftActionValue
> = z.strictObject({
  type: z.literal("send"),
  mailItemId: inboxItemIdSchema,
  revision: z.number().int().positive(),
  confirmed: z.boolean(),
});

type EmailReplyDraftActionValue =
  GenerateDraftActionValue | SaveDraftActionValue | SendDraftActionValue;

export const emailReplyDraftActionSchema: z.ZodType<
  EmailReplyDraftActionValue,
  EmailReplyDraftActionValue
> = z.union([
  generateDraftActionSchema,
  saveDraftActionSchema,
  sendDraftActionSchema,
]);

interface DraftCompletedOutcomeValue {
  kind: "draft";
  draft: DraftViewValue;
}

interface SendConfirmationOutcomeValue {
  kind: "confirmation";
  summary: string;
}

interface SendCompletedOutcomeValue {
  kind: "sent";
  draft: SentDraftViewValue;
}

interface DraftErrorOutcomeValue {
  kind: "error";
  error:
    | "Invalid draft action"
    | "Draft generation failed"
    | "Draft save failed"
    | "Draft changed; reload before saving"
    | "Draft changed; review before sending"
    | "Email delivery is unavailable"
    | "Original content is unavailable"
    | "Email delivery failed";
}

type EmailReplyDraftActionOutcomeValue =
  | DraftCompletedOutcomeValue
  | SendConfirmationOutcomeValue
  | SendCompletedOutcomeValue
  | DraftErrorOutcomeValue;

export const emailReplyDraftActionOutcomeSchema: z.ZodType<
  EmailReplyDraftActionOutcomeValue,
  EmailReplyDraftActionOutcomeValue
> = z.union([
  z.strictObject({ kind: z.literal("draft"), draft: draftViewSchema }),
  z.strictObject({
    kind: z.literal("confirmation"),
    summary: z.string().trim().min(1).max(200),
  }),
  z.strictObject({ kind: z.literal("sent"), draft: sentDraftViewSchema }),
  z.strictObject({
    kind: z.literal("error"),
    error: z.enum([
      "Invalid draft action",
      "Draft generation failed",
      "Draft save failed",
      "Draft changed; reload before saving",
      "Draft changed; review before sending",
      "Email delivery is unavailable",
      "Original content is unavailable",
      "Email delivery failed",
    ]),
  }),
]);

export type UnsentDraftView = UnsentDraftViewValue;
export type SentDraftView = SentDraftViewValue;
export type DraftView = DraftViewValue;
export type DraftSourceView = z.output<typeof draftSourceViewSchema>;
export type EmailReplyDraftSourceRequest = z.output<
  typeof emailReplyDraftSourceRequestSchema
>;
export type EmailReplyDraftSourceOutcome = z.output<
  typeof emailReplyDraftSourceOutcomeSchema
>;
export type EmailReplyDraftWorkspaceSnapshot = z.output<
  typeof emailReplyDraftWorkspaceSnapshotSchema
>;
export type EmailReplyDraftAction = z.output<
  typeof emailReplyDraftActionSchema
>;
export type EmailReplyDraftActionOutcome = z.output<
  typeof emailReplyDraftActionOutcomeSchema
>;
