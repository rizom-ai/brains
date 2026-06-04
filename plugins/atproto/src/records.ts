import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import type {
  AtprotoBrainCardRecord,
  AtprotoBrainCardSkill,
} from "@brains/atproto-contracts";
import type { AtprotoConfig } from "./config";

export type BrainCardRecord = AtprotoBrainCardRecord & {
  $type: "ai.rizom.brain.card";
};

function normalizePublicUrl(
  value: string | undefined,
  baseUrl: string | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function normalizeSkillId(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
  return normalized.length > 0 ? normalized : "skill";
}

function readString(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(
  metadata: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = metadata[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  return strings.length > 0 ? strings : undefined;
}

function skillFromEntity(
  entity: BaseEntity,
): AtprotoBrainCardSkill | undefined {
  const metadata = entity.metadata;
  const name = readString(metadata, "name");
  const description = readString(metadata, "description");
  if (!name || !description) return undefined;
  const tags = readStringArray(metadata, "tags");
  const examples = readStringArray(metadata, "examples");
  return {
    id: normalizeSkillId(name),
    name,
    description,
    ...(tags && { tags }),
    ...(examples && { examples }),
  };
}

async function listPublicSkills(
  context: ServicePluginContext,
): Promise<AtprotoBrainCardSkill[]> {
  if (!context.entityService.hasEntityType("skill")) return [];
  const entities = await context.entityService.listEntities({
    entityType: "skill",
    options: { filter: { visibilityScope: "public" } },
  });
  return entities
    .map((entity) => skillFromEntity(entity))
    .filter((skill): skill is AtprotoBrainCardSkill => skill !== undefined)
    .slice(0, 100);
}

export async function buildBrainCardRecord(
  context: ServicePluginContext,
  config: AtprotoConfig,
  now: Date = new Date(),
): Promise<BrainCardRecord> {
  if (!config.brainDid || !config.anchorDid) {
    throw new Error(
      "AT Protocol brain card publishing requires brainDid and anchorDid",
    );
  }

  const identity = context.identity.get();
  const profile = context.identity.getProfile();
  const appInfo = await context.identity.getAppInfo();
  const siteUrl = normalizePublicUrl(
    context.siteUrl ?? profile.website,
    undefined,
  );
  if (!siteUrl) {
    throw new Error("AT Protocol brain card publishing requires siteUrl");
  }

  const skills = await listPublicSkills(context);

  return {
    $type: "ai.rizom.brain.card",
    siteUrl,
    brain: {
      did: config.brainDid,
      name: identity.name,
      role: identity.role,
      purpose: identity.purpose,
      values: identity.values,
    },
    anchor: {
      did: config.anchorDid,
      name: profile.name,
      kind: profile.kind,
    },
    skills,
    model: appInfo.model,
    version: appInfo.version,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
