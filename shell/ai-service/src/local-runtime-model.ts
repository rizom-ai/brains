import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type { LanguageModel } from "ai";
import { createImageDescriber } from "./image-description";
import { requiredToolChoice } from "./required-tool-choice";
import { textOnlyPrompt } from "./text-only-messages";

type RuntimeModel = Parameters<typeof wrapLanguageModel>[0]["model"];
type GenerateResult = Awaited<
  ReturnType<NonNullable<LanguageModelMiddleware["wrapGenerate"]>>
>;

/** How a model on the model runtime takes what the brain sends it. */
export interface LocalRuntimeOptions {
  /** The model reads images itself, as a vision model does. */
  readsImages?: boolean;
  /** Describes an uploaded image for a model that reads only text. */
  describeImagesWith?: LanguageModel | undefined;
  /** A tool result is answered without thinking: no other model writes answers. */
  answersWithoutThinking?: boolean;
}

/**
 * A model on the model runtime, with what the runtime does not do for it:
 * uploads reach a model that reads only text as text; a first step that
 * ends with no reply and no call, as a thinking model's does when it settles
 * on a call in its reasoning, is asked again for that call; a required call
 * is constrained to one, since the runtime ignores the tool choice; and a
 * tool result can be answered without thinking, which costs most of a turn
 * at ~20 tokens/s while tool choice is where thinking pays.
 */
export function withLocalRuntime(
  model: RuntimeModel,
  options: LocalRuntimeOptions,
): RuntimeModel {
  return wrapLanguageModel({
    model,
    middleware: [
      ...(options.readsImages ? [] : [textOnlyFiles(options)]),
      ...(options.answersWithoutThinking ? [answerWithoutThinking] : []),
      withoutStoredQuotes,
      callAfterSilence,
      requiredToolChoice,
    ],
  });
}

function textOnlyFiles(options: LocalRuntimeOptions): LanguageModelMiddleware {
  const describeImage =
    options.describeImagesWith &&
    createImageDescriber(options.describeImagesWith);
  return {
    specificationVersion: "v3",
    transformParams: async ({ params }) => ({
      ...params,
      prompt: await textOnlyPrompt(params.prompt, describeImage),
    }),
  };
}

const answerWithoutThinking: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // Only an effort the brain asked for is turned off: without one, the
  // runtime's default stands.
  transformParams: async ({ params }) =>
    params.prompt.at(-1)?.role === "tool" &&
    params.providerOptions?.["local"]?.["reasoningEffort"] !== undefined
      ? {
          ...params,
          providerOptions: {
            ...params.providerOptions,
            local: {
              ...params.providerOptions["local"],
              reasoningEffort: "none",
            },
          },
        }
      : params,
};

/** A step that ends with no reply and no call. */
function silent(result: GenerateResult): boolean {
  return result.content.every(
    (part) =>
      part.type === "reasoning" || (part.type === "text" && !part.text.trim()),
  );
}

/** The quote an update's reply gives of what it stored, with its tail. */
const STORED_QUOTE =
  /(^|\n)(?:Stored now:|No longer stored:)\n(?:> [^\n]*(?:\n|$))+(?:… and \d+ more changed lines\n?)?/g;

/**
 * An earlier reply's quote of what an update stored reaches a local model as
 * a pointer to storage: given the quote, it answered a later request to read
 * the entity from it, though the quote is partial and storage can change.
 */
const withoutStoredQuotes: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => ({
    ...params,
    prompt: params.prompt.map((message) =>
      message.role === "assistant"
        ? {
            ...message,
            content: message.content.map((part) =>
              part.type === "text"
                ? {
                    ...part,
                    text: part.text.replace(
                      STORED_QUOTE,
                      "$1(What was stored was shown to the user; read it from storage to quote it.)",
                    ),
                  }
                : part,
            ),
          }
        : message,
    ),
  }),
};

const callAfterSilence: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapGenerate: async ({ doGenerate, params, model }) => {
    const result = await doGenerate();
    const firstStep = params.prompt.at(-1)?.role === "user";
    const canCall =
      (params.tools?.length ?? 0) > 0 &&
      (params.toolChoice === undefined || params.toolChoice.type === "auto");
    if (!firstStep || !canCall || !silent(result)) return result;
    const retry = await model.doGenerate({
      ...params,
      toolChoice: { type: "required" },
    });
    const usage = addUsage(result.usage, retry.usage);
    // A retry that still makes no call keeps the silent step.
    return retry.content.some((part) => part.type === "tool-call")
      ? { ...retry, usage }
      : { ...result, usage };
  },
};

const sum = (a?: number, b?: number): number | undefined =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

function addUsage(
  a: GenerateResult["usage"],
  b: GenerateResult["usage"],
): GenerateResult["usage"] {
  return {
    inputTokens: {
      total: sum(a.inputTokens.total, b.inputTokens.total),
      noCache: sum(a.inputTokens.noCache, b.inputTokens.noCache),
      cacheRead: sum(a.inputTokens.cacheRead, b.inputTokens.cacheRead),
      cacheWrite: sum(a.inputTokens.cacheWrite, b.inputTokens.cacheWrite),
    },
    outputTokens: {
      total: sum(a.outputTokens.total, b.outputTokens.total),
      text: sum(a.outputTokens.text, b.outputTokens.text),
      reasoning: sum(a.outputTokens.reasoning, b.outputTokens.reasoning),
    },
  };
}
