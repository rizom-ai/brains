import {
  checkModels,
  createProviderClients,
  DEFAULT_EMBEDDING_MODEL,
  isKeyProviderId,
  KEY_PROVIDER_IDS,
  keyEnvVar,
  keyMismatchWarning,
  readProviderKeys,
  resolveTextProvider,
  findEmbeddingProfile,
  selectImageProvider,
  type ModelProblem,
} from "@brains/ai-service";

interface PreflightResult {
  ok: boolean;
  message?: string;
}

const MIN_BUN_VERSION = "1.3.3";

/** The models brain.yaml names; the definition's chat model when it names none. */
export interface ConfiguredModels {
  model?: string | undefined;
  embeddingModel?: string | undefined;
  answerModel?: string | undefined;
  visionModel?: string | undefined;
  imageModel?: string | undefined;
  /** False when brain.yaml turns semantic indexing off. */
  embeddingEnabled?: boolean | undefined;
  /** The model runtime serving `local:` models. */
  modelRuntimeUrl?: string | undefined;
}

export interface ModelKeyCheck extends PreflightResult {
  /** Problems that leave the brain booting without a capability. */
  warnings: string[];
}

/** The provider a problem's model runs on, to name the variable to set. */
function providerOf(problem: ModelProblem): string {
  if (problem.role === "imageModel") {
    return selectImageProvider(problem.model).provider;
  }
  if (problem.role === "embeddingModel") {
    return findEmbeddingProfile(problem.model)?.provider ?? "";
  }
  return resolveTextProvider(problem.model).provider;
}

/**
 * Check that every model the brain runs has its provider: the provider's own
 * key, or the model runtime for `local:` models. The image model only warns,
 * since a brain without it boots without image generation.
 */
export function checkModelKeys(
  env: Record<string, string | undefined>,
  models: ConfiguredModels,
): ModelKeyCheck {
  const providerKeys = readProviderKeys(env);
  const clients = createProviderClients({
    providerKeys,
    modelRuntimeUrl: models.modelRuntimeUrl,
  });
  const problems = checkModels(clients, {
    model: models.model,
    answerModel: models.answerModel,
    visionModel: models.visionModel,
    imageModel: models.imageModel,
    embeddingModel:
      models.embeddingEnabled === false
        ? undefined
        : (models.embeddingModel ?? DEFAULT_EMBEDDING_MODEL),
  });

  const keyWarnings = KEY_PROVIDER_IDS.flatMap((provider) => {
    const key = providerKeys[provider];
    const warning = key ? keyMismatchWarning(provider, key) : undefined;
    return warning ? [warning] : [];
  });
  const imageWarnings = problems
    .filter((problem) => problem.role === "imageModel")
    .map((problem) => `Image generation is off: ${problem.message}`);
  const warnings = [...keyWarnings, ...imageWarnings];

  const blocking = problems.filter((problem) => problem.role !== "imageModel");
  if (blocking.length === 0) return { ok: true, warnings };

  const missingVars = [
    ...new Set(
      blocking
        .map(providerOf)
        .filter(isKeyProviderId)
        .map((provider) => keyEnvVar(provider)),
    ),
  ];
  const lines = blocking.map((problem) => `  ${problem.message}`);
  const fix =
    missingVars.length > 0
      ? `\n\nAdd to your .env file:\n\n${missingVars.map((name) => `  ${name}=your-api-key-here`).join("\n")}\n`
      : "";
  return {
    ok: false,
    message: `The brain's models cannot run:\n${lines.join("\n")}${fix}`,
    warnings,
  };
}

/**
 * Check that Bun version meets minimum requirement.
 */
export function checkBunVersion(version: string): PreflightResult {
  const [major, minor, patch] = version.split(".").map(Number);
  const [minMajor, minMinor, minPatch] = MIN_BUN_VERSION.split(".").map(Number);

  const current = (major ?? 0) * 10000 + (minor ?? 0) * 100 + (patch ?? 0);
  const minimum =
    (minMajor ?? 0) * 10000 + (minMinor ?? 0) * 100 + (minPatch ?? 0);

  if (current < minimum) {
    return {
      ok: false,
      message: `Bun ${MIN_BUN_VERSION} or later is required (found ${version}). Update: curl -fsSL https://bun.sh/install | bash`,
    };
  }
  return { ok: true };
}
