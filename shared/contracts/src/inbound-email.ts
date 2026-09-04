import { z } from "@brains/utils/zod";

export const EMAIL_INBOUND = "email:inbound" as const;

type InboundEmailAddressSchema = z.ZodObject<
  { name: z.ZodOptional<z.ZodString>; address: z.ZodEmail },
  z.core.$strict
>;

export const inboundEmailAddressSchema: InboundEmailAddressSchema =
  z.strictObject({
    name: z.string().min(1).optional(),
    address: z.email(),
  });

export type InboundEmailAddress = z.output<typeof inboundEmailAddressSchema>;

type InboundEmailSenderSchema = z.ZodObject<
  {
    personId: z.ZodString;
    displayName: z.ZodString;
    permissionLevel: z.ZodEnum<{
      admin: "admin";
      trusted: "trusted";
      public: "public";
    }>;
  },
  z.core.$strict
>;

export const inboundEmailSenderSchema: InboundEmailSenderSchema =
  z.strictObject({
    personId: z.string().min(1).max(200),
    displayName: z.string().trim().min(1).max(200),
    permissionLevel: z.enum(["admin", "trusted", "public"]),
  });

export type InboundEmailSender = z.output<typeof inboundEmailSenderSchema>;

type InboundEmailSchema = z.ZodObject<
  {
    messageId: z.ZodString;
    sourceRef: z.ZodString;
    threadId: z.ZodOptional<z.ZodString>;
    from: InboundEmailAddressSchema;
    replyTo: z.ZodOptional<InboundEmailAddressSchema>;
    to: z.ZodArray<InboundEmailAddressSchema>;
    subject: z.ZodString;
    receivedAt: z.ZodISODateTime;
    text: z.ZodString;
    html: z.ZodOptional<z.ZodString>;
    headers: z.ZodObject<
      {
        listUnsubscribe: z.ZodOptional<z.ZodString>;
        autoSubmitted: z.ZodOptional<z.ZodString>;
        precedence: z.ZodOptional<z.ZodString>;
        inReplyTo: z.ZodOptional<z.ZodString>;
        references: z.ZodOptional<z.ZodArray<z.ZodString>>;
      },
      z.core.$strict
    >;
    sender: z.ZodOptional<InboundEmailSenderSchema>;
  },
  z.core.$strict
>;

export const inboundEmailSchema: InboundEmailSchema = z.strictObject({
  messageId: z.string().min(1),
  sourceRef: z.string().min(1),
  threadId: z.string().min(1).optional(),
  from: inboundEmailAddressSchema,
  replyTo: inboundEmailAddressSchema.optional(),
  to: z.array(inboundEmailAddressSchema),
  subject: z.string(),
  receivedAt: z.iso.datetime(),
  text: z.string(),
  html: z.string().min(1).optional(),
  headers: z.strictObject({
    listUnsubscribe: z.string().min(1).optional(),
    autoSubmitted: z.string().min(1).optional(),
    precedence: z.string().min(1).optional(),
    inReplyTo: z.string().min(1).optional(),
    references: z.array(z.string().min(1)).optional(),
  }),
  sender: inboundEmailSenderSchema.optional(),
});

export type InboundEmail = z.output<typeof inboundEmailSchema>;
