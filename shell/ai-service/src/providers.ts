/**
 * The providers a brain can call, and the key each one reads.
 *
 * Pure data — no SDK imports. The clients are built in `provider-clients.ts`,
 * which the AI SDK's provider registry resolves models against; what each
 * provider can serve (chat, images, embeddings) is the SDK's to say.
 */
import { z } from "@brains/utils/zod";

export type ProviderId = "anthropic" | "openai" | "google" | "local";

/** Providers that take an API key. */
export type KeyProviderId = Exclude<ProviderId, "local">;

/** The API key of each provider the brain has one for. */
export const providerKeysSchema: z.ZodObject<{
  anthropic: z.ZodOptional<z.ZodString>;
  openai: z.ZodOptional<z.ZodString>;
  google: z.ZodOptional<z.ZodString>;
}> = z.object({
  anthropic: z.string().min(1).optional(),
  openai: z.string().min(1).optional(),
  google: z.string().min(1).optional(),
});

export type ProviderKeys = z.output<typeof providerKeysSchema>;

export interface ProviderInfo {
  label: string;
  /** Env var holding the provider's key; absent for the model runtime. */
  keyEnvVar?: string;
  /**
   * The key format the provider issues, used only to tell people a key
   * looks like another provider's. Validity is the provider's to decide.
   */
  keyFormat?: RegExp;
}

export const PROVIDERS: Readonly<Record<ProviderId, ProviderInfo>> = {
  anthropic: {
    label: "Anthropic",
    keyEnvVar: "ANTHROPIC_API_KEY",
    keyFormat: /^sk-ant-/,
  },
  openai: {
    label: "OpenAI",
    keyEnvVar: "OPENAI_API_KEY",
    keyFormat: /^sk-(?:proj|svcacct|admin)-/,
  },
  google: {
    label: "Google",
    keyEnvVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    keyFormat: /^AIza/,
  },
  local: { label: "the model runtime" },
};

export const PROVIDER_IDS: readonly ProviderId[] = [
  "anthropic",
  "openai",
  "google",
  "local",
];

export const KEY_PROVIDER_IDS: readonly KeyProviderId[] = [
  "anthropic",
  "openai",
  "google",
];

export function isProviderId(id: string): id is ProviderId {
  return Object.hasOwn(PROVIDERS, id);
}

export function isKeyProviderId(id: string): id is KeyProviderId {
  return isProviderId(id) && PROVIDERS[id].keyEnvVar !== undefined;
}

/** The env var a key provider's key is read from. */
export function keyEnvVar(provider: KeyProviderId): string {
  const name = PROVIDERS[provider].keyEnvVar;
  if (!name) throw new Error(`${provider} takes no key`);
  return name;
}

/** Each provider's key from its own env var; a blank one is unset. */
export function readProviderKeys(
  env: Record<string, string | undefined>,
): ProviderKeys {
  return Object.fromEntries(
    KEY_PROVIDER_IDS.flatMap((provider) => {
      const value = env[keyEnvVar(provider)]?.trim();
      return value ? [[provider, value]] : [];
    }),
  );
}

/**
 * A warning when a provider's key is in another provider's format; none
 * for a key in its own format or in a format no provider is known by.
 */
export function keyMismatchWarning(
  provider: KeyProviderId,
  key: string,
): string | undefined {
  if (PROVIDERS[provider].keyFormat?.test(key)) return undefined;
  const owner = KEY_PROVIDER_IDS.find(
    (candidate) =>
      candidate !== provider && PROVIDERS[candidate].keyFormat?.test(key),
  );
  if (!owner) return undefined;
  const { label } = PROVIDERS[owner];
  const article = /^[AEIOU]/.test(label) ? "an" : "a";
  return `${keyEnvVar(provider)} looks like ${article} ${label} key.`;
}
