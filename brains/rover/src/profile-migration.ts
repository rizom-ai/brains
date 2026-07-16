import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface CommunicationPreferenceMigrationResult {
  content: string;
  migratedFields: Array<"audience" | "tone">;
  changed: boolean;
}

const frontmatterSchema = z.record(z.string(), z.unknown());
const communicationPreferencesSchema = z.looseObject({
  audience: z.string().optional(),
  tone: z.string().optional(),
});

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Copy legacy profile communication defaults into brain character.
 * The profile source fields are intentionally left untouched.
 */
export function migrateLegacyCommunicationPreferences(
  profileContent: string,
  characterContent: string,
): CommunicationPreferenceMigrationResult {
  const profile = parseMarkdownWithFrontmatter(
    profileContent,
    frontmatterSchema,
  );
  const character = parseMarkdownWithFrontmatter(
    characterContent,
    frontmatterSchema,
  );
  const existingPreferences = character.metadata["communicationPreferences"];
  const parsedPreferences =
    communicationPreferencesSchema.safeParse(existingPreferences);
  if (existingPreferences !== undefined && !parsedPreferences.success) {
    return { content: characterContent, migratedFields: [], changed: false };
  }
  const preferences = parsedPreferences.success
    ? { ...parsedPreferences.data }
    : {};
  const migratedFields: Array<"audience" | "tone"> = [];

  const legacyAudience = nonEmptyString(profile.metadata["audience"]);
  if (!nonEmptyString(preferences.audience) && legacyAudience) {
    preferences.audience = legacyAudience;
    migratedFields.push("audience");
  }

  const legacyTone = nonEmptyString(profile.metadata["desiredTone"]);
  if (!nonEmptyString(preferences.tone) && legacyTone) {
    preferences.tone = legacyTone;
    migratedFields.push("tone");
  }

  if (migratedFields.length === 0) {
    return { content: characterContent, migratedFields, changed: false };
  }

  return {
    content: generateMarkdownWithFrontmatter(character.content, {
      ...character.metadata,
      communicationPreferences: preferences,
    }),
    migratedFields,
    changed: true,
  };
}
