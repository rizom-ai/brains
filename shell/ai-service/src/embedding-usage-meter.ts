import { AsyncLocalStorage } from "node:async_hooks";

/** One embedding request's reported usage, or an unfinished/unreported attempt. */
export interface EmbeddingUsage {
  model: string;
  tokens: number;
  incomplete?: boolean;
}

export interface EmbeddingUsageRecorder {
  currentSignal(): AbortSignal | undefined;
  begin(model: string): { finish: (tokens: number) => void } | undefined;
}

interface Measurement {
  usage: EmbeddingUsage[];
  signal: AbortSignal;
  active: boolean;
}

/** Host-owned per-turn embedding usage and lifetime, including auxiliary searches. */
export class EmbeddingUsageMeter implements EmbeddingUsageRecorder {
  private readonly storage = new AsyncLocalStorage<Measurement>();

  private readonly instrumented: boolean;

  public static createFresh(instrumented = true): EmbeddingUsageMeter {
    return new EmbeddingUsageMeter(instrumented);
  }

  private constructor(instrumented: boolean) {
    this.instrumented = instrumented;
  }

  public currentSignal(): AbortSignal | undefined {
    return this.storage.getStore()?.signal;
  }

  public begin(
    model: string,
  ): { finish: (tokens: number) => void } | undefined {
    const scope = this.storage.getStore();
    if (!scope) return undefined;
    scope.signal.throwIfAborted();
    const call: EmbeddingUsage = { model, tokens: 0, incomplete: true };
    scope.usage.push(call);
    return {
      finish: (tokens): void => {
        if (!scope.active) return;
        call.tokens = tokens;
        delete call.incomplete;
      },
    };
  }

  public record(model: string, tokens: number, incomplete?: boolean): void {
    const scope = this.storage.getStore();
    if (scope?.active)
      scope.usage.push({
        model,
        tokens,
        ...(incomplete ? { incomplete } : {}),
      });
  }

  public async measure<T>(
    work: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<{ value: T; usage: EmbeddingUsage[] }> {
    const controller = new AbortController();
    const scope: Measurement = {
      // An injected provider outside this recorder cannot establish zero spend.
      usage: this.instrumented
        ? []
        : [
            {
              model: "unmetered-embedding-provider",
              tokens: 0,
              incomplete: true,
            },
          ],
      active: true,
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
    };
    try {
      scope.signal.throwIfAborted();
      const value = await this.storage.run(scope, work);
      scope.signal.throwIfAborted();
      return { value, usage: scope.usage.map((call) => ({ ...call })) };
    } finally {
      scope.active = false;
      controller.abort();
    }
  }
}
