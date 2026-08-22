import type { ServicePluginContext } from "@brains/plugins";
import type {
  AtprotoBrainCardRecord,
  AtprotoBrainCardSkill,
} from "@brains/atproto-contracts";
import type { AtprotoConfig } from "./config";
import {
  anchorDidWebFromHostname,
  didWebFromHostname,
  didWebToHostname,
  isDidWeb,
} from "./did";

export type BrainCardRecord = AtprotoBrainCardRecord & {
  $type: "ai.rizom.brain.card";
};

function normalizePublicUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function configuredFederationDid(
  config: AtprotoConfig,
  runtimeRepoDid: string | undefined,
): string | undefined {
  if (config.repoDid) return config.repoDid;
  if (runtimeRepoDid) return runtimeRepoDid;
  return config.identifier?.startsWith("did:") ? config.identifier : undefined;
}

export async function buildBrainCardRecord(
  context: ServicePluginContext,
  config: AtprotoConfig,
  runtimeRepoDid?: string,
  now: Date = new Date(),
): Promise<BrainCardRecord> {
  const identity = context.identity.get();
  const profile = context.identity.getProfile();
  const profileSelection = context.profileKinds.getResolved();
  if (!profileSelection) {
    throw new Error(
      "AT Protocol brain card publishing requires a configured profile kind",
    );
  }
  const appInfo = await context.identity.getAppInfo();
  const hasWebChannel = context.plugins.has("webserver");
  const siteUrl = hasWebChannel
    ? normalizePublicUrl(context.siteUrl ?? profile.website)
    : undefined;
  const siteHostname = siteUrl ? new URL(siteUrl).hostname : undefined;
  const federationDid = configuredFederationDid(config, runtimeRepoDid);
  const brainDid =
    config.brainDid ??
    (siteHostname ? didWebFromHostname(siteHostname) : federationDid);
  if (!brainDid) {
    throw new Error(
      "AT Protocol headless brain card publishing requires a repo DID or explicit brain DID",
    );
  }
  const anchorDid =
    config.anchorDid ??
    (siteHostname
      ? anchorDidWebFromHostname(siteHostname)
      : (config.accountDid ?? federationDid));
  if (!anchorDid) {
    throw new Error(
      "AT Protocol headless brain card publishing requires an account, repo, or explicit anchor DID",
    );
  }

  if (isDidWeb(brainDid)) {
    if (!siteHostname) {
      throw new Error(
        "AT Protocol brain card did:web identity requires an active web channel",
      );
    }
    const didHostname = didWebToHostname(brainDid);
    if (didHostname !== siteHostname) {
      throw new Error(
        "AT Protocol brain card did:web host must match siteUrl host",
      );
    }
  }
  if (!siteUrl && federationDid && brainDid !== federationDid) {
    throw new Error(
      "AT Protocol headless brain card brain DID must match its PDS repo DID",
    );
  }

  const skills: AtprotoBrainCardSkill[] = (
    await context.publicSkills.list()
  ).map((skill) => ({ ...skill }));

  return {
    $type: "ai.rizom.brain.card",
    ...(siteUrl && { siteUrl }),
    brain: {
      did: brainDid,
      name: identity.name,
      role: identity.role,
      purpose: identity.purpose,
      values: identity.values,
    },
    anchor: {
      did: anchorDid,
      name: profile.name,
      category: profileSelection.category,
      kind: profileSelection.kind,
    },
    skills,
    model: appInfo.model,
    version: appInfo.version,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
