import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import type { Logger } from "@brains/utils/logger";
import type {
  IEmbeddingService,
  EmbeddingIdentity,
  EmbeddingResult,
  BatchEmbeddingResult,
} from "@brains/entity-service";
import type { EmbeddingUsageRecorder } from "./embedding-usage-meter";
import {
  DEFAULT_EMBEDDING_MODEL,
  resolveEmbeddingProfile,
  type EmbeddingProfile,
} from "./embedding-profiles";

export interface OnlineEmbeddingConfig {
  apiKey: string;
  /** The embedding model to index with; text-embedding-3-small by default. */
  profile?: EmbeddingProfile;
  logger: Logger;
  /** Told what each call used, so a guest turn is charged for its embeddings. */
  usage?: EmbeddingUsageRecorder;
  /** The HTTP client to reach OpenAI with; the platform's by default. */
  fetch?: typeof fetch;
}

// A profile's limits are in tokens. A byte-level tokenizer never produces
// more tokens than a text has UTF-8 bytes, so input measured in bytes always
// fits.
// Coarsest first, so chunks keep paragraphs, then lines, then words whole.
const SEPARATORS = ["\n\n", "\n", " "];

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Greedily join pieces with a separator into chunks of at most max bytes. */
function pack(pieces: string[], separator: string, max: number): string[] {
  const separatorBytes = byteLength(separator);
  return pieces.reduce<{ chunks: string[]; bytes: number }>(
    (state, piece) => {
      const last = state.chunks.at(-1);
      const bytes = byteLength(piece);
      if (last !== undefined && state.bytes + separatorBytes + bytes <= max) {
        state.chunks[state.chunks.length - 1] = last + separator + piece;
        return {
          chunks: state.chunks,
          bytes: state.bytes + separatorBytes + bytes,
        };
      }
      state.chunks.push(piece);
      return { chunks: state.chunks, bytes };
    },
    { chunks: [], bytes: 0 },
  ).chunks;
}

/**
 * Split text into chunks of at most max UTF-8 bytes, at the coarsest
 * boundary that fits and never inside a character. Text that fits is
 * returned whole.
 */
function splitForEmbedding(
  text: string,
  max: number,
  separators: string[] = SEPARATORS,
): string[] {
  if (byteLength(text) <= max) return [text];
  const [separator, ...finer] = separators;
  if (separator === undefined) return pack(Array.from(text), "", max);
  const parts = text.split(separator);
  if (parts.length === 1) return splitForEmbedding(text, max, finer);
  return pack(
    parts.flatMap((part) => splitForEmbedding(part, max, finer)),
    separator,
    max,
  );
}

/** Group chunks into requests within the model's per-request limits. */
function groupRequests(
  chunks: string[],
  profile: EmbeddingProfile,
): string[][] {
  return chunks.reduce<{ groups: string[][]; bytes: number }>(
    (state, chunk) => {
      const group = state.groups.at(-1);
      const bytes = byteLength(chunk);
      if (
        group !== undefined &&
        group.length < profile.maxRequestInputs &&
        state.bytes + bytes <= profile.maxRequestTokens
      ) {
        group.push(chunk);
        return { groups: state.groups, bytes: state.bytes + bytes };
      }
      state.groups.push([chunk]);
      return { groups: state.groups, bytes };
    },
    { groups: [], bytes: 0 },
  ).groups;
}

/** One vector for a text from its chunks': length-weighted, unit length. */
function combine(chunks: string[], vectors: number[][]): Float32Array {
  const [only] = vectors;
  if (vectors.length === 1 && only) return new Float32Array(only);
  const sum = vectors.reduce<number[]>(
    (total, vector, index) =>
      vector.map(
        (value, dimension) =>
          (total[dimension] ?? 0) + value * byteLength(chunks[index] ?? ""),
      ),
    [],
  );
  const norm = Math.hypot(...sum);
  return new Float32Array(sum.map((value) => value / norm));
}

/**
 * Embedding provider that uses the OpenAI embeddings API.
 * Uses the OpenAI embeddings API for vector generation.
 */
export class OnlineEmbeddingProvider implements IEmbeddingService {
  public readonly identity: EmbeddingIdentity;
  private readonly profile: EmbeddingProfile;
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

    this.profile =
      config.profile ?? resolveEmbeddingProfile(DEFAULT_EMBEDDING_MODEL);
    this.identity = {
      model: this.profile.model,
      dimensions: this.profile.dimensions,
      promptRevision: this.profile.promptRevision,
    };
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
    const {
      embeddings: [embedding],
      usage,
    } = await this.generateEmbeddings([text], signal);
    if (!embedding) throw new Error("Embedding provider returned no vector");
    return { embedding, usage };
  }

  /**
   * One vector per text. A text over the model's input limit is embedded in
   * chunks whose vectors are combined, so no part of it is left out.
   */
  async generateEmbeddings(
    texts: string[],
    signal?: AbortSignal,
  ): Promise<BatchEmbeddingResult> {
    const scopedSignal = this.usage?.currentSignal();
    if (scopedSignal)
      signal = signal ? AbortSignal.any([signal, scopedSignal]) : scopedSignal;
    signal?.throwIfAborted();
    if (texts.length === 0) {
      return { embeddings: [], usage: { tokens: 0 } };
    }

    const chunked = texts.map((text) =>
      splitForEmbedding(text, this.profile.maxInputTokens),
    );
    const chunks = chunked.flat();
    if (chunks.length > texts.length) {
      this.logger.debug(
        `Embedding ${texts.length} texts in ${chunks.length} chunks`,
      );
    } else {
      this.logger.debug(`Generating embeddings for ${texts.length} texts`);
    }

    const results = await groupRequests(chunks, this.profile).reduce<
      Promise<{ vectors: number[][]; tokens: number }>
    >(
      async (previous, values) => {
        const done = await previous;
        const measurement = this.usage?.begin(this.profile.model);
        const { embeddings, usage } = await embedMany({
          model: this.openai.embedding(this.profile.modelId),
          values,
          ...(measurement ? { maxRetries: 0 } : {}),
          ...(signal ? { abortSignal: signal } : {}),
          providerOptions: {
            openai: { dimensions: this.profile.dimensions },
          },
        });
        // Preserve this request's usage even if a later group fails.
        measurement?.finish(usage.tokens);
        return {
          vectors: [...done.vectors, ...embeddings],
          tokens: done.tokens + usage.tokens,
        };
      },
      Promise.resolve({ vectors: [], tokens: 0 }),
    );

    const embeddings = chunked.reduce<{
      vectors: Float32Array[];
      next: number;
    }>(
      (state, textChunks) => ({
        vectors: [
          ...state.vectors,
          combine(
            textChunks,
            results.vectors.slice(state.next, state.next + textChunks.length),
          ),
        ],
        next: state.next + textChunks.length,
      }),
      { vectors: [], next: 0 },
    ).vectors;
    return { embeddings, usage: { tokens: results.tokens } };
  }
}
