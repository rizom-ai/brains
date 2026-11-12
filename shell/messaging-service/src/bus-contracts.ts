import {
  SdkError,
  sdkErrorSchema,
  toSdkError,
  type BusAnswerMeta,
  type BusCollection,
  type BusContract,
  type BusResult,
  type Channel,
  type SdkErrorData,
} from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import type { IMessageBus } from "./types";
import type { MessageBusSendRequest, MessageResponse } from "./base-types";

/** An answer outside its contract: the owner's bug, which the asker cannot fix. */
const outsideContract: SdkErrorData = new SdkError("invalid_response").toJSON();

/**
 * A reply's failure as the asker is told it, or undefined for a success. Only
 * a failure that names its code carries a public message the asker may
 * trust; any other is a failed handler, its text left unread.
 */
function failureOf(
  response: MessageResponse<unknown>,
): SdkErrorData | undefined {
  if ("success" in response && response.success) return undefined;
  if (!("success" in response)) return new SdkError("no_handler").toJSON();
  const published = sdkErrorSchema.safeParse({
    code: response.code,
    message: response.error,
  });
  return published.success
    ? published.data
    : new SdkError("handler_failed").toJSON();
}

/** A failure as the bus carries it: the public message beside its code. */
function failedReply(failure: SdkErrorData): MessageResponse<never> {
  return { success: false, error: failure.message, code: failure.code };
}

/** Ask a request contract's owner; see `IMessagingNamespace.request`. */
export async function requestContract<
  TRequest extends z.ZodType,
  TResponse extends z.ZodType,
>(
  bus: Pick<IMessageBus, "send" | "getHandlerCount">,
  contract: BusContract<TRequest, TResponse, "request">,
  payload: z.input<TRequest>,
  sender: string,
): Promise<BusResult<z.output<TResponse>>> {
  const request = contract.schema.parse(payload);
  if (bus.getHandlerCount(contract.name) === 0)
    return { status: "unavailable" };
  const response = await bus.send({
    type: contract.name,
    payload: request,
    sender,
  });
  const failure = failureOf(response);
  if (failure !== undefined) return { status: "failed", error: failure };
  const answer = contract.response.safeParse(
    "data" in response ? response.data : undefined,
  );
  return answer.success
    ? { status: "answered", data: answer.data }
    : { status: "failed", error: outsideContract };
}

/** Gather every owner's answer to a collect contract. */
export async function collectContract<
  TRequest extends z.ZodType,
  TResponse extends z.ZodType,
>(
  bus: Pick<IMessageBus, "collect" | "getHandlerCount">,
  contract: BusContract<TRequest, TResponse, "collect">,
  payload: z.input<TRequest>,
  sender: string,
): Promise<BusCollection<z.output<TResponse>>> {
  const request = contract.schema.parse(payload);
  if (bus.getHandlerCount(contract.name) === 0)
    return { status: "unavailable" };
  const responses = await bus.collect({
    type: contract.name,
    payload: request,
    sender,
  });
  const answers: z.output<TResponse>[] = [];
  const failures: SdkErrorData[] = [];
  for (const response of responses) {
    const failure = failureOf(response);
    if (failure !== undefined) {
      failures.push(failure);
      continue;
    }
    const answer = contract.response.safeParse(
      "data" in response ? response.data : undefined,
    );
    if (answer.success) answers.push(answer.data);
    else failures.push(outsideContract);
  }
  return { status: "answered", answers, failures };
}

/**
 * Send a command to every owner. Nobody answers; an owner that fails does not
 * keep the others from hearing it, and a command no plugin owns goes nowhere.
 */
export async function commandContract<TRequest extends z.ZodType>(
  bus: Pick<IMessageBus, "send">,
  contract: BusContract<TRequest, z.ZodType, "command">,
  payload: z.input<TRequest>,
  sender: string,
): Promise<void> {
  const command = contract.schema.parse(payload);
  await bus.send({
    type: contract.name,
    payload: command,
    sender,
    broadcast: true,
  });
}

/** What a broadcast needs of a bus: a send whose reply nobody reads. */
export interface BroadcastBus {
  send(request: MessageBusSendRequest): Promise<unknown>;
}

/**
 * Broadcast an event on its typed channel: every subscriber hears it and
 * nobody's reply is read. The payload is parsed by the channel's schema before
 * it leaves, and the parsed payload is what is sent. A payload the channel
 * refuses is the sender's bug: it throws, naming the channel but not the
 * payload, and nothing is sent.
 */
export async function broadcastChannel<TPayload>(
  bus: BroadcastBus,
  channel: Channel<TPayload>,
  payload: NoInfer<TPayload>,
  sender: string,
): Promise<void> {
  const parsed = channel.schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `${sender} broadcast a payload ${channel.name} refuses: it does not match the channel's schema`,
    );
  }
  await bus.send({
    type: channel.name,
    payload: parsed.data,
    sender,
    broadcast: true,
  });
}

/**
 * Answer a request or collect contract, or hear a command. The handler sees only valid
 * requests; its reply leaves only when the contract accepts it. A request
 * contract has one owner, so a second one throws.
 */
export function answerContract<
  TRequest extends z.ZodType,
  TResponse extends z.ZodType,
>(
  bus: Pick<IMessageBus, "subscribe" | "getHandlerCount">,
  contract: BusContract<TRequest, TResponse>,
  handler: (
    request: z.output<TRequest>,
    meta: BusAnswerMeta,
  ) => Promise<z.input<TResponse>>,
  options: { owner: string; logger: Logger },
): () => void {
  const { owner, logger } = options;
  if (
    contract.delivery === "request" &&
    bus.getHandlerCount(contract.name) > 0
  ) {
    throw new Error(
      `${owner} cannot answer ${contract.name}: ${contract.name} already has an owner`,
    );
  }
  return bus.subscribe(contract.name, async (message) => {
    const request = contract.schema.safeParse(message.payload);
    if (!request.success) {
      logger.warn(`Refused an invalid ${contract.name} request`, {
        error: request.error.message,
      });
      return failedReply(
        new SdkError("invalid_input", {
          publicMessage: `Invalid ${contract.name} request`,
        }).toJSON(),
      );
    }
    const meta = { sender: message.source };
    try {
      if (contract.delivery === "command") {
        await handler(request.data, meta);
        return { success: true };
      }
      const reply = contract.response.safeParse(
        await handler(request.data, meta),
      );
      if (reply.success) return { success: true, data: reply.data };
      logger.error(`${owner} answered ${contract.name} outside its contract`, {
        error: reply.error.message,
      });
      return failedReply(outsideContract);
    } catch (error) {
      // The asker is told the failure's public form; the diagnostic stays
      // in the answering package's log. A failed handler is a fault; any
      // other code is an outcome the owner chose to report.
      const failure = toSdkError(error);
      const log = failure.code === "handler_failed" ? "error" : "warn";
      logger[log](`${owner} failed to answer ${contract.name}`, {
        code: failure.code,
        error: getErrorMessage(error),
      });
      return failedReply(failure.toJSON());
    }
  });
}
