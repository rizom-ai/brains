import { APICallError, type FinishReason } from "ai";
import { z } from "@brains/utils/zod";
import { AIProviderDeclinedError, aiProviderDeclinedMessage } from "./errors";

/**
 * Provider error codes that reject a request on content policy. OpenAI
 * answers a flagged prompt with `invalid_prompt` ("your prompt was flagged as
 * potentially violating our usage policy") before generating anything.
 */
const contentPolicyErrorCodes: ReadonlySet<string> = new Set([
  "invalid_prompt",
]);

const providerErrorBodySchema = z.object({
  error: z.object({ code: z.string() }),
});

function providerErrorCode(data: unknown): string | undefined {
  const parsed = providerErrorBodySchema.safeParse(data);
  return parsed.success ? parsed.data.error.code : undefined;
}

function parseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A provider API error that rejects the request on content policy. */
export function isContentPolicyRejection(error: unknown): boolean {
  if (!APICallError.isInstance(error)) return false;
  const code =
    providerErrorCode(error.data) ??
    providerErrorCode(parseJson(error.responseBody));
  return code !== undefined && contentPolicyErrorCodes.has(code);
}

interface TurnStep {
  toolCalls: ReadonlyArray<unknown>;
}

interface DeclinableTurn {
  text: string;
  finishReason: FinishReason;
  steps: ReadonlyArray<TurnStep>;
}

type StepFinished = (step: TurnStep) => void;

/**
 * Anthropic (`refusal`), Google (`SAFETY`, `PROHIBITED_CONTENT`, a blocked
 * prompt, …) and OpenAI (`content_filter`) decline by finishing with
 * `content-filter` instead of erroring.
 */
function isContentFilterFinish(turn: DeclinableTurn): boolean {
  return turn.finishReason === "content-filter";
}

function ranTool(steps: ReadonlyArray<TurnStep>): boolean {
  return steps.some((step) => step.toolCalls.length > 0);
}

/**
 * The turn that answers, its text, and the declined first attempt it
 * replaced, when that attempt returned (its model calls count toward usage).
 * A turn the provider declined after a tool ran keeps its tool results; its
 * text is the declined message.
 */
export interface DeclinableTurnOutcome<R> {
  result: R;
  text: string;
  retriedAfter?: R;
}

function outcome<R extends DeclinableTurn>(
  result: R,
  retriedAfter?: R,
): DeclinableTurnOutcome<R> {
  return {
    result,
    text: isContentFilterFinish(result)
      ? aiProviderDeclinedMessage
      : result.text,
    ...(retriedAfter ? { retriedAfter } : {}),
  };
}

/**
 * Run a turn, and run it once more with the same inputs when the provider
 * declines it on content policy before any tool executed. A second decline,
 * or a rejected call after a tool ran, throws `AIProviderDeclinedError`.
 * Every other failure propagates unchanged.
 */
export async function retryDeclinedTurnOnce<R extends DeclinableTurn>(
  run: (onStepFinish: StepFinished) => Promise<R>,
): Promise<DeclinableTurnOutcome<R>> {
  const attempt = async (): Promise<
    | { kind: "answered"; result: R }
    | { kind: "declined"; cause: unknown; result?: R }
  > => {
    const finished: TurnStep[] = [];
    try {
      const result = await run((step) => finished.push(step));
      return !isContentFilterFinish(result) || ranTool(result.steps)
        ? { kind: "answered", result }
        : { kind: "declined", cause: result.finishReason, result };
    } catch (error) {
      if (!isContentPolicyRejection(error)) throw error;
      // A tool's effects are never repeated: the decline stands.
      if (ranTool(finished)) throw new AIProviderDeclinedError(error);
      return { kind: "declined", cause: error };
    }
  };

  const first = await attempt();
  if (first.kind === "answered") return outcome(first.result);
  const second = await attempt();
  if (second.kind === "declined")
    throw new AIProviderDeclinedError(second.cause);
  return outcome(second.result, first.result);
}
