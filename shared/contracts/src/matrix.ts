import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type MatrixBotCredentialsRequestSchema = z.ZodObject<Record<never, never>>;
type MatrixBotCredentialsSchema = z.ZodObject<{
  userId: z.ZodString;
  password: z.ZodString;
}>;

const matrixBotCredentialsRequestSchema: MatrixBotCredentialsRequestSchema =
  z.object({});

export const matrixBotCredentialsSchema: MatrixBotCredentialsSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});

export type MatrixBotCredentials = z.output<typeof matrixBotCredentialsSchema>;

/**
 * The brain's Matrix bot account on its own homeserver, answered in every
 * process by the plugin that owns the homeserver, so the chat interface logs
 * in and delivers without a password in its configuration.
 */
export const matrixBotCredentialsContract: BusContract<
  MatrixBotCredentialsRequestSchema,
  MatrixBotCredentialsSchema,
  "request"
> = defineBusContract({
  channel: "matrix:bot-credentials",
  request: matrixBotCredentialsRequestSchema,
  response: matrixBotCredentialsSchema,
  delivery: "request",
});

/** The localpart every brain's bot uses, so a peer's bot is `@_brain:<peer>`. */
export const BRAIN_BOT_LOCALPART = "_brain";

/** Whether a Matrix user id belongs to a brain's bot, on any server. */
export function isBrainBotUserId(userId: string): boolean {
  const prefix = `@${BRAIN_BOT_LOCALPART}:`;
  return userId.startsWith(prefix) && userId.length > prefix.length;
}
