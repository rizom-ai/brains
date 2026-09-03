import { z } from "@brains/utils/zod";

export const EMAIL_SOURCE_READ = "email:source-read" as const;

type EmailSourceReadActorSchema = z.ZodObject<
  {
    permissionLevel: z.ZodEnum<{
      admin: "admin";
      trusted: "trusted";
      public: "public";
    }>;
  },
  z.core.$strict
>;

const emailSourceReadActorSchema: EmailSourceReadActorSchema = z.strictObject({
  permissionLevel: z.enum(["admin", "trusted", "public"]),
});

const abortSignalSchema: z.ZodCustom<AbortSignal, AbortSignal> =
  z.custom<AbortSignal>(
    (value) =>
      typeof AbortSignal !== "undefined" && value instanceof AbortSignal,
  );

type EmailSourceReadRequestSchema = z.ZodObject<
  {
    sourceRef: z.ZodString;
    actor: EmailSourceReadActorSchema;
    signal: z.ZodOptional<typeof abortSignalSchema>;
  },
  z.core.$strict
>;

export const emailSourceReadRequestSchema: EmailSourceReadRequestSchema =
  z.strictObject({
    sourceRef: z.string().regex(/^imap:[a-f0-9]{64}$/),
    actor: emailSourceReadActorSchema,
    signal: abortSignalSchema.optional(),
  });

type EmailSourceAddressSchema = z.ZodObject<
  { name: z.ZodOptional<z.ZodString>; address: z.ZodEmail },
  z.core.$strict
>;

const emailSourceAddressSchema: EmailSourceAddressSchema = z.strictObject({
  name: z.string().trim().min(1).max(300).optional(),
  address: z.email().max(320),
});

type EmailSourceMessageSchema = z.ZodObject<
  {
    messageId: z.ZodString;
    from: EmailSourceAddressSchema;
    replyTo: z.ZodOptional<EmailSourceAddressSchema>;
    to: z.ZodArray<EmailSourceAddressSchema>;
    subject: z.ZodString;
    receivedAt: z.ZodISODateTime;
    text: z.ZodString;
    inReplyTo: z.ZodOptional<z.ZodString>;
    references: z.ZodArray<z.ZodString>;
    truncated: z.ZodBoolean;
  },
  z.core.$strict
>;

const emailSourceMessageSchema: EmailSourceMessageSchema = z.strictObject({
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

type EmailSourceReadResponseSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      { kind: z.ZodLiteral<"available">; message: EmailSourceMessageSchema },
      z.core.$strict
    >,
    z.ZodObject<{ kind: z.ZodLiteral<"unavailable"> }, z.core.$strict>,
  ]
>;

export const emailSourceReadResponseSchema: EmailSourceReadResponseSchema =
  z.discriminatedUnion("kind", [
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
