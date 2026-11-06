import type {
  BusAnswerMeta,
  BusCollection,
  BusContract,
  BusResult,
} from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import type { IMessageBus } from "./types";
import type { MessageResponse } from "./base-types";

function outsideContract(contract: { name: string }): string {
  return `${contract.name} answered outside its contract`;
}

function failureOf(response: MessageResponse<unknown>): string | undefined {
  if ("success" in response && response.success) return undefined;
  return ("error" in response ? response.error : undefined) ?? "No answer";
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
    : { status: "failed", error: outsideContract(contract) };
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
  const failures: string[] = [];
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
    else failures.push(outsideContract(contract));
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
      return { success: false, error: `Invalid ${contract.name} request` };
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
      return { success: false, error: outsideContract(contract) };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });
}
