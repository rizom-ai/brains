import { z } from "@brains/utils/zod";

export const EMAIL_SEND = "email:send";

export type EmailSensitivity = "normal" | "secret";

export interface SendEmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string | undefined;
  sensitivity: EmailSensitivity;
  idempotencyKey?: string | undefined;
}

export interface SendEmailPayloadInput {
  to: string;
  subject: string;
  text: string;
  html?: string | undefined;
  sensitivity?: EmailSensitivity | undefined;
  idempotencyKey?: string | undefined;
}

export const sendEmailPayloadSchema: z.ZodType<
  SendEmailPayload,
  SendEmailPayloadInput
> = z.strictObject({
  to: z.string().email(),
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().min(1).optional(),
  sensitivity: z.enum(["normal", "secret"]).default("normal"),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export type SendEmailResult =
  { status: "sent"; id?: string } | { status: "failed" };
