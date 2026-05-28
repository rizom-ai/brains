import type { ServicePluginContext } from "@brains/plugins";
import type { AtprotoConfig } from "./config";

export interface BrainCardRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.card";
  name: string;
  description?: string;
  brainDid?: string;
  anchorDid?: string;
  siteUrl?: string;
  a2aEndpoint?: string;
  capabilities?: string[];
  createdAt: string;
  updatedAt?: string;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string => typeof value === "string" && value !== "",
      ),
    ),
  );
}

export async function buildBrainCardRecord(
  context: ServicePluginContext,
  config: AtprotoConfig,
  now: Date = new Date(),
): Promise<BrainCardRecord> {
  const identity = context.identity.get();
  const profile = context.identity.getProfile();
  const appInfo = await context.identity.getAppInfo();
  const siteUrl = context.siteUrl ?? profile.website;
  const a2aEndpoint = appInfo.endpoints.find(
    (endpoint) => endpoint.url === "/a2a" || endpoint.url.endsWith("/a2a"),
  )?.url;

  const capabilities = uniqueStrings([
    `model:${appInfo.model}`,
    ...identity.values.map((value) => `value:${value}`),
    ...appInfo.endpoints.map((endpoint) => `endpoint:${endpoint.label}`),
    ...appInfo.interactions.map(
      (interaction) => `interaction:${interaction.label}`,
    ),
  ]).slice(0, 100);

  const description = identity.purpose || profile.description;

  return {
    $type: "ai.rizom.brain.card",
    name: identity.name,
    ...(description && { description }),
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    ...(siteUrl && { siteUrl }),
    ...(a2aEndpoint && { a2aEndpoint }),
    ...(capabilities.length > 0 && { capabilities }),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
