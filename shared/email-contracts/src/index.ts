import { z } from "@brains/utils/zod-v4";

export const EMAIL_SEND = "email:send";

export const sendEmailPayloadSchema = z.strictObject({
  to: z.string().email(),
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().min(1).optional(),
  sensitivity: z.enum(["normal", "secret"]).default("normal"),
});

export type SendEmailPayload = z.output<typeof sendEmailPayloadSchema>;
export type SendEmailPayloadInput = z.input<typeof sendEmailPayloadSchema>;

export type SendEmailResult =
  | { status: "sent"; id?: string }
  | { status: "failed" };
