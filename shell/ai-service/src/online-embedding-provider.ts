import { createOpenAI } from "@ai-sdk/openai";
import { embedMany, embed } from "ai";
import type { Logger } from "@brains/utils/logger";
import type {
  IEmbeddingService,
  EmbeddingResult,
  BatchEmbeddingResult,
} from "@brains/entity-service";
import type { EmbeddingUsageRecorder } from "./embedding-usage-meter";

export interface OnlineEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimensions?: number;
  logger: Logger;
  /** Told what each call used, so a guest turn is charged for its embeddings. */
  usage?: EmbeddingUsageRecorder;
  /** The HTTP client to reach OpenAI with; the platform's by default. */
  fetch?: typeof fetch;
}

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1536;

/**
 * Embedding provider that uses the OpenAI embeddings API.
 * Uses the OpenAI embeddings API for vector generation.
 */
export class OnlineEmbeddingProvider implements IEmbeddingService {
  public readonly model: string;
  public readonly dimensions: number;
  private readonly openai: ReturnType<typeof createOpenAI>;
  private readonly logger: Logger;
  private readonly usage: EmbeddingUsageRecorder | undefined;

  public static createFresh(
    config: OnlineEmbeddingConfig,
  ): OnlineEmbeddingProvider {
    return new OnlineEmbeddingProvider(config);
  }

  private constructor(config: OnlineEmbeddingConfig) {
    if (!config.apiKey) {
      throw new Error("API key is required for online embedding provider");
    }

    this.model = config.model ?? DEFAULT_MODEL;
    this.dimensions = config.dimensions ?? DEFAULT_DIMENSIONS;
    this.logger = config.logger.child("OnlineEmbeddingProvider");
    this.usage = config.usage;

    this.openai = createOpenAI({
      apiKey: config.apiKey,
      ...(config.fetch ? { fetch: config.fetch } : {}),
    });
  }

  async generateEmbedding(
    text: string,
    signal?: AbortSignal,
  ): Promise<EmbeddingResult> {
    signal?.throwIfAborted();
    this.logger.debug(`Generating embedding for text (${text.length} chars)`);

    const { embedding, usage } = await embed({
      model: this.openai.embedding(this.model),
      value: text,
      ...(signal ? { abortSignal: signal } : {}),
      providerOptions: {
        openai: { dimensions: this.dimensions },
      },
    });

    this.usage?.record(this.model, usage.tokens);
    return {
      embedding: new Float32Array(embedding),
      usage: { tokens: usage.tokens },
    };
  }

  async generateEmbeddings(
    texts: string[],
    signal?: AbortSignal,
  ): Promise<BatchEmbeddingResult> {
    signal?.throwIfAborted();
    if (texts.length === 0) {
      return { embeddings: [], usage: { tokens: 0 } };
    }

    this.logger.debug(`Generating embeddings for ${texts.length} texts`);

    const { embeddings, usage } = await embedMany({
      model: this.openai.embedding(this.model),
      values: texts,
      ...(signal ? { abortSignal: signal } : {}),
      providerOptions: {
        openai: { dimensions: this.dimensions },
      },
    });

    this.usage?.record(this.model, usage.tokens);
    return {
      embeddings: embeddings.map((e) => new Float32Array(e)),
      usage: { tokens: usage.tokens },
    };
  }
}
