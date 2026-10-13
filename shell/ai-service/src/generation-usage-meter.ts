import { AsyncLocalStorage } from "node:async_hooks";
import type { LanguageModelUsage } from "ai";
import type { GuestTurnSettlement } from "@brains/contracts/chat";
import {
  guestTurnSettlement,
  priceOpenAiGuestTurn,
  sumGuestSettlements,
} from "./openai-guest-pricing";

interface GenerationCall {
  model: string | undefined;
  usage?: LanguageModelUsage;
}
interface Measurement {
  calls: GenerationCall[];
  controller: AbortController;
  signal: AbortSignal;
  active: boolean;
}

/** Host-owned accounting for auxiliary generation, separate from agent steps. */
export class GenerationUsageMeter {
  private readonly storage = new AsyncLocalStorage<Measurement>();

  public static createFresh(): GenerationUsageMeter {
    return new GenerationUsageMeter();
  }

  private constructor() {}

  /** Register before calling the provider: a failed call is unknown, not free. */
  public begin(model: string | undefined):
    | {
        signal: AbortSignal;
        finish: (usage: LanguageModelUsage) => void;
      }
    | undefined {
    const scope = this.storage.getStore();
    if (!scope) return undefined;
    scope.signal.throwIfAborted();
    const call: GenerationCall = { model };
    scope.calls.push(call);
    return {
      signal: scope.signal,
      finish: (usage): void => {
        if (scope.active) call.usage = structuredClone(usage);
      },
    };
  }

  public async measure<T>(
    work: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<{
    value: T;
    settlement: GuestTurnSettlement;
  }> {
    const controller = new AbortController();
    const scope: Measurement = {
      calls: [],
      controller,
      active: true,
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
    };
    try {
      scope.signal.throwIfAborted();
      const value = await this.storage.run(scope, work);
      scope.signal.throwIfAborted();
      const settlement = scope.calls.reduce<GuestTurnSettlement>(
        (total, call) =>
          sumGuestSettlements(
            total,
            guestTurnSettlement(
              [{ usage: call.usage }],
              call.model === "gpt-5.6-luna" ? priceOpenAiGuestTurn : undefined,
            ),
          ),
        guestTurnSettlement([], priceOpenAiGuestTurn),
      );
      return { value, settlement };
    } finally {
      scope.active = false;
      controller.abort();
    }
  }
}
