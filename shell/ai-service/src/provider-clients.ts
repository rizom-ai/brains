import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  createProviderRegistry,
  NoSuchModelError,
  NoSuchProviderError,
  type EmbeddingModel,
  type ImageModel,
  type LanguageModel,
} from "ai";
import {
  isProviderId,
  keyEnvVar,
  PROVIDER_IDS,
  PROVIDERS,
  type ProviderId,
  type ProviderKeys,
} from "./providers";
import {
  resolveTextProvider,
  selectImageProvider,
  type ResolvedModelProvider,
} from "./provider-selection";
import {
  findEmbeddingProfile,
  unsupportedEmbeddingModelMessage,
} from "./embedding-profiles";
import { getErrorMessage } from "@brains/utils/error";
import {
  withLocalRuntime,
  type LocalRuntimeOptions,
} from "./local-runtime-model";

/** What the brain can reach its providers with. */
export interface ProviderAccess {
  providerKeys?: ProviderKeys | undefined;
  /** The model runtime serving `local:` models. */
  modelRuntimeUrl?: string | undefined;
  fetch?: typeof fetch | undefined;
}

/** The AI SDK registry of every provider the brain can reach. */
export type ProviderClients = ReturnType<typeof createProviderRegistry>;

/** A provider the registry takes. */
type RegistryProvider = Parameters<typeof createProviderRegistry>[0][string];

type ProviderFactory = (access: ProviderAccess) => RegistryProvider | undefined;

const withFetch = (access: ProviderAccess): { fetch?: typeof fetch } =>
  access.fetch ? { fetch: access.fetch } : {};

/** Each provider's client, built only from its own key. */
const PROVIDER_FACTORIES: Readonly<Record<ProviderId, ProviderFactory>> = {
  anthropic: (access) => {
    const apiKey = access.providerKeys?.anthropic;
    return apiKey
      ? createAnthropic({ apiKey, ...withFetch(access) })
      : undefined;
  },
  openai: (access) => {
    const apiKey = access.providerKeys?.openai;
    return apiKey ? createOpenAI({ apiKey, ...withFetch(access) }) : undefined;
  },
  google: (access) => {
    const apiKey = access.providerKeys?.google;
    return apiKey
      ? createGoogleGenerativeAI({ apiKey, ...withFetch(access) })
      : undefined;
  },
  local: (access) =>
    access.modelRuntimeUrl
      ? createLocalRuntimeClient(access.modelRuntimeUrl, access.fetch)
      : undefined,
};

export function createProviderClients(access: ProviderAccess): ProviderClients {
  return createProviderRegistry(
    Object.fromEntries(
      PROVIDER_IDS.flatMap((id) => {
        const provider = PROVIDER_FACTORIES[id](access);
        return provider ? [[id, provider]] : [];
      }),
    ),
  );
}

/**
 * The model runtime's client: its OpenAI-compatible API at `modelRuntime.url`,
 * whatever server sits behind it.
 */
export function createLocalRuntimeClient(
  url: string,
  fetchImpl?: typeof fetch,
): ReturnType<typeof createOpenAICompatible> {
  return createOpenAICompatible({
    name: "local",
    baseURL: `${url.replace(/\/+$/, "")}/v1`,
    // Send the JSON schema of object generation, so the runtime constrains
    // the output to it rather than trusting the model to follow the prompt.
    supportsStructuredOutputs: true,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

type ModelKind = "languageModel" | "imageModel" | "embeddingModel";

const KIND_NAMES: Readonly<Record<ModelKind, string>> = {
  languageModel: "chat",
  imageModel: "image",
  embeddingModel: "embedding",
};

/** Why a provider cannot be reached, in the setting that fixes it. */
function missingProviderMessage(model: string, provider: string): string {
  if (!isProviderId(provider))
    return `${model}: unknown provider "${provider}"`;
  if (provider === "local") return `${model} needs modelRuntime.url`;
  return `${model} needs ${keyEnvVar(provider)}`;
}

/**
 * A model from the registry, with the registry's errors restated as the
 * configuration that fixes them.
 */
function resolveModel<T>(
  model: string,
  resolved: ResolvedModelProvider,
  kind: ModelKind,
  resolve: (id: `${string}:${string}`) => T,
): T {
  try {
    return resolve(`${resolved.provider}:${resolved.modelId}`);
  } catch (error) {
    if (NoSuchProviderError.isInstance(error)) {
      throw new Error(missingProviderMessage(model, resolved.provider), {
        cause: error,
      });
    }
    if (NoSuchModelError.isInstance(error) && isProviderId(resolved.provider)) {
      throw new Error(
        `${model}: ${PROVIDERS[resolved.provider].label} has no ${KIND_NAMES[kind]} models`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** `local` options apply to a model on the model runtime. */
export function getLanguageModel(
  clients: ProviderClients,
  model: string,
  local: LocalRuntimeOptions = {},
): LanguageModel {
  const resolved = resolveTextProvider(model);
  const languageModel = resolveModel(model, resolved, "languageModel", (id) =>
    clients.languageModel(id),
  );
  return resolved.provider === "local"
    ? withLocalRuntime(languageModel, local)
    : languageModel;
}

/** The image model, the default one when unset. */
export function getImageModel(
  clients: ProviderClients,
  imageModel: string | undefined,
): ImageModel {
  const resolved = selectImageProvider(imageModel);
  return resolveModel(
    imageModel ?? `${resolved.provider}:${resolved.modelId}`,
    resolved,
    "imageModel",
    (id) => clients.imageModel(id),
  );
}

/** An embedding model the brain supports, from its provider. */
export function getEmbeddingModel(
  clients: ProviderClients,
  embeddingModel: string,
): EmbeddingModel {
  const profile = findEmbeddingProfile(embeddingModel);
  if (!profile)
    throw new Error(unsupportedEmbeddingModelMessage(embeddingModel));
  return resolveModel(embeddingModel, profile, "embeddingModel", (id) =>
    clients.embeddingModel(id),
  );
}

/** Whether the image model's provider, the default one when unset, can run. */
export function canGenerateImages(
  clients: ProviderClients,
  imageModel: string | undefined,
): boolean {
  return problemOf(() => getImageModel(clients, imageModel)) === undefined;
}

/** The models a brain is configured with, by the setting naming each. */
export interface ModelSelection {
  model?: string | undefined;
  answerModel?: string | undefined;
  visionModel?: string | undefined;
  imageModel?: string | undefined;
  embeddingModel?: string | undefined;
}

export interface ModelProblem {
  role: keyof ModelSelection;
  model: string;
  message: string;
}

function problemOf(resolve: () => unknown): string | undefined {
  try {
    resolve();
    return undefined;
  } catch (error) {
    return getErrorMessage(error);
  }
}

/**
 * Why any configured model cannot run: its provider has no key or runtime,
 * is unknown, or serves no model of that kind. Building a model makes no
 * request, so the check runs before boot.
 */
export function checkModels(
  clients: ProviderClients,
  selection: ModelSelection,
): ModelProblem[] {
  const checks: Array<[keyof ModelSelection, (model: string) => unknown]> = [
    ["model", (model): unknown => getLanguageModel(clients, model)],
    ["answerModel", (model): unknown => getLanguageModel(clients, model)],
    ["visionModel", (model): unknown => getLanguageModel(clients, model)],
    ["imageModel", (model): unknown => getImageModel(clients, model)],
    ["embeddingModel", (model): unknown => getEmbeddingModel(clients, model)],
  ];
  return checks.flatMap(([role, check]) => {
    const model = selection[role];
    if (model === undefined) return [];
    const message = problemOf(() => check(model));
    return message === undefined ? [] : [{ role, model, message }];
  });
}
