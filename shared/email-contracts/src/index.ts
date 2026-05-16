import { z } from "@brains/utils";

export const EMAIL_SEND = "email:send";

export const sendEmailPayloadSchema = z
  .object({
    to: z.string().email(),
    subject: z.string().min(1),
    text: z.string().min(1),
    html: z.string().min(1).optional(),
  })
  .strict();

export type SendEmailPayload = z.infer<typeof sendEmailPayloadSchema>;

export type SendEmailResult =
  | { status: "sent"; id?: string }
  | { status: "failed" };
