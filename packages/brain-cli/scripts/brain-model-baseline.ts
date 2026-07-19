#!/usr/bin/env bun
import ranger from "@brains/ranger";
import relay from "@brains/relay";
import rover from "@brains/rover";
import {
  resolve,
  type BrainDefinition,
  type InstanceOverrides,
} from "@brains/app";

interface BaselineVariant {
  preset: "core" | "default" | "full";
  add?: string[];
  remove?: string[];
}

interface BaselinePlugin {
  id: string;
  packageName: string;
  config: unknown;
  criticalConfig?: unknown;
}

interface PluginWithConfig {
  config: unknown;
}

const LONG_STRING_THRESHOLD = 200;
const baselinePath = new URL(
  "../test/fixtures/brain-model-unification-baseline.json",
  import.meta.url,
);

function sha256(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

function normalizePath(value: string): string {
  const repositoryMarker = "/brains/";
  const repositoryIndex = value.lastIndexOf(repositoryMarker);
  if (repositoryIndex >= 0) {
    return `<repo>/${value.slice(repositoryIndex + repositoryMarker.length)}`;
  }
  return value;
}

function sanitizeString(value: string): string | Record<string, unknown> {
  const normalized = normalizePath(value);
  if (normalized.length <= LONG_STRING_THRESHOLD) return normalized;

  return {
    $string: {
      length: normalized.length,
      sha256: sha256(normalized),
    },
  };
}

/** Convert resolved model state into stable, worktree-independent JSON. */
function sanitizeBaselineValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === "string") return sanitizeString(value);
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "function") return { $function: true };
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (typeof value === "symbol") return { $symbol: String(value) };

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeBaselineValue(entry, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return { $circular: true };
    seen.add(value);

    const result: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    for (const [key, entry] of entries) {
      result[key] = sanitizeBaselineValue(entry, seen);
    }
    seen.delete(value);
    return result;
  }

  return { $unknown: String(value) };
}

function summarizeBaselineValue(value: unknown): unknown {
  const sanitized = sanitizeBaselineValue(value);
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= 4_000) return sanitized;

  const keys =
    sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? Object.keys(sanitized)
      : [];
  return {
    $value: {
      length: serialized.length,
      sha256: sha256(serialized),
      keys,
    },
  };
}

const CRITICAL_CONFIG_KEYS: Readonly<Record<string, readonly string[]>> = {
  dashboard: ["routePath"],
  topics: ["includeEntityTypes", "extractableStatuses", "extractionVisibility"],
  "conversation-memory": ["memoryVisibility"],
  "directory-sync": ["seedContentPath", "autoSync", "initialSync"],
  "site-builder": ["autoRebuild", "rebuildDebounce"],
  atproto: ["enabled", "pdsEndpoint"],
  "atproto-registry": ["enabled"],
  "social-media": ["autoGenerateOnBlogPublish"],
  products: ["route"],
};

function captureCriticalConfig(pluginId: string, value: unknown): unknown {
  const keys = CRITICAL_CONFIG_KEYS[pluginId];
  if (!keys || !value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  return sanitizeBaselineValue(
    Object.fromEntries(keys.map((key) => [key, record[key]])),
  );
}

function getPluginConfig(plugin: object): unknown {
  return (plugin as PluginWithConfig).config;
}

function captureVariant(
  definition: BrainDefinition,
  variant: BaselineVariant,
): Record<string, unknown> {
  const overrides: Omit<InstanceOverrides, "brain"> = {
    preset: variant.preset,
    ...(variant.add ? { add: variant.add } : {}),
    ...(variant.remove ? { remove: variant.remove } : {}),
  };
  const resolved = resolve(definition, {}, overrides);

  const plugins: BaselinePlugin[] = (resolved.plugins ?? []).map((plugin) => {
    const config = getPluginConfig(plugin);
    const criticalConfig = captureCriticalConfig(plugin.id, config);
    return {
      id: plugin.id,
      packageName: plugin.packageName,
      config: summarizeBaselineValue(config),
      ...(criticalConfig === undefined ? {} : { criticalConfig }),
    };
  });

  return {
    selection: {
      preset: variant.preset,
      members: definition.presets?.[variant.preset] ?? [],
      add: variant.add ?? [],
      remove: variant.remove ?? [],
    },
    resolved: {
      plugins,
      agentInstructions: sanitizeBaselineValue(resolved.agentInstructions),
      permissions: sanitizeBaselineValue(resolved.permissions),
    },
  };
}

function captureBrainModelBaseline(
  definition: BrainDefinition,
  variants: Record<string, BaselineVariant>,
): Record<string, unknown> {
  const capturedVariants = Object.fromEntries(
    Object.entries(variants).map(([name, variant]) => [
      name,
      captureVariant(definition, variant),
    ]),
  );

  return {
    definition: {
      name: definition.name,
      capabilityIds: definition.capabilities.map(([id]) => id),
      interfaceIds: definition.interfaces.map(([id]) => id),
      evalDisable: definition.evalDisable ?? [],
      site: summarizeBaselineValue(definition.site),
      theme: summarizeBaselineValue(definition.theme),
    },
    variants: capturedVariants,
  };
}

function captureCurrentBaseline(): Record<string, unknown> {
  return {
    rover: captureBrainModelBaseline(rover, {
      core: { preset: "core" },
      default: { preset: "default" },
      full: { preset: "full" },
      "rizom-ai": {
        preset: "default",
        add: [
          "web-chat",
          "atproto-registry",
          "products",
          "rizom-ecosystem",
          "newsletter",
          "site-content",
        ],
      },
    }),
    relay: captureBrainModelBaseline(relay, {
      core: { preset: "core" },
      default: { preset: "default" },
      full: { preset: "full" },
    }),
    ranger: captureBrainModelBaseline(ranger, {
      default: { preset: "default" },
    }),
  };
}

function verifySanitizer(): void {
  const first = sanitizeBaselineValue({
    seed: "/tmp/one/brains/rover/seed-content-core",
    css: "x".repeat(201),
  });
  const second = sanitizeBaselineValue({
    seed: "/tmp/two/brains/rover/seed-content-core",
    css: "x".repeat(201),
  });
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error("baseline sanitizer retained a worktree-specific path");
  }
}

verifySanitizer();
const actualBaseline = captureCurrentBaseline();
const actualText = `${JSON.stringify(actualBaseline, null, 2)}\n`;

if (Bun.argv.includes("--write")) {
  await Bun.write(baselinePath, actualText);
  console.log(`Wrote ${baselinePath.pathname}`);
} else {
  const expectedBaseline: unknown = await Bun.file(baselinePath).json();
  if (JSON.stringify(actualBaseline) !== JSON.stringify(expectedBaseline)) {
    console.error(
      "Brain model baseline changed. Run `bun packages/brain-cli/scripts/brain-model-baseline.ts --write`, inspect the diff, and record every intentional delta.",
    );
    process.exit(1);
  }
  console.log("Brain model baseline matches alpha.204");
}
