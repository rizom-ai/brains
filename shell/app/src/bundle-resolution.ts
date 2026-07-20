import type { PermissionConfig } from "@brains/templates";
import {
  defineBundle,
  type CapabilityBundleDefinition,
} from "./bundle-definition";
import type { PluginConfig } from "./brain-definition";

export interface BundleSelectionInput {
  catalogIds: readonly string[];
  definitions: readonly CapabilityBundleDefinition[];
  selected: readonly string[];
  mode?: "eval" | undefined;
  add?: readonly string[] | undefined;
  remove?: readonly string[] | undefined;
}

export interface ResolvedBundlePermissionContribution {
  bundleId: string;
  member: string;
  config: PermissionConfig;
}

export interface BundleSelectionResolution {
  activeBundles: readonly string[];
  activeMembers: readonly string[];
  configByMember: Readonly<Record<string, PluginConfig>>;
  permissionContributions: readonly ResolvedBundlePermissionContribution[];
  agentInstructions: readonly string[];
  evalDisable: readonly string[];
}

interface ConfigObjectNode {
  kind: "object";
  sources: Set<string>;
  children: Map<string, ConfigNode>;
}

interface ConfigLeafNode {
  kind: "leaf";
  sources: Set<string>;
  value: unknown;
}

type ConfigNode = ConfigObjectNode | ConfigLeafNode;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    ) as T;
  }

  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => valuesEqual(item, right[index]))
    );
  }

  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) && valuesEqual(left[key], right[key]),
      )
    );
  }

  return false;
}

function configNode(value: unknown, source: string): ConfigNode {
  if (isPlainRecord(value)) {
    return {
      kind: "object",
      sources: new Set([source]),
      children: new Map(
        Object.entries(value).map(([key, item]) => [
          key,
          configNode(item, source),
        ]),
      ),
    };
  }

  return {
    kind: "leaf",
    sources: new Set([source]),
    value: cloneValue(value),
  };
}

function configNodeValue(node: ConfigNode): unknown {
  if (node.kind === "leaf") return cloneValue(node.value);

  return Object.fromEntries(
    [...node.children].map(([key, child]) => [key, configNodeValue(child)]),
  );
}

function collectSources(node: ConfigNode): Set<string> {
  const sources = new Set(node.sources);
  if (node.kind === "object") {
    for (const child of node.children.values()) {
      for (const source of collectSources(child)) sources.add(source);
    }
  }
  return sources;
}

function displayPath(path: readonly string[]): string {
  return path.length === 0 ? "<root>" : path.join(".");
}

function conflictError(input: {
  member: string;
  path: readonly string[];
  existingSources: ReadonlySet<string>;
  incomingSource: string;
  declaredOverride: string | undefined;
}): Error {
  const existing = [...input.existingSources].map((id) => `"${id}"`).join(", ");
  const declaration = input.declaredOverride
    ? `; declared override only names "${input.declaredOverride}"`
    : `; bundle "${input.incomingSource}" must declare the bundle it overrides`;

  return new Error(
    `Config conflict for member "${input.member}" at "${displayPath(input.path)}" between bundles ${existing} and "${input.incomingSource}"${declaration}`,
  );
}

function canOverrideAll(
  sources: ReadonlySet<string>,
  declaredOverride: string | undefined,
): boolean {
  return (
    declaredOverride !== undefined &&
    sources.size > 0 &&
    [...sources].every((source) => source === declaredOverride)
  );
}

function mergeConfigNodes(input: {
  existing: ConfigNode;
  incoming: ConfigNode;
  member: string;
  path: readonly string[];
  incomingSource: string;
  declaredOverride: string | undefined;
}): { node: ConfigNode; usedOverride: boolean } {
  const { existing, incoming, member, path, incomingSource, declaredOverride } =
    input;

  if (existing.kind === "object" && incoming.kind === "object") {
    let usedOverride = false;
    for (const source of incoming.sources) existing.sources.add(source);

    for (const [key, incomingChild] of incoming.children) {
      const existingChild = existing.children.get(key);
      if (!existingChild) {
        existing.children.set(key, incomingChild);
        continue;
      }

      const merged = mergeConfigNodes({
        existing: existingChild,
        incoming: incomingChild,
        member,
        path: [...path, key],
        incomingSource,
        declaredOverride,
      });
      existing.children.set(key, merged.node);
      usedOverride ||= merged.usedOverride;
    }

    return { node: existing, usedOverride };
  }

  if (
    existing.kind === "leaf" &&
    incoming.kind === "leaf" &&
    valuesEqual(existing.value, incoming.value)
  ) {
    for (const source of incoming.sources) existing.sources.add(source);
    return { node: existing, usedOverride: false };
  }

  const existingSources = collectSources(existing);
  if (!canOverrideAll(existingSources, declaredOverride)) {
    throw conflictError({
      member,
      path,
      existingSources,
      incomingSource,
      declaredOverride,
    });
  }

  return { node: incoming, usedOverride: true };
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label} "${value}"`);
    seen.add(value);
  }
}

function validateDefinitions(
  catalogIds: readonly string[],
  definitions: readonly CapabilityBundleDefinition[],
): CapabilityBundleDefinition[] {
  assertUnique(catalogIds, "catalog member");
  assertUnique(
    definitions.map(({ id }) => id),
    "bundle definition",
  );

  const parsed = definitions.map((definition) => defineBundle(definition));
  const catalog = new Set(catalogIds);
  const definitionIndexes = new Map(parsed.map(({ id }, index) => [id, index]));

  for (const [index, definition] of parsed.entries()) {
    for (const member of definition.members) {
      if (!catalog.has(member)) {
        throw new Error(
          `Bundle "${definition.id}" references unknown catalog member "${member}"`,
        );
      }
    }

    for (const contribution of definition.config ?? []) {
      if (!contribution.overrides) continue;

      const overriddenIndex = definitionIndexes.get(contribution.overrides);
      if (overriddenIndex === undefined) {
        throw new Error(
          `Bundle "${definition.id}" references unknown bundle "${contribution.overrides}" in its config override`,
        );
      }
      if (overriddenIndex >= index) {
        throw new Error(
          `Bundle "${definition.id}" may only override an earlier bundle "${contribution.overrides}"`,
        );
      }
    }
  }

  composeConfig(parsed, undefined, true);
  return parsed;
}

function composeConfig(
  definitions: readonly CapabilityBundleDefinition[],
  activeMembers: ReadonlySet<string> | undefined,
  requireUsedOverrides: boolean,
): Map<string, ConfigObjectNode> {
  const configs = new Map<string, ConfigObjectNode>();

  for (const definition of definitions) {
    for (const contribution of definition.config ?? []) {
      if (activeMembers && !activeMembers.has(contribution.member)) continue;

      const incoming = configNode(
        contribution.value,
        definition.id,
      ) as ConfigObjectNode;
      const existing = configs.get(contribution.member);
      if (!existing) {
        configs.set(contribution.member, incoming);
        if (requireUsedOverrides && contribution.overrides) {
          throw new Error(
            `Config override of "${contribution.overrides}" in bundle "${definition.id}" does not replace conflicting config for member "${contribution.member}"`,
          );
        }
        continue;
      }

      const merged = mergeConfigNodes({
        existing,
        incoming,
        member: contribution.member,
        path: [],
        incomingSource: definition.id,
        declaredOverride: contribution.overrides,
      });
      configs.set(contribution.member, merged.node as ConfigObjectNode);

      if (
        requireUsedOverrides &&
        contribution.overrides &&
        !merged.usedOverride
      ) {
        throw new Error(
          `Config override of "${contribution.overrides}" in bundle "${definition.id}" does not replace conflicting config for member "${contribution.member}"`,
        );
      }
    }
  }

  return configs;
}

function selectedDefinitions(
  definitions: readonly CapabilityBundleDefinition[],
  selected: readonly string[],
): CapabilityBundleDefinition[] {
  assertUnique(selected, "selected bundle");

  const available = new Set(definitions.map(({ id }) => id));
  for (const id of selected) {
    if (!available.has(id)) {
      throw new Error(
        `Unknown bundle "${id}". Available: ${definitions.map(({ id: bundleId }) => bundleId).join(", ")}`,
      );
    }
  }

  const selectedSet = new Set(selected);
  return definitions.filter(({ id }) => selectedSet.has(id));
}

function collectEvalDisable(
  definitions: readonly CapabilityBundleDefinition[],
): string[] {
  const disabled = new Set<string>();
  for (const definition of definitions) {
    for (const member of definition.evalDisable ?? []) disabled.add(member);
  }
  return [...disabled];
}

/**
 * Resolve immutable bundle data into an ordered, resource-free selection.
 * This function never constructs plugins and is not called by the production resolver
 * until the Phase 1B integration.
 */
export function resolveBundleSelection(
  input: BundleSelectionInput,
): BundleSelectionResolution {
  const definitions = validateDefinitions(input.catalogIds, input.definitions);
  const activeDefinitions = selectedDefinitions(definitions, input.selected);
  const catalog = new Set(input.catalogIds);
  const active = new Set(
    activeDefinitions.flatMap((definition) => definition.members),
  );
  const evalDisable = collectEvalDisable(activeDefinitions);

  if (input.mode === "eval") {
    for (const member of evalDisable) active.delete(member);
  }
  for (const member of input.add ?? []) {
    if (catalog.has(member)) active.add(member);
  }
  for (const member of input.remove ?? []) active.delete(member);

  const activeMembers = input.catalogIds.filter((member) => active.has(member));
  const activeMemberSet = new Set(activeMembers);
  const configNodes = composeConfig(activeDefinitions, activeMemberSet, false);
  const configByMember = Object.fromEntries(
    activeMembers.flatMap((member) => {
      const config = configNodes.get(member);
      return config
        ? [[member, configNodeValue(config) as PluginConfig] as const]
        : [];
    }),
  );

  const permissionContributions = activeDefinitions.flatMap((definition) =>
    (definition.permissions ?? [])
      .filter(({ member }) => activeMemberSet.has(member))
      .map(({ member, config }) => ({
        bundleId: definition.id,
        member,
        config: cloneValue(config),
      })),
  );

  return {
    activeBundles: activeDefinitions.map(({ id }) => id),
    activeMembers,
    configByMember,
    permissionContributions,
    agentInstructions: activeDefinitions.flatMap(
      ({ agentInstructions }) => agentInstructions ?? [],
    ),
    evalDisable,
  };
}
