import { isDeepStrictEqual } from "node:util";
import { isMap, isNode, isScalar, parseDocument } from "yaml";
import { expandBrainRecipe, type BrainRecipeExpansion } from "./brain-recipes";

export type LegacyBrainModel = "rover" | "relay" | "ranger";
type MigrationSourceModel = LegacyBrainModel | "brain";

export interface BrainConfigMigrationPreview {
  changed: boolean;
  output: string;
  source: {
    model: MigrationSourceModel;
    preset: string | undefined;
  };
}

interface MigrationTarget extends BrainRecipeExpansion {
  anchor: "person" | "team" | "organization";
  bundles: string[];
}

interface MigrationInput {
  [key: string]: unknown;
  brain?: unknown;
  preset?: unknown;
  bundles?: unknown;
  add?: unknown;
  remove?: unknown;
  site?: unknown;
  plugins?: unknown;
  anchor?: unknown;
}

const memberAliases: Readonly<Record<string, string>> = {
  "dashboard-root": "dashboard",
  "email-resend": "email",
  "rover-onboarding": "onboarding",
};

const roverDefaultRemovals = [
  "series",
  "portfolio",
  "content-pipeline",
  "social-media",
  "newsletter",
  "stock-photo",
];

function normalizeModel(value: unknown): MigrationSourceModel {
  if (typeof value !== "string") {
    throw new Error('brain.yaml must contain a string "brain" field');
  }

  const normalized = value.startsWith("@brains/")
    ? value.slice("@brains/".length)
    : value === "@rizom/brain" || value === "@rizom/brain/model"
      ? "brain"
      : value;
  if (
    normalized === "rover" ||
    normalized === "relay" ||
    normalized === "ranger" ||
    normalized === "brain"
  ) {
    return normalized;
  }

  throw new Error(`Unsupported legacy brain model "${value}"`);
}

function migrationTarget(
  model: LegacyBrainModel,
  preset: string,
): MigrationTarget {
  if (model === "rover") {
    if (preset === "core") {
      return {
        ...expandBrainRecipe("minimal"),
        anchor: "person",
        bundles: ["core"],
      };
    }
    if (preset === "default") {
      return {
        ...expandBrainRecipe("personal"),
        anchor: "person",
        bundles: ["core", "site", "publishing"],
        add: ["obsidian-vault"],
        remove: roverDefaultRemovals,
      };
    }
    if (preset === "full" || preset === "pro") {
      return {
        ...expandBrainRecipe("personal"),
        anchor: "person",
        bundles: ["core", "site", "publishing"],
        add: ["obsidian-vault"],
      };
    }
  }

  if (model === "relay") {
    if (preset === "core") {
      return {
        anchor: "team",
        bundles: ["core", "team"],
        plugins: {
          "directory-sync": { seedContentPath: "./seed-content" },
        },
      };
    }
    if (preset === "default" || preset === "full") {
      return {
        ...expandBrainRecipe("team"),
        anchor: "team",
        bundles: ["core", "site", "team"],
      };
    }
  }

  if (model === "ranger" && preset === "default") {
    return {
      ...expandBrainRecipe("commerce"),
      anchor: "organization",
      bundles: ["core", "site"],
    };
  }

  throw new Error(`Unsupported ${model} preset "${preset}"`);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function migrateMemberIds(values: unknown): string[] {
  if (values === undefined) return [];
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string")
  ) {
    throw new Error("add/remove values must be string arrays before migration");
  }
  return unique(values.map((value) => memberAliases[value] ?? value));
}

function mergeSelections(
  existing: unknown,
  additions: readonly string[] | undefined,
): string[] | undefined {
  const merged = unique([
    ...migrateMemberIds(existing),
    ...(additions ?? []).map((value) => memberAliases[value] ?? value),
  ]);
  return merged.length > 0 ? merged : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMigrationInput(value: unknown): value is MigrationInput {
  return isRecord(value);
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error(`${field} must be a mapping before migration`);
  }
  return { ...value };
}

function applyRecordDiff(
  document: ReturnType<typeof parseDocument>,
  path: readonly string[],
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): void {
  if (!before) {
    document.setIn(path, after);
    return;
  }

  for (const key of Object.keys(before)) {
    if (!(key in after)) document.deleteIn([...path, key]);
  }
  for (const [key, value] of Object.entries(after)) {
    const previous = before[key];
    if (isRecord(previous) && isRecord(value)) {
      applyRecordDiff(document, [...path, key], previous, value);
    } else if (!isDeepStrictEqual(previous, value)) {
      document.setIn([...path, key], value);
    }
  }
}

function mergePluginAliases(
  plugins: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...plugins };
  for (const [legacyId, canonicalId] of Object.entries(memberAliases)) {
    if (!(legacyId in next)) continue;
    if (
      canonicalId in next &&
      !isDeepStrictEqual(next[canonicalId], next[legacyId])
    ) {
      throw new Error(
        `Cannot migrate plugins.${legacyId}: plugins.${canonicalId} already has different config`,
      );
    }
    next[canonicalId] = next[canonicalId] ?? next[legacyId];
    delete next[legacyId];
  }
  return next;
}

function composePlugins(
  existing: unknown,
  target: MigrationTarget,
): Record<string, unknown> {
  const plugins = mergePluginAliases(asRecord(existing, "plugins"));
  const targetPlugins = target.plugins ?? {};

  for (const [id, value] of Object.entries(targetPlugins)) {
    plugins[id] = {
      ...asRecord(value, `recipe plugins.${id}`),
      ...asRecord(plugins[id], `plugins.${id}`),
    };
  }

  const directorySync = asRecord(
    plugins["directory-sync"],
    "plugins.directory-sync",
  );
  plugins["directory-sync"] = {
    seedContentPath: "./seed-content",
    ...directorySync,
  };

  return plugins;
}

function composeSite(
  existing: unknown,
  target: MigrationTarget,
): Record<string, unknown> | undefined {
  const targetSite = target.site;
  if (!targetSite && existing === undefined) return undefined;
  return {
    ...(targetSite ?? {}),
    ...asRecord(existing, "site"),
  };
}

function setScalarPreservingComment(
  document: ReturnType<typeof parseDocument>,
  key: string,
  value: string,
): void {
  if (isMap(document.contents)) {
    const pair = document.contents.items.find(
      (entry) => isScalar(entry.key) && entry.key.value === key,
    );
    if (pair && isScalar(pair.value)) {
      pair.value.value = value;
      return;
    }
  }
  document.set(key, value);
}

function replacePresetWithBundles(
  document: ReturnType<typeof parseDocument>,
  bundles: string[],
): void {
  if (!isMap(document.contents)) {
    throw new Error("brain.yaml must contain a YAML mapping");
  }

  const presetIndex = document.contents.items.findIndex(
    (entry) => isScalar(entry.key) && entry.key.value === "preset",
  );
  const replacement = document.createPair("bundles", bundles);
  if (presetIndex >= 0) {
    const previous = document.contents.items[presetIndex];
    if (isNode(previous?.key) && isNode(replacement.key)) {
      if (previous.key.commentBefore !== undefined) {
        replacement.key.commentBefore = previous.key.commentBefore;
      }
      if (previous.key.spaceBefore !== undefined) {
        replacement.key.spaceBefore = previous.key.spaceBefore;
      }
    }
    if (isNode(previous?.value) && isNode(replacement.value)) {
      if (previous.value.commentBefore !== undefined) {
        replacement.value.commentBefore = previous.value.commentBefore;
      }
      if (previous.value.comment !== undefined) {
        replacement.value.comment = previous.value.comment;
      }
      if (previous.value.spaceBefore !== undefined) {
        replacement.value.spaceBefore = previous.value.spaceBefore;
      }
    }
    document.contents.items.splice(presetIndex, 1, replacement);
    return;
  }
  document.contents.add(replacement);
}

/** Preview a deterministic legacy model/preset rewrite without writing files. */
export function previewBrainConfigMigration(
  input: string,
): BrainConfigMigrationPreview {
  const document = parseDocument(input, { keepSourceTokens: true });
  if (document.errors.length > 0) {
    throw new Error(`Invalid brain.yaml: ${document.errors[0]?.message}`);
  }
  const data: unknown = document.toJS();
  if (!isMigrationInput(data)) {
    throw new Error("brain.yaml must contain a YAML mapping");
  }

  const model = normalizeModel(data.brain);
  const preset = typeof data.preset === "string" ? data.preset : undefined;
  if (data.preset !== undefined && preset === undefined) {
    throw new Error("preset must be a string before migration");
  }
  if (data.preset !== undefined && data.bundles !== undefined) {
    throw new Error('"preset" and "bundles" cannot be migrated together');
  }

  if (model === "brain" && preset === undefined && data.bundles !== undefined) {
    return {
      changed: false,
      output: input,
      source: { model, preset: undefined },
    };
  }
  if (model === "brain") {
    throw new Error("Canonical brain config must declare explicit bundles");
  }

  const effectivePreset = preset ?? "default";
  const target = migrationTarget(model, effectivePreset);
  const add = mergeSelections(data.add, target.add);
  const remove = mergeSelections(data.remove, target.remove);
  const site = composeSite(data.site, target);
  const originalSite =
    data.site === undefined ? undefined : asRecord(data.site, "site");
  const originalPlugins =
    data.plugins === undefined ? undefined : asRecord(data.plugins, "plugins");
  const plugins = composePlugins(data.plugins, target);

  setScalarPreservingComment(document, "brain", "brain");
  replacePresetWithBundles(document, target.bundles);
  if (data.anchor === undefined) document.set("anchor", target.anchor);
  if (add) document.set("add", add);
  else document.delete("add");
  if (remove) document.set("remove", remove);
  else document.delete("remove");
  if (site) applyRecordDiff(document, ["site"], originalSite, site);
  else document.delete("site");
  applyRecordDiff(document, ["plugins"], originalPlugins, plugins);

  return {
    changed: true,
    output: document.toString({ lineWidth: 0 }),
    source: { model, preset: effectivePreset },
  };
}
