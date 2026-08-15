import { z } from "@brains/utils/zod";

export const EMAIL_SOURCE_READ = "email:source-read" as const;

interface EmailSourceReadActorValue {
  permissionLevel: "admin" | "trusted" | "public";
}

const emailSourceReadActorSchema: z.ZodType<
  EmailSourceReadActorValue,
  EmailSourceReadActorValue
> = z.strictObject({
  permissionLevel: z.enum(["admin", "trusted", "public"]),
});

const abortSignalSchema: z.ZodType<AbortSignal, AbortSignal> =
  z.custom<AbortSignal>(
    (value) =>
      typeof AbortSignal !== "undefined" && value instanceof AbortSignal,
  );

interface EmailSourceReadRequestValue {
  sourceRef: string;
  actor: EmailSourceReadActorValue;
  signal?: AbortSignal | undefined;
}

export const emailSourceReadRequestSchema: z.ZodType<
  EmailSourceReadRequestValue,
  EmailSourceReadRequestValue
> = z.strictObject({
  sourceRef: z.string().regex(/^imap:[a-f0-9]{64}$/),
  actor: emailSourceReadActorSchema,
  signal: abortSignalSchema.optional(),
});

interface EmailSourceAddressValue {
  name?: string | undefined;
  address: string;
}

const emailSourceAddressSchema: z.ZodType<
  EmailSourceAddressValue,
  EmailSourceAddressValue
> = z.strictObject({
  name: z.string().trim().min(1).max(300).optional(),
  address: z.email().max(320),
});

interface EmailSourceMessageValue {
  messageId: string;
  from: EmailSourceAddressValue;
  replyTo?: EmailSourceAddressValue | undefined;
  to: EmailSourceAddressValue[];
  subject: string;
  receivedAt: string;
  text: string;
  inReplyTo?: string | undefined;
  references: string[];
  truncated: boolean;
}

const emailSourceMessageSchema: z.ZodType<
  EmailSourceMessageValue,
  EmailSourceMessageValue
> = z.strictObject({
  messageId: z.string().trim().min(1).max(2_000),
  from: emailSourceAddressSchema,
  replyTo: emailSourceAddressSchema.optional(),
  to: z.array(emailSourceAddressSchema).max(100),
  subject: z.string().max(1_000),
  receivedAt: z.iso.datetime(),
  text: z.string().max(100_000),
  inReplyTo: z.string().trim().min(1).max(2_000).optional(),
  references: z.array(z.string().trim().min(1).max(2_000)).max(100),
  truncated: z.boolean(),
});

interface EmailSourceReadAvailableValue {
  kind: "available";
  message: EmailSourceMessageValue;
}

interface EmailSourceReadUnavailableValue {
  kind: "unavailable";
}

type EmailSourceReadResponseValue =
  EmailSourceReadAvailableValue | EmailSourceReadUnavailableValue;

export const emailSourceReadResponseSchema: z.ZodType<
  EmailSourceReadResponseValue,
  EmailSourceReadResponseValue
> = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("available"),
    message: emailSourceMessageSchema,
  }),
  z.strictObject({ kind: z.literal("unavailable") }),
]);

export type EmailSourceReadRequest = z.output<
  typeof emailSourceReadRequestSchema
>;
export type EmailSourceMessage = z.output<typeof emailSourceMessageSchema>;
export type EmailSourceReadResponse = z.output<
  typeof emailSourceReadResponseSchema
>;
