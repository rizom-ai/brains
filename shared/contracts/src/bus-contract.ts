import type { z } from "@brains/utils/zod";
import type { SdkErrorData } from "./sdk-error";

/**
 * How a contract's message travels:
 * - `request`: exactly one owner answers;
 * - `collect`: every subscriber answers;
 * - `command`: every subscriber receives it and nobody answers.
 */
export type BusDelivery = "request" | "collect" | "command";

/**
 * A cross-plugin bus call declared once: its channel, what the sender sends,
 * what the owner answers, and how it is delivered. It is a message channel
 * too (`name` and `schema`), so it fits wherever a channel does.
 */
export interface BusContract<
  TRequest extends z.ZodType,
  TResponse extends z.ZodType,
  TDelivery extends BusDelivery = BusDelivery,
> {
  readonly name: string;
  readonly schema: TRequest;
  readonly response: TResponse;
  readonly delivery: TDelivery;
}

/** What a collect contract's sender gets: every valid answer, and what went wrong with the rest. */
export type BusCollection<T> =
  | { status: "answered"; answers: T[]; failures: SdkErrorData[] }
  | { status: "unavailable" };

/**
 * A sender's view of a contract call. A failure arrives in its public form,
 * as an SdkError publishes it: the code survives, and the diagnostic stays
 * with the answering package.
 */
export type BusResult<T> =
  | { status: "answered"; data: T }
  | { status: "unavailable" }
  | { status: "failed"; error: SdkErrorData };

/** What an owner learns about a call besides the request: the plugin that sent it. */
export interface BusAnswerMeta {
  sender: string;
}

export function defineBusContract<
  TRequest extends z.ZodType,
  TResponse extends z.ZodType,
  TDelivery extends BusDelivery,
>(definition: {
  channel: string;
  request: TRequest;
  response: TResponse;
  delivery: TDelivery;
}): BusContract<TRequest, TResponse, TDelivery> {
  return Object.freeze({
    name: definition.channel,
    schema: definition.request,
    response: definition.response,
    delivery: definition.delivery,
  });
}
