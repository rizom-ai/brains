import { wrapLanguageModel, type LanguageModel } from "ai";
import {
  guestExecutionPolicySchema,
  type GuestExecutionPolicy,
} from "@brains/contracts/chat";
import { z } from "@brains/utils/zod";

type GuestModel = Parameters<typeof wrapLanguageModel>[0]["model"];
type GuestModelResult = Awaited<ReturnType<GuestModel["doGenerate"]>>;
export type GuestModelCall = Parameters<GuestModel["doGenerate"]>[0];
const modelQuoteSchema: z.ZodObject<
  { inputTokens: z.ZodNumber; maxCostMicroUsd: z.ZodNumber },
  z.core.$strict
> = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  maxCostMicroUsd: z.number().int().nonnegative(),
});
const toolQuoteSchema: z.ZodObject<
  { maxCostMicroUsd: z.ZodNumber },
  z.core.$strict
> = modelQuoteSchema.omit({ inputTokens: true });

/** Trusted, model-specific accounting. No bytes-to-token heuristic or fallback prices.
 * Quotes must upper-bound the complete request (including reasoning/cache/tool costs).
 * Accounting itself must be non-billable. Adapters must reject unsupported
 * models/pricing revisions, honor the supplied signal and never log transcripts.
 */
export interface GuestExecutionAccounting {
  model(request: {
    provider: string;
    modelId: string;
    params: Readonly<GuestModelCall>;
  }): Promise<z.output<typeof modelQuoteSchema>>;
  tool(request: {
    name: string;
    input: unknown;
    signal: AbortSignal;
  }): Promise<z.output<typeof toolQuoteSchema>>;
}

function serialize(value: unknown): string {
  try {
    const serialized: unknown = JSON.stringify(value);
    if (typeof serialized !== "string") throw new Error("Not JSON");
    return serialized;
  } catch {
    // Invalid/cyclic payloads are rejected without including their contents.
    throw new Error("Guest execution payload invalid");
  }
}

/** Per-turn, never shared across concurrent conversations. No expiry-based refunds. */
export class GuestTurnBudget {
  readonly policy: GuestExecutionPolicy;
  readonly signal: AbortSignal;
  private readonly accounting: GuestExecutionAccounting;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly cancellation: AbortController;
  private remainingCost: number;
  private remainingOutput: number;
  private modelCalls = 0;
  private toolCalls = 0;
  private modelActive = false;
  private closed = false;

  constructor(
    policy: GuestExecutionPolicy,
    accounting?: GuestExecutionAccounting,
    signal?: AbortSignal,
  ) {
    const parsed = guestExecutionPolicySchema.safeParse(policy);
    if (!parsed.success) throw new Error("Guest execution limits required");
    if (!accounting) throw new Error("Guest accounting unavailable");
    this.policy = parsed.data;
    this.accounting = accounting;
    this.remainingCost = this.policy.maxCostMicroUsd;
    this.remainingOutput = this.policy.limits.outputTokens;
    const deadline = new AbortController();
    this.cancellation = deadline;
    this.signal = signal
      ? AbortSignal.any([signal, deadline.signal])
      : deadline.signal;
    this.timer = setTimeout(
      () => deadline.abort(new Error("Guest request deadline exceeded")),
      this.policy.limits.requestTimeoutSeconds * 1000,
    );
    this.timer.unref();
  }

  dispose(): void {
    this.closed = true;
    // Notify admitted work even when a sibling call ends the turn early.
    // Abort is a request, never evidence that remote work has stopped.
    this.cancellation.abort(new Error("Guest budget closed"));
    clearTimeout(this.timer);
  }

  exhausted(): boolean {
    return (
      this.closed ||
      this.signal.aborted ||
      this.modelCalls >= this.policy.limits.toolSteps ||
      this.remainingOutput <= 0 ||
      this.remainingCost <= 0
    );
  }

  wrapModel(model: LanguageModel): GuestModel {
    if (typeof model === "string" || model.specificationVersion !== "v3")
      throw new Error("Guest model accounting unsupported");
    return wrapLanguageModel({
      model,
      middleware: {
        specificationVersion: "v3",
        transformParams: async ({ params }): Promise<GuestModelCall> => ({
          ...params,
        }),
        wrapGenerate: async ({
          params,
          doGenerate,
        }): Promise<GuestModelResult> => {
          this.assertLive();
          if (this.modelActive)
            throw new Error("Guest model call already active");
          if (this.modelCalls >= this.policy.limits.toolSteps)
            throw new Error("Guest model step limit exceeded");
          if (this.remainingOutput <= 0)
            throw new Error("Guest output limit exceeded");
          this.modelCalls++;
          this.modelActive = true;
          try {
            const outputAllowance = this.remainingOutput;
            params.abortSignal = this.signal;
            params.maxOutputTokens = outputAllowance;
            const bytes = new TextEncoder().encode(
              serialize({ prompt: params.prompt, tools: params.tools }),
            ).byteLength;
            if (bytes > this.policy.limits.contextBytes)
              throw new Error("Guest context limit exceeded");
            // Accounting errors may contain private provider details. A missing quote
            // is a hard denial, never a fallback estimate or an unmetered request.
            const quoteParams = {
              ...params,
              prompt: structuredClone(params.prompt),
              ...(params.tools ? { tools: structuredClone(params.tools) } : {}),
            };
            const quote = modelQuoteSchema.safeParse(
              await Promise.resolve()
                .then(() =>
                  this.accounting.model({
                    provider: model.provider,
                    modelId: model.modelId,
                    params: quoteParams,
                  }),
                )
                .catch(() => null),
            );
            this.assertLive();
            if (!quote.success) throw new Error("Guest accounting unavailable");
            if (quote.data.inputTokens > this.policy.limits.contextTokens)
              throw new Error("Guest context limit exceeded");
            this.charge(quote.data.maxCostMicroUsd);
            // Unknown provider outcomes cannot return their output allowance for reuse.
            this.remainingOutput = 0;
            let result: GuestModelResult;
            try {
              result = await doGenerate();
            } catch {
              // Provider errors can contain request bodies/credentials. Preserve
              // cancellation, but never expose the provider's raw exception.
              this.assertLive();
              throw new Error("Guest provider unavailable");
            }
            this.assertLive();
            const used = result.usage.outputTokens.total;
            const input = result.usage.inputTokens.total;
            if (
              used === undefined ||
              input === undefined ||
              !Number.isSafeInteger(used) ||
              used < 0 ||
              used > outputAllowance ||
              !Number.isSafeInteger(input) ||
              input < 0 ||
              input > quote.data.inputTokens
            ) {
              throw new Error("Guest provider exceeded accounted token bounds");
            }
            this.remainingOutput = outputAllowance - used;
            return result;
          } finally {
            this.modelActive = false;
          }
        },
        // BrainAgent uses generate; streaming must not bypass preflight accounting.
        wrapStream: async (): Promise<never> => {
          throw new Error("Guest provider streaming is not admitted");
        },
      },
    });
  }

  async executeTool(
    name: string,
    input: unknown,
    handler: () => Promise<unknown>,
  ): Promise<unknown> {
    this.assertLive();
    if (this.toolCalls >= this.policy.limits.toolCalls)
      throw new Error("Guest tool call limit exceeded");
    if (serialize(input).length > this.policy.limits.messageCharacters)
      throw new Error("Guest tool input limit exceeded");
    this.toolCalls++;
    const quote = toolQuoteSchema.safeParse(
      await Promise.resolve()
        .then(() =>
          this.accounting.tool({
            name,
            input: structuredClone(input),
            signal: this.signal,
          }),
        )
        .catch(() => null),
    );
    this.assertLive();
    if (!quote.success) throw new Error("Guest accounting unavailable");
    this.charge(quote.data.maxCostMicroUsd);
    const result = await handler();
    this.assertLive();
    if (serialize(result).length > this.policy.limits.toolResultCharacters)
      return {
        success: false,
        error: "Public retrieval exceeds guest result limit",
      };
    return result;
  }

  private assertLive(): void {
    this.signal.throwIfAborted();
    if (this.closed) throw new Error("Guest budget closed");
  }

  private charge(cost: number): void {
    if (cost > this.remainingCost) throw new Error("Guest cost limit exceeded");
    this.remainingCost -= cost;
  }
}
