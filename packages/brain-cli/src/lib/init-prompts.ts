import * as p from "@clack/prompts";
import {
  EMBEDDING_PROVIDER,
  KEY_PROVIDER_IDS,
  KEY_PROVIDERS,
  providerKeyError,
  type KeyProviderId,
} from "@brains/ai-service/provider-keys";
import type { ScaffoldOptions } from "../commands/init";

/**
 * Whether the current process can prompt the user.
 *
 * Non-TTY environments (CI, piped stdin/stdout, called from a subprocess)
 * cannot show interactive prompts and must use defaults / flags only.
 */
export function isInteractive(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

/**
 * Walk the user through the questions needed to scaffold a runnable brain.
 *
 * Each question is skipped when the corresponding flag was already supplied,
 * so `brain init mybrain --ai-api-key=sk-... --content-repo=user/data` runs
 * end-to-end without any prompts even in interactive mode.
 *
 * Cancellation (Ctrl+C) at any prompt exits the process cleanly via clack's
 * `isCancel` check.
 */
export async function promptInitOptions(
  initial: ScaffoldOptions,
  targetDir: string,
): Promise<ScaffoldOptions> {
  p.intro(`Setting up brain in ${targetDir}`);

  const result: ScaffoldOptions = { ...initial };

  // 1. AI models and provider keys — written to brain.yaml and .env so the
  //    brain can boot. One key per distinct provider.
  if (!result.apiKey && !result.apiKeys) {
    Object.assign(result, await promptAIProviders());
  }

  // 2. Content git repo — optional, controls whether brain.yaml's git block
  //    is uncommented and which repo it points at
  if (!result.contentRepo) {
    const enableGit = await p.confirm({
      message: "Sync brain content to a git repository?",
      initialValue: false,
    });

    if (p.isCancel(enableGit)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (enableGit) {
      const repo = await p.text({
        message: "Git repo (e.g. user/brain-data)",
        placeholder: "user/brain-data",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Repo name is required when git sync is enabled.";
          }
          if (!/^[\w.-]+\/[\w.-]+$/.test(value.trim())) {
            return "Use the format owner/name (e.g. user/brain-data).";
          }
          return undefined;
        },
      });

      if (p.isCancel(repo)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      result.contentRepo = repo.trim();
    }
  }

  // Secret backend defaults to "none" (env-vars-only resolution via
  // varlock). Operators who want a varlock plugin pass --backend <name>
  // explicitly; no interactive prompt because the default Just Works
  // and exposing the choice up front adds friction for the common path.

  p.outro("Ready to scaffold.");

  return result;
}

/** The definition's default chat and image models are this provider's. */
const DEFAULT_PROVIDER: KeyProviderId = "openai";
/** Providers that generate images. */
const IMAGE_PROVIDERS: readonly KeyProviderId[] = ["openai", "google"];
/** Example models, shown when a provider other than the default is picked. */
const MODEL_EXAMPLES: Partial<
  Record<KeyProviderId, { chat?: string; image?: string }>
> = {
  anthropic: { chat: "claude-sonnet-5-5" },
  google: { chat: "gemini-…", image: "gemini-3-pro-image-preview" },
};

function unwrap<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value;
}

async function promptModel(
  message: string,
  placeholder: string,
): Promise<string> {
  return unwrap(
    await p.text({
      message,
      placeholder,
      validate: (value) =>
        value && value.trim().length > 0 ? undefined : "A model is required.",
    }),
  ).trim();
}

/**
 * Pick a provider per capability, then ask once per distinct provider for
 * its key. A brain on the default provider for everything needs one key.
 */
async function promptAIProviders(): Promise<
  Pick<ScaffoldOptions, "apiKeys" | "model" | "imageModel">
> {
  const defaultLabel = KEY_PROVIDERS[DEFAULT_PROVIDER].label;
  const oneProvider = unwrap(
    await p.confirm({
      message: `Use ${defaultLabel} for chat, embeddings and images (one API key)?`,
      initialValue: true,
    }),
  );

  let chat = DEFAULT_PROVIDER;
  let image = DEFAULT_PROVIDER;
  let model: string | undefined;
  let imageModel: string | undefined;

  if (!oneProvider) {
    chat = await selectProvider("Chat provider", KEY_PROVIDER_IDS);
    if (chat !== DEFAULT_PROVIDER) {
      model = await promptModel(
        `${KEY_PROVIDERS[chat].label} chat model`,
        MODEL_EXAMPLES[chat]?.chat ?? "",
      );
    }

    image = await selectProvider("Image provider", IMAGE_PROVIDERS);
    if (image !== DEFAULT_PROVIDER) {
      imageModel = await promptModel(
        `${KEY_PROVIDERS[image].label} image model`,
        MODEL_EXAMPLES[image]?.image ?? "",
      );
    }

    p.note(`Embeddings use ${KEY_PROVIDERS[EMBEDDING_PROVIDER].label}.`);
  }

  const apiKeys: Record<string, string> = {};
  for (const provider of new Set([chat, EMBEDDING_PROVIDER, image])) {
    const { label, envVar } = KEY_PROVIDERS[provider];
    apiKeys[envVar] = unwrap(
      await p.password({
        message: `${label} API key`,
        validate: (value) =>
          value?.trim()
            ? providerKeyError(provider, value.trim())
            : `An API key for ${label} is required to boot the brain.`,
      }),
    ).trim();
  }

  return {
    apiKeys,
    ...(model ? { model } : {}),
    ...(imageModel ? { imageModel } : {}),
  };
}

async function selectProvider(
  message: string,
  providers: readonly KeyProviderId[],
): Promise<KeyProviderId> {
  return unwrap(
    await p.select<KeyProviderId>({
      message,
      options: providers.map((id) => ({
        value: id,
        label: KEY_PROVIDERS[id].label,
      })),
    }),
  );
}
