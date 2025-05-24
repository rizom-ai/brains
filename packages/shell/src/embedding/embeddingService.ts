import { EmbeddingModel, FlagEmbedding } from "fastembed";
import type { Logger } from "@personal-brain/utils";

/**
 * Interface for embedding service
 */
export interface IEmbeddingService {
  generateEmbedding(text: string): Promise<Float32Array>;
  generateEmbeddings(texts: string[]): Promise<Float32Array[]>;
}

/**
 * Local embedding service using FastEmbed
 * Implements embedding generation with various models
 */
export class EmbeddingService implements IEmbeddingService {
  private static instance: EmbeddingService | null = null;
  private model: FlagEmbedding | null = null;
  private initPromise: Promise<void> | null = null;
  private logger: Logger;

  // Model configuration - using all-MiniLM-L6-v2 for compatibility
  private static readonly MODEL_NAME = EmbeddingModel.AllMiniLML6V2;
  private static readonly EMBEDDING_DIM = 384;

  /**
   * Get the singleton instance
   */
  public static getInstance(logger: Logger): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService(logger);
    }
    return EmbeddingService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    if (EmbeddingService.instance) {
      EmbeddingService.instance.model = null;
      EmbeddingService.instance.initPromise = null;
    }
    EmbeddingService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(logger: Logger): EmbeddingService {
    return new EmbeddingService(logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Initialize the model (called once on first use)
   */
  private async initialize(): Promise<void> {
    // If already initializing, wait for that to complete
    if (this.initPromise) {
      return this.initPromise;
    }

    // If already initialized, return immediately
    if (this.model) {
      return;
    }

    // Start initialization
    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      this.logger.info(
        `Loading embedding model: ${EmbeddingService.MODEL_NAME}`,
      );

      // Create the embedding model
      this.model = await FlagEmbedding.init({
        model: EmbeddingService.MODEL_NAME,
        maxLength: 512,
        cacheDir: "node_modules/.cache/fastembed", // Cache in node_modules
        showDownloadProgress: false,
      });

      this.logger.info("Embedding model loaded successfully");
    } catch (error) {
      this.logger.error("Failed to load embedding model", error);
      throw new Error(`Failed to initialize embedding model: ${error}`);
    }
  }

  /**
   * Generate embedding for text
   * @param text The text to embed
   * @returns Float32Array of embeddings with 384 dimensions
   */
  public async generateEmbedding(text: string): Promise<Float32Array> {
    // Ensure model is initialized
    await this.initialize();

    if (!this.model) {
      throw new Error("Embedding model not initialized");
    }

    try {
      // Generate embedding - fastembed returns an async generator
      const embeddings = this.model.embed([text]);

      // Get the first (and only) batch
      for await (const batch of embeddings) {
        // Get the first embedding from the batch
        const embedding = batch[0];

        if (!embedding) {
          throw new Error("No embedding generated for text");
        }

        // Validate dimensions
        if (embedding.length !== EmbeddingService.EMBEDDING_DIM) {
          throw new Error(
            `Invalid embedding dimensions: expected ${EmbeddingService.EMBEDDING_DIM}, got ${embedding.length}`,
          );
        }

        // Convert to Float32Array
        return new Float32Array(embedding);
      }

      // Should never reach here
      throw new Error("No embedding generated");
    } catch (error) {
      this.logger.error("Failed to generate embedding", error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * @param texts Array of texts to embed
   * @returns Array of Float32Arrays
   */
  public async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    // Ensure model is initialized
    await this.initialize();

    if (!this.model) {
      throw new Error("Embedding model not initialized");
    }

    try {
      const embeddings: Float32Array[] = [];

      // FastEmbed supports batch processing
      const embeddingGenerator = this.model.embed(texts);

      for await (const batch of embeddingGenerator) {
        // Each batch contains multiple embeddings
        for (const embedding of batch) {
          embeddings.push(new Float32Array(embedding));
        }
      }

      return embeddings;
    } catch (error) {
      this.logger.error("Failed to generate embeddings", error);
      throw new Error(`Failed to generate embeddings: ${error}`);
    }
  }
}
