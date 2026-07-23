import { createHash } from "node:crypto";
import type {
  AnchorProfileKind,
  BaseEntity,
  BrainCharacter,
  IEntityService,
} from "@brains/plugins";
import {
  brainCharacterBodySchema,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

const rawFrontmatterSchema = z.record(z.string(), z.unknown());

export const STARTER_ALIAS_REGISTER = {
  first: [
    "Arcane",
    "Astonishing",
    "Bold",
    "Cosmic",
    "Daring",
    "Deep",
    "Dynamic",
    "Electric",
    "Endless",
    "Fearless",
    "Hidden",
    "Infinite",
    "Keen",
    "Lucky",
    "Midnight",
    "Mighty",
    "Mystic",
    "Noble",
    "Phantom",
    "Profound",
    "Quiet",
    "Radiant",
    "Silent",
    "Solar",
    "Sonic",
    "Supreme",
    "Swift",
    "Thunderous",
    "Uncommon",
    "Vivid",
  ],
  second: [
    "Architect",
    "Cipher",
    "Diplomat",
    "Dreamer",
    "Explorer",
    "Genius",
    "Guide",
    "Herald",
    "Inventor",
    "Luminary",
    "Magician",
    "Mastermind",
    "Navigator",
    "Observer",
    "Operator",
    "Oracle",
    "Pioneer",
    "Sage",
    "Scholar",
    "Scribe",
    "Seeker",
    "Specialist",
    "Strategist",
    "Thinker",
    "Voyager",
    "Watcher",
    "Weaver",
    "Wizard",
  ],
} as const;

const LEGACY_BRAIN_CHARACTER_FINGERPRINTS = [
  {
    id: "brain-v2",
    character: {
      name: "Brain",
      role: "Knowledge assistant",
      purpose:
        "Help organize, understand, and retrieve information from your knowledge base",
      values: ["clarity", "accuracy", "helpfulness"],
    },
  },
  {
    id: "personal-brain-v1",
    character: {
      name: "Personal Brain",
      role: "Personal knowledge assistant",
      purpose:
        "Help organize, understand, and retrieve information from your personal knowledge base",
      values: ["clarity", "accuracy", "helpfulness"],
    },
  },
] as const satisfies readonly {
  id: string;
  character: BrainCharacter;
}[];

const LEGACY_ANCHOR_PROFILE_FINGERPRINTS = [
  {
    id: "unknown-person-v1",
    name: "Unknown",
    kind: "person",
  },
] as const;

export interface StarterIdentitySource {
  domain?: string | undefined;
  didWeb?: string | undefined;
}

export interface StarterIdentity {
  name: string;
  anchorKind: AnchorProfileKind;
}

export interface StarterCharacterGenerationRequest {
  starterName: string;
  anchorKind: AnchorProfileKind;
  anchorEntity: BaseEntity | null;
  anchorIsAuthored: boolean;
}

export interface StarterIdentityMigrationResult {
  brainCharacter: "created" | "migrated" | "unchanged";
  anchorProfile: "created" | "migrated" | "unchanged";
  starterName: string;
}

function normalizeDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  let host: string;
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//u.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    host = url.host;
  } catch {
    return null;
  }

  const normalized = host.replace(/\.$/u, "");
  return normalized || null;
}

function domainFromDidWeb(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized.startsWith("did:web:")) return null;
  const parts = normalized.slice("did:web:".length).split(":");
  if (parts.length !== 1 || !parts[0]) return null;
  try {
    return normalizeDomain(decodeURIComponent(parts[0]));
  } catch {
    return null;
  }
}

/** Resolve the canonical brain-domain derivation key. */
export function resolveStarterIdentityIdentifier(
  source: StarterIdentitySource,
): string | null {
  const domain = source.domain
    ? normalizeDomain(source.domain)
    : source.didWeb
      ? domainFromDidWeb(source.didWeb)
      : null;
  return domain ? `domain:${domain}` : null;
}

function digestIdentifier(identifier: string): Buffer {
  return createHash("sha256").update(identifier).digest();
}

function select<T>(values: readonly T[], digest: Buffer, offset: number): T {
  const byte = digest[offset] ?? 0;
  const value = values[byte % values.length];
  if (value === undefined)
    throw new Error("Starter identity register is empty");
  return value;
}

export function deriveStarterIdentity(
  identifier: string,
  anchorKind: AnchorProfileKind,
): StarterIdentity {
  const digest = digestIdentifier(`starter-alias:v1:${identifier}`);
  const name = `${select(STARTER_ALIAS_REGISTER.first, digest, 0)} ${select(STARTER_ALIAS_REGISTER.second, digest, 1)}`;
  return { name, anchorKind };
}

function parseRawContent(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} | null {
  try {
    const parsed = parseMarkdownWithFrontmatter(content, rawFrontmatterSchema);
    return { metadata: parsed.metadata, body: parsed.content.trim() };
  } catch {
    return null;
  }
}

function hasExactKeys(
  metadata: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(metadata).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

export function isLegacyBrainCharacterContent(content: string): boolean {
  const parsed = parseRawContent(content);
  if (
    !parsed ||
    parsed.body ||
    !hasExactKeys(parsed.metadata, ["name", "role", "purpose", "values"])
  ) {
    return false;
  }

  const character = brainCharacterBodySchema.safeParse(parsed.metadata);
  if (!character.success) return false;

  return LEGACY_BRAIN_CHARACTER_FINGERPRINTS.some(({ character: legacy }) =>
    Boolean(
      character.data.name === legacy.name &&
      character.data.role === legacy.role &&
      character.data.purpose === legacy.purpose &&
      character.data.values.length === legacy.values.length &&
      character.data.values.every(
        (value, index) => value === legacy.values[index],
      ),
    ),
  );
}

export function isLegacyAnchorProfileContent(content: string): boolean {
  const parsed = parseRawContent(content);
  if (!parsed || parsed.body) return false;
  if (!hasExactKeys(parsed.metadata, ["name", "kind"])) return false;

  return LEGACY_ANCHOR_PROFILE_FINGERPRINTS.some(
    (fingerprint) =>
      parsed.metadata["name"] === fingerprint.name &&
      parsed.metadata["kind"] === fingerprint.kind,
  );
}

function readAnchorKind(
  entity: BaseEntity | null,
  fallback: AnchorProfileKind,
): AnchorProfileKind {
  if (!entity) return fallback;
  const parsed = parseRawContent(entity.content);
  const kind = parsed?.metadata["kind"];
  if (kind === "person" || kind === "team" || kind === "organization") {
    return kind;
  }
  return fallback;
}

function readBrainName(entity: BaseEntity | null): string | null {
  if (!entity) return null;
  const parsed = parseRawContent(entity.content);
  const name = parsed?.metadata["name"];
  return typeof name === "string" && name.trim() ? name : null;
}

export function createStarterBrainCharacterContent(
  character: BrainCharacter,
): string {
  return generateMarkdownWithFrontmatter("", character);
}

export function createStarterAnchorProfileContent(
  starterName: string,
  anchorKind: AnchorProfileKind,
): string {
  return generateMarkdownWithFrontmatter(
    `This brain picked **${starterName}** as its starter name. Replace this placeholder with the ${anchorKind} identity the brain represents.`,
    {
      name: `Anchor for ${starterName}`,
      kind: anchorKind,
      description: `Starter ${anchorKind} anchor profile; configuration is still needed.`,
      intro:
        "This is a generated placeholder, not an invented real-world identity.",
    },
  );
}

async function persistIdentityEntity(
  entityService: IEntityService,
  existing: BaseEntity | null,
  entityType: "brain-character" | "anchor-profile",
  content: string,
): Promise<"created" | "migrated"> {
  if (existing) {
    await entityService.updateEntity({
      entity: { ...existing, content },
    });
    return "migrated";
  }

  await entityService.createEntity({
    entity: {
      id: entityType,
      entityType,
      content,
      metadata: {},
    },
  });
  return "created";
}

export async function seedOrMigrateStarterIdentity(options: {
  entityService: IEntityService;
  identifier: string;
  defaultAnchorKind: AnchorProfileKind;
  generateBrainCharacter: (
    request: StarterCharacterGenerationRequest,
  ) => Promise<Omit<BrainCharacter, "name">>;
  logger?: Logger | undefined;
}): Promise<StarterIdentityMigrationResult> {
  const {
    entityService,
    identifier,
    defaultAnchorKind,
    generateBrainCharacter,
    logger,
  } = options;
  const [brainEntity, anchorEntity] = await Promise.all([
    entityService.getEntity({
      entityType: "brain-character",
      id: "brain-character",
    }),
    entityService.getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
    }),
  ]);

  const anchorKind = readAnchorKind(anchorEntity, defaultAnchorKind);
  const starter = deriveStarterIdentity(identifier, anchorKind);
  const brainNeedsGeneration =
    !brainEntity || isLegacyBrainCharacterContent(brainEntity.content);
  const anchorIsAuthored = Boolean(
    anchorEntity && !isLegacyAnchorProfileContent(anchorEntity.content),
  );

  let generatedCharacter: BrainCharacter | null = null;
  if (brainNeedsGeneration) {
    const generated = await generateBrainCharacter({
      starterName: starter.name,
      anchorKind,
      anchorEntity,
      anchorIsAuthored,
    });
    generatedCharacter = { name: starter.name, ...generated };
    brainCharacterBodySchema.parse(generatedCharacter);
  }

  let brainCharacter: StarterIdentityMigrationResult["brainCharacter"] =
    "unchanged";
  if (generatedCharacter) {
    brainCharacter = await persistIdentityEntity(
      entityService,
      brainEntity,
      "brain-character",
      createStarterBrainCharacterContent(generatedCharacter),
    );
  }

  const representedBrainName = generatedCharacter
    ? generatedCharacter.name
    : (readBrainName(brainEntity) ?? starter.name);

  let anchorProfile: StarterIdentityMigrationResult["anchorProfile"] =
    "unchanged";
  if (!anchorEntity || isLegacyAnchorProfileContent(anchorEntity.content)) {
    anchorProfile = await persistIdentityEntity(
      entityService,
      anchorEntity,
      "anchor-profile",
      createStarterAnchorProfileContent(representedBrainName, anchorKind),
    );
  }

  const result = {
    brainCharacter,
    anchorProfile,
    starterName: starter.name,
  } satisfies StarterIdentityMigrationResult;

  if (brainCharacter !== "unchanged" || anchorProfile !== "unchanged") {
    logger?.info("Seeded or migrated starter identity", result);
  }

  return result;
}
