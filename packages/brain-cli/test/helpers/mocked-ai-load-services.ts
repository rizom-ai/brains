import type {
  AIGenerationSchema,
  AIModelConfig,
  AIModelConfigUpdate,
  IAIService,
  ImageGenerationOptions,
  ImageGenerationResult,
  JudgeInput,
  LanguageModel,
} from "@brains/ai-service";
import type {
  BatchEmbeddingResult,
  EmbeddingResult,
  IEmbeddingService,
} from "@brains/entity-service";
import { MockLanguageModelV3 } from "ai/test";

export const MOCK_LOAD_PROBE_MARKER = "Mocked AI feature-load probe";
export const MOCK_LOAD_UPDATE_MARKER = "Mocked AI feature-load update";

/** The shell config and the mock must agree, so both read these. */
export const MOCK_LOAD_MODEL = "openai:gpt-4o-mini";
export const MOCK_LOAD_API_KEY = "mocked-feature-load";

export interface MockLoadSnapshot {
  embeddingCalls: number;
  probeEmbeddingCalls: number;
  completedProbeEmbeddingCalls: number;
  updateEmbeddingCalls: number;
  completedUpdateEmbeddingCalls: number;
  maxConcurrentUpdateEmbeddingCalls: number;
  objectCalls: number;
  objectCallsByProjection: Record<string, number>;
  textCalls: number;
  activeCalls: number;
  maxConcurrentCalls: number;
}

type MockCallKind = "embedding" | "object" | "text";

export class MockLoadTracker {
  private embeddingCalls = 0;
  private probeEmbeddingCalls = 0;
  private completedProbeEmbeddingCalls = 0;
  private updateEmbeddingCalls = 0;
  private completedUpdateEmbeddingCalls = 0;
  private activeUpdateEmbeddingCalls = 0;
  private maxConcurrentUpdateEmbeddingCalls = 0;
  private objectCalls = 0;
  private readonly objectCallsByProjection = new Map<string, number>();
  private textCalls = 0;
  private activeCalls = 0;
  private maxConcurrentCalls = 0;

  begin(
    kind: MockCallKind,
    probe = false,
    update = false,
    projectionId?: string,
  ): () => void {
    if (kind === "embedding") {
      this.embeddingCalls++;
      if (probe) this.probeEmbeddingCalls++;
      if (update) {
        this.updateEmbeddingCalls++;
        this.activeUpdateEmbeddingCalls++;
        this.maxConcurrentUpdateEmbeddingCalls = Math.max(
          this.maxConcurrentUpdateEmbeddingCalls,
          this.activeUpdateEmbeddingCalls,
        );
      }
    }
    if (kind === "object") {
      this.objectCalls++;
      const attribution = projectionId ?? "unattributed";
      this.objectCallsByProjection.set(
        attribution,
        (this.objectCallsByProjection.get(attribution) ?? 0) + 1,
      );
    }
    if (kind === "text") this.textCalls++;
    this.activeCalls++;
    this.maxConcurrentCalls = Math.max(
      this.maxConcurrentCalls,
      this.activeCalls,
    );

    let finished = false;
    return (): void => {
      if (finished) return;
      finished = true;
      if (kind === "embedding" && probe) {
        this.completedProbeEmbeddingCalls++;
      }
      if (kind === "embedding" && update) {
        this.completedUpdateEmbeddingCalls++;
        this.activeUpdateEmbeddingCalls--;
      }
      this.activeCalls--;
    };
  }

  snapshot(): MockLoadSnapshot {
    return {
      embeddingCalls: this.embeddingCalls,
      probeEmbeddingCalls: this.probeEmbeddingCalls,
      completedProbeEmbeddingCalls: this.completedProbeEmbeddingCalls,
      updateEmbeddingCalls: this.updateEmbeddingCalls,
      completedUpdateEmbeddingCalls: this.completedUpdateEmbeddingCalls,
      maxConcurrentUpdateEmbeddingCalls: this.maxConcurrentUpdateEmbeddingCalls,
      objectCalls: this.objectCalls,
      objectCallsByProjection: Object.fromEntries(
        [...this.objectCallsByProjection].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      textCalls: this.textCalls,
      activeCalls: this.activeCalls,
      maxConcurrentCalls: this.maxConcurrentCalls,
    };
  }
}

interface MockLoadServiceOptions {
  delayMs: number;
  getProjectionId?: (() => string | undefined) | undefined;
}

interface MockLoadEmbeddingOptions extends MockLoadServiceOptions {
  dimensions: number;
}

const tokenUsage = {
  promptTokens: 1,
  completionTokens: 1,
  totalTokens: 2,
};

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (ms > 0) await Bun.sleep(ms);
  signal?.throwIfAborted();
}

export class MockLoadEmbeddingService implements IEmbeddingService {
  readonly dimensions: number;
  private readonly tracker: MockLoadTracker;
  private readonly delayMs: number;

  constructor(tracker: MockLoadTracker, options: MockLoadEmbeddingOptions) {
    this.tracker = tracker;
    this.delayMs = options.delayMs;
    this.dimensions = options.dimensions;
  }

  async generateEmbedding(
    text: string,
    signal?: AbortSignal,
  ): Promise<EmbeddingResult> {
    const finish = this.tracker.begin(
      "embedding",
      text.includes(MOCK_LOAD_PROBE_MARKER),
      text.includes(MOCK_LOAD_UPDATE_MARKER),
    );
    try {
      await delay(this.delayMs, signal);
      return {
        embedding: new Float32Array(this.dimensions).fill(0.01),
        usage: { tokens: 1 },
      };
    } finally {
      finish();
    }
  }

  async generateEmbeddings(
    texts: string[],
    signal?: AbortSignal,
  ): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], usage: { tokens: 0 } };
    }
    const embeddings: Float32Array[] = [];
    for (const text of texts) {
      const result = await this.generateEmbedding(text, signal);
      embeddings.push(result.embedding);
    }
    return { embeddings, usage: { tokens: texts.length } };
  }
}

export class MockLoadAIService implements IAIService {
  private readonly tracker: MockLoadTracker;
  private readonly delayMs: number;
  private readonly getProjectionId: () => string | undefined;
  private readonly model: LanguageModel;
  private config: AIModelConfig = {
    model: MOCK_LOAD_MODEL,
    apiKey: MOCK_LOAD_API_KEY,
  };

  constructor(tracker: MockLoadTracker, options: MockLoadServiceOptions) {
    this.tracker = tracker;
    this.delayMs = options.delayMs;
    this.getProjectionId =
      options.getProjectionId ?? ((): undefined => undefined);
    this.model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "{}" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      },
    });
  }

  async generateText(
    _systemPrompt: string,
    _userPrompt: string,
    signal?: AbortSignal,
  ): Promise<{ text: string; usage: typeof tokenUsage }> {
    const finish = this.tracker.begin("text");
    try {
      await delay(this.delayMs, signal);
      return { text: "mocked feature-load response", usage: tokenUsage };
    } finally {
      finish();
    }
  }

  async generateObject<T>(
    systemPrompt: string,
    _userPrompt: string,
    schema: AIGenerationSchema<T>,
    signal?: AbortSignal,
  ): Promise<{ object: T; usage: typeof tokenUsage }> {
    const finish = this.tracker.begin(
      "object",
      false,
      false,
      this.getProjectionId(),
    );
    try {
      await delay(this.delayMs, signal);
      const candidates: unknown[] = [
        { topics: [] },
        { skills: [] },
        {
          strengths: [],
          weaknesses: [],
          opportunities: [],
          threats: [],
        },
        {},
      ];
      const rejections: string[] = [];
      for (const candidate of candidates) {
        const parsed = schema.safeParse(candidate);
        if (parsed.success) {
          return { object: parsed.data, usage: tokenUsage };
        }
        rejections.push(
          `${JSON.stringify(candidate)} rejected: ${parsed.error.issues
            .map(
              (issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`,
            )
            .join("; ")}`,
        );
      }
      // Name the consumer and every rejection: the next caller to need a
      // richer shape has to know which candidate to add.
      throw new Error(
        [
          `No deterministic mocked object satisfies the schema for: ${systemPrompt}`,
          ...rejections,
        ].join("\n"),
      );
    } finally {
      finish();
    }
  }

  async judge<T>(input: JudgeInput<T>): Promise<{
    verdict: T;
    usage: typeof tokenUsage;
  }> {
    const generated = await this.generateObject(
      "mocked judge",
      `${input.instruction}\n\n${input.material}`,
      input.schema,
      input.signal,
    );
    return { verdict: generated.object, usage: generated.usage };
  }

  updateConfig(config: AIModelConfigUpdate): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AIModelConfig {
    return { ...this.config };
  }

  getModel(): LanguageModel {
    return this.model;
  }

  async generateImage(
    _prompt: string,
    _options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResult> {
    throw new Error("Image generation is not part of the mocked load fixture");
  }

  canGenerateImages(): boolean {
    return false;
  }
}
