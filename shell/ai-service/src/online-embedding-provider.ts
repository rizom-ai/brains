import { createOpenAI } from "@ai-sdk/openai";
import { embedMany, embed } from "ai";
import type { Logger } from "@brains/utils";
import type { IEmbeddingService } from "@brains/entity-service";

export interface OnlineEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimensions?: number;
  logger: Logger;
}

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1536;

/**
 * Embedding provider that uses the OpenAI embeddings API.
 * Uses the OpenAI embeddings API for vector generation.
 */
export class OnlineEmbeddingProvider implements IEmbeddingService {
  private static instance: OnlineEmbeddingProvider | null = null;

  public readonly model: string;
  public readonly dimensions: number;
  private readonly openai: ReturnType<typeof createOpenAI>;
  private readonly logger: Logger;

  public static getInstance(
    config: OnlineEmbeddingConfig,
  ): OnlineEmbeddingProvider {
    OnlineEmbeddingProvider.instance ??= new OnlineEmbeddingProvider(config);
    return OnlineEmbeddingProvider.instance;
  }

  public static resetInstance(): void {
    OnlineEmbeddingProvider.instance = null;
  }

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

    this.openai = createOpenAI({ apiKey: config.apiKey });
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    this.logger.debug(`Generating embedding for text (${text.length} chars)`);

    const { embedding } = await embed({
      model: this.openai.embedding(this.model),
      value: text,
      providerOptions: {
        openai: { dimensions: this.dimensions },
      },
    });

    return new Float32Array(embedding);
  }

  async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) {
      return [];
    }

    this.logger.debug(`Generating embeddings for ${texts.length} texts`);

    const { embeddings } = await embedMany({
      model: this.openai.embedding(this.model),
      values: texts,
      providerOptions: {
        openai: { dimensions: this.dimensions },
      },
    });

    return embeddings.map((e) => new Float32Array(e));
  }
}
