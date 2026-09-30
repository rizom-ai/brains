import { AsyncLocalStorage } from "node:async_hooks";

/** One embedding call's reported usage. */
export interface EmbeddingUsage {
  model: string;
  tokens: number;
}

/** Where an embedding provider reports what each call used. */
export interface EmbeddingUsageRecorder {
  record(model: string, tokens: number): void;
}

/**
 * What a piece of work spent on embeddings, however deep in it they were
 * made: a turn's own searches, or the search that finds its sources. The
 * embedding provider records each call; work measured here sees only its own
 * calls, and a call made outside any measurement counts toward nothing.
 */
export class EmbeddingUsageMeter implements EmbeddingUsageRecorder {
  private readonly storage = new AsyncLocalStorage<EmbeddingUsage[]>();

  public static createFresh(): EmbeddingUsageMeter {
    return new EmbeddingUsageMeter();
  }

  private constructor() {}

  public record(model: string, tokens: number): void {
    this.storage.getStore()?.push({ model, tokens });
  }

  public async measure<T>(
    work: () => Promise<T>,
  ): Promise<{ value: T; usage: EmbeddingUsage[] }> {
    const usage: EmbeddingUsage[] = [];
    const value = await this.storage.run(usage, work);
    return { value, usage };
  }
}
