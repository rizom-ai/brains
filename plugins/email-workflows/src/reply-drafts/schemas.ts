import { inboxItemIdSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

type UnsentDraftViewSchema = z.ZodObject<
  {
    text: z.ZodString;
    revision: z.ZodNumber;
    status: z.ZodLiteral<"draft">;
    updatedAt: z.ZodISODateTime;
  },
  z.core.$strict
>;

const unsentDraftViewSchema: UnsentDraftViewSchema = z.strictObject({
  text: z.string().min(1).max(20_000),
  revision: z.number().int().positive(),
  status: z.literal("draft"),
  updatedAt: z.iso.datetime(),
});

type SentDraftViewSchema = z.ZodObject<
  {
    text: z.ZodString;
    revision: z.ZodNumber;
    status: z.ZodLiteral<"sent">;
    updatedAt: z.ZodISODateTime;
    sentAt: z.ZodISODateTime;
  },
  z.core.$strict
>;

const sentDraftViewSchema: SentDraftViewSchema = z.strictObject({
  text: z.string().min(1).max(20_000),
  revision: z.number().int().positive(),
  status: z.literal("sent"),
  updatedAt: z.iso.datetime(),
  sentAt: z.iso.datetime(),
});

type DraftViewSchema = z.ZodUnion<[UnsentDraftViewSchema, SentDraftViewSchema]>;

export const draftViewSchema: DraftViewSchema = z.union([
  unsentDraftViewSchema,
  sentDraftViewSchema,
]);

type DraftSourceAddressSchema = z.ZodObject<
  { name: z.ZodOptional<z.ZodString>; address: z.ZodEmail },
  z.core.$strict
>;

const draftSourceAddressSchema: DraftSourceAddressSchema = z.strictObject({
  name: z.string().min(1).max(300).optional(),
  address: z.email().max(320),
});

type DraftSourceViewSchema = z.ZodObject<
  {
    from: DraftSourceAddressSchema;
    replyTo: z.ZodOptional<DraftSourceAddressSchema>;
    subject: z.ZodString;
    receivedAt: z.ZodISODateTime;
    text: z.ZodString;
    truncated: z.ZodBoolean;
  },
  z.core.$strict
>;

const draftSourceViewSchema: DraftSourceViewSchema = z.strictObject({
  from: draftSourceAddressSchema,
  replyTo: draftSourceAddressSchema.optional(),
  subject: z.string().max(1_000),
  receivedAt: z.iso.datetime(),
  text: z.string().max(100_000),
  truncated: z.boolean(),
});

type EmailReplyDraftWorkspaceSnapshotSchema = z.ZodObject<
  {
    mailItemId: z.ZodNullable<typeof inboxItemIdSchema>;
    draft: z.ZodNullable<DraftViewSchema>;
  },
  z.core.$strict
>;

export const emailReplyDraftWorkspaceSnapshotSchema: EmailReplyDraftWorkspaceSnapshotSchema =
  z.strictObject({
    mailItemId: inboxItemIdSchema.nullable(),
    draft: draftViewSchema.nullable(),
  });

type EmailReplyDraftSourceRequestSchema = z.ZodObject<
  { type: z.ZodLiteral<"source">; mailItemId: typeof inboxItemIdSchema },
  z.core.$strict
>;

export const emailReplyDraftSourceRequestSchema: EmailReplyDraftSourceRequestSchema =
  z.strictObject({
    type: z.literal("source"),
    mailItemId: inboxItemIdSchema,
  });

type EmailReplyDraftSourceOutcomeSchema = z.ZodUnion<
  [
    z.ZodObject<
      { kind: z.ZodLiteral<"source">; source: DraftSourceViewSchema },
      z.core.$strict
    >,
    z.ZodObject<
      {
        kind: z.ZodLiteral<"source-unavailable">;
        error: z.ZodLiteral<"Original content is unavailable">;
      },
      z.core.$strict
    >,
  ]
>;

export const emailReplyDraftSourceOutcomeSchema: EmailReplyDraftSourceOutcomeSchema =
  z.union([
    z.strictObject({
      kind: z.literal("source"),
      source: draftSourceViewSchema,
    }),
    z.strictObject({
      kind: z.literal("source-unavailable"),
      error: z.literal("Original content is unavailable"),
    }),
  ]);

type GenerateDraftActionSchema = z.ZodObject<
  { type: z.ZodLiteral<"generate">; mailItemId: typeof inboxItemIdSchema },
  z.core.$strict
>;

const generateDraftActionSchema: GenerateDraftActionSchema = z.strictObject({
  type: z.literal("generate"),
  mailItemId: inboxItemIdSchema,
});

type SaveDraftActionSchema = z.ZodObject<
  {
    type: z.ZodLiteral<"save">;
    mailItemId: typeof inboxItemIdSchema;
    text: z.ZodString;
    baseRevision: z.ZodNumber;
  },
  z.core.$strict
>;

const saveDraftActionSchema: SaveDraftActionSchema = z.strictObject({
  type: z.literal("save"),
  mailItemId: inboxItemIdSchema,
  text: z.string().trim().min(1).max(20_000),
  baseRevision: z.number().int().nonnegative(),
});

type SendDraftActionSchema = z.ZodObject<
  {
    type: z.ZodLiteral<"send">;
    mailItemId: typeof inboxItemIdSchema;
    revision: z.ZodNumber;
    confirmed: z.ZodBoolean;
  },
  z.core.$strict
>;

const sendDraftActionSchema: SendDraftActionSchema = z.strictObject({
  type: z.literal("send"),
  mailItemId: inboxItemIdSchema,
  revision: z.number().int().positive(),
  confirmed: z.boolean(),
});

type EmailReplyDraftActionSchema = z.ZodUnion<
  [GenerateDraftActionSchema, SaveDraftActionSchema, SendDraftActionSchema]
>;

export const emailReplyDraftActionSchema: EmailReplyDraftActionSchema = z.union(
  [generateDraftActionSchema, saveDraftActionSchema, sendDraftActionSchema],
);

type EmailReplyDraftActionOutcomeSchema = z.ZodUnion<
  [
    z.ZodObject<
      { kind: z.ZodLiteral<"draft">; draft: DraftViewSchema },
      z.core.$strict
    >,
    z.ZodObject<
      { kind: z.ZodLiteral<"confirmation">; summary: z.ZodString },
      z.core.$strict
    >,
    z.ZodObject<
      { kind: z.ZodLiteral<"sent">; draft: SentDraftViewSchema },
      z.core.$strict
    >,
    z.ZodObject<
      {
        kind: z.ZodLiteral<"error">;
        error: z.ZodEnum<{
          "Invalid draft action": "Invalid draft action";
          "Draft generation failed": "Draft generation failed";
          "Draft save failed": "Draft save failed";
          "Draft changed; reload before saving": "Draft changed; reload before saving";
          "Draft changed; review before sending": "Draft changed; review before sending";
          "Email delivery is unavailable": "Email delivery is unavailable";
          "Original content is unavailable": "Original content is unavailable";
          "Email delivery failed": "Email delivery failed";
        }>;
      },
      z.core.$strict
    >,
  ]
>;

export const emailReplyDraftActionOutcomeSchema: EmailReplyDraftActionOutcomeSchema =
  z.union([
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

export type UnsentDraftView = z.output<typeof unsentDraftViewSchema>;
export type SentDraftView = z.output<typeof sentDraftViewSchema>;
export type DraftView = z.output<typeof draftViewSchema>;
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
