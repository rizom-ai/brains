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

const PERSON_NAME_PARTS = {
  first: [
    "Amber",
    "Brisk",
    "Cinder",
    "Fable",
    "Moss",
    "Paper",
    "Quiet",
    "Signal",
    "Silver",
    "Woven",
  ],
  second: [
    "Badger",
    "Finch",
    "Kite",
    "Lynx",
    "Moth",
    "Otter",
    "Rook",
    "Tiger",
    "Wren",
  ],
} as const;

const TEAM_NAME_PARTS = {
  first: ["Common", "Field", "Open", "Signal", "Steady", "Woven"],
  second: ["Assembly", "Crew", "Guild", "Table", "Thread", "Workshop"],
} as const;

const ORGANIZATION_NAME_PARTS = {
  first: [
    "Northfield",
    "Plainview",
    "Redwood",
    "Signal",
    "Stonebridge",
    "Wayfinder",
  ],
  second: ["Foundation", "House", "Institute", "Office", "Works"],
} as const;

const STARTER_CHARACTERS = [
  {
    role: "Knowledge cartographer",
    purpose: "Map scattered knowledge into clear paths for useful work",
    values: ["curiosity", "context", "clarity"],
  },
  {
    role: "Research steward",
    purpose: "Keep important knowledge durable, grounded, and ready to use",
    values: ["care", "accuracy", "continuity"],
  },
  {
    role: "Pattern scout",
    purpose:
      "Notice meaningful connections and turn them into practical insight",
    values: ["attention", "synthesis", "usefulness"],
  },
  {
    role: "Editorial companion",
    purpose: "Shape rough knowledge into precise and expressive artifacts",
    values: ["craft", "clarity", "follow-through"],
  },
] as const satisfies readonly Omit<BrainCharacter, "name">[];

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
  did?: string | undefined;
  handle?: string | undefined;
  domain?: string | undefined;
}

export interface StarterIdentity {
  brainCharacter: BrainCharacter;
  anchorKind: AnchorProfileKind;
}

export interface StarterIdentityMigrationResult {
  brainCharacter: "created" | "migrated" | "unchanged";
  anchorProfile: "created" | "migrated" | "unchanged";
  starterName: string;
}

function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

/** Resolve the stable derivation key in DID → handle → domain order. */
export function resolveStarterIdentityIdentifier(
  source: StarterIdentitySource,
): string | null {
  const candidates = [
    ["did", source.did],
    ["handle", source.handle],
    ["domain", source.domain],
  ] as const;

  for (const [kind, value] of candidates) {
    if (!value?.trim()) continue;
    return `${kind}:${normalizeIdentifier(value)}`;
  }
  return null;
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

function getNameParts(kind: AnchorProfileKind): {
  first: readonly string[];
  second: readonly string[];
} {
  switch (kind) {
    case "person":
      return PERSON_NAME_PARTS;
    case "team":
      return TEAM_NAME_PARTS;
    case "organization":
      return ORGANIZATION_NAME_PARTS;
  }
}

export function deriveStarterIdentity(
  identifier: string,
  anchorKind: AnchorProfileKind,
): StarterIdentity {
  const digest = digestIdentifier(identifier);
  const nameParts = getNameParts(anchorKind);
  const name = `${select(nameParts.first, digest, 0)} ${select(nameParts.second, digest, 1)}`;
  const character = select(STARTER_CHARACTERS, digest, 2);

  return {
    anchorKind,
    brainCharacter: {
      name,
      role: character.role,
      purpose: character.purpose,
      values: [...character.values],
    },
  };
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
  identity: StarterIdentity,
): string {
  return generateMarkdownWithFrontmatter("", identity.brainCharacter);
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
  logger?: Logger | undefined;
}): Promise<StarterIdentityMigrationResult> {
  const { entityService, identifier, defaultAnchorKind, logger } = options;
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

  let brainCharacter: StarterIdentityMigrationResult["brainCharacter"] =
    "unchanged";
  if (!brainEntity || isLegacyBrainCharacterContent(brainEntity.content)) {
    brainCharacter = await persistIdentityEntity(
      entityService,
      brainEntity,
      "brain-character",
      createStarterBrainCharacterContent(starter),
    );
  }

  const representedBrainName =
    brainCharacter === "unchanged"
      ? (readBrainName(brainEntity) ?? starter.brainCharacter.name)
      : starter.brainCharacter.name;

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
    starterName: starter.brainCharacter.name,
  } satisfies StarterIdentityMigrationResult;

  if (brainCharacter !== "unchanged" || anchorProfile !== "unchanged") {
    logger?.info("Seeded or migrated deterministic starter identity", result);
  }

  return result;
}
