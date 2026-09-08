import type { z } from "@brains/utils/zod";
import type {
  RequestContract,
  RequestResult,
  SubscriptionPayloadSchema,
  SubscriptionRequester,
} from "../contracts/subscription";

/** What the bus answers a send with, as far as asking is concerned. */
interface BusAnswer {
  readonly success?: boolean | undefined;
  readonly data?: unknown;
  readonly code?: string | undefined;
  readonly noop?: boolean | undefined;
}

/**
 * Asking over the bus, by topic or by contract.
 *
 * A contract names the answer's shape, so what comes back is parsed before
 * the asker sees it and the ways it can fail are named rather than folded
 * into one empty result. A bare topic keeps the older shape: whatever
 * answered, unparsed, for a question nobody has written a contract for.
 */
export function createRequester(
  send: (message: { type: string; payload: unknown }) => Promise<BusAnswer>,
): SubscriptionRequester {
  async function request(message: {
    readonly type: string;
    readonly payload: unknown;
  }): Promise<unknown>;
  async function request<
    TPayloadSchema extends SubscriptionPayloadSchema,
    TResponseSchema extends SubscriptionPayloadSchema,
  >(
    contract: RequestContract<TPayloadSchema, TResponseSchema>,
    payload: z.input<TPayloadSchema>,
  ): Promise<RequestResult<TResponseSchema>>;
  async function request(
    first:
      { readonly type: string; readonly payload: unknown } | RequestContract,
    second?: unknown,
  ): Promise<unknown> {
    if (!("topic" in first)) {
      return send({ type: first.type, payload: first.payload });
    }
    const answer = await send({ type: first.topic, payload: second });
    // A no-op is nobody answering, which is the same fact as no handler.
    if (answer.noop === true || answer.success !== true) {
      return {
        ok: false,
        code:
          answer.code === "handler_failed" ? "handler_failed" : "no_handler",
      };
    }
    const parsed = first.response.safeParse(answer.data);
    return parsed.success
      ? { ok: true, data: parsed.data }
      : { ok: false, code: "invalid_response" };
  }
  return request;
}
