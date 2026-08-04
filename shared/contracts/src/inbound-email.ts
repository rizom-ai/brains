import { z } from "@brains/utils/zod";

export const EMAIL_INBOUND = "email:inbound" as const;

interface InboundEmailAddressValue {
  name?: string | undefined;
  address: string;
}

export const inboundEmailAddressSchema: z.ZodType<
  InboundEmailAddressValue,
  InboundEmailAddressValue
> = z.strictObject({
  name: z.string().min(1).optional(),
  address: z.email(),
});

export type InboundEmailAddress = z.output<typeof inboundEmailAddressSchema>;

interface InboundEmailSenderValue {
  personId: string;
  permissionLevel: "admin" | "trusted" | "public";
}

export const inboundEmailSenderSchema: z.ZodType<
  InboundEmailSenderValue,
  InboundEmailSenderValue
> = z.strictObject({
  personId: z.string().min(1),
  permissionLevel: z.enum(["admin", "trusted", "public"]),
});

export type InboundEmailSender = z.output<typeof inboundEmailSenderSchema>;

interface InboundEmailValue {
  messageId: string;
  sourceRef: string;
  threadId?: string | undefined;
  from: InboundEmailAddressValue;
  to: InboundEmailAddressValue[];
  subject: string;
  receivedAt: string;
  text: string;
  html?: string | undefined;
  headers: {
    listUnsubscribe?: string | undefined;
    autoSubmitted?: string | undefined;
    precedence?: string | undefined;
  };
  sender?: InboundEmailSenderValue | undefined;
}

export const inboundEmailSchema: z.ZodType<
  InboundEmailValue,
  InboundEmailValue
> = z.strictObject({
  messageId: z.string().min(1),
  sourceRef: z.string().min(1),
  threadId: z.string().min(1).optional(),
  from: inboundEmailAddressSchema,
  to: z.array(inboundEmailAddressSchema),
  subject: z.string(),
  receivedAt: z.iso.datetime(),
  text: z.string(),
  html: z.string().min(1).optional(),
  headers: z.strictObject({
    listUnsubscribe: z.string().min(1).optional(),
    autoSubmitted: z.string().min(1).optional(),
    precedence: z.string().min(1).optional(),
  }),
  sender: inboundEmailSenderSchema.optional(),
});

export type InboundEmail = z.output<typeof inboundEmailSchema>;
