import { existsSync } from "node:fs";
import { join, normalize, sep } from "node:path";

const sourceExtensionPattern = /\.(?:[cm]?[jt]sx?)$/;

export const architectureSourceExclusions = [
  {
    pattern: /^packages\/brain-cli\/templates\/deploy\/scripts\/.*\.ts$/,
    reason:
      "generated package copies; shared/deploy-support/src/deploy-scripts is canonical",
  },
  {
    pattern:
      /^packages\/brains-ops\/templates\/rover-pilot\/deploy\/scripts\/.*\.ts$/,
    reason:
      "generated package copies; shared/deploy-support/src/deploy-scripts is canonical",
  },
  {
    pattern: /^packages\/brain-cli\/test\/fixtures\//,
    reason:
      "standalone packed and external-consumer package graphs have dedicated tests",
  },
] as const;

export const architectureStructuralEdges = [
  {
    family: "shell",
    from: "shell/core/src/index.ts",
    to: "shell/core/src/config/index.ts",
  },
  {
    family: "shared",
    from: "shared/contracts/src/index.ts",
    to: "shared/contracts/src/actor-ref.ts",
  },
  {
    family: "plugins",
    from: "plugins/admin/src/index.ts",
    to: "plugins/admin/src/plugin.ts",
  },
  {
    family: "entities",
    from: "entities/blog/src/index.ts",
    to: "entities/blog/src/plugin.ts",
  },
  {
    family: "interfaces",
    from: "interfaces/mcp/src/index.ts",
    to: "interfaces/mcp/src/mcp-interface.ts",
  },
  {
    family: "sites",
    from: "sites/default/src/index.ts",
    to: "sites/professional/src/index.ts",
  },
  {
    family: "packages",
    from: "packages/brain-cli/src/index.ts",
    to: "packages/brain-cli/src/parse-args.ts",
  },
] as const;

export interface ExcludedArchitectureSource {
  path: string;
  reason: string;
}

export interface ArchitectureSourceInventory {
  selected: string[];
  excluded: ExcludedArchitectureSource[];
}

export type ArchitectureReporter = "err" | "text" | "json" | "dot";

export function toRepositoryPath(path: string): string {
  return normalize(path).split(sep).join("/");
}

export function selectArchitectureSources(
  repositoryRoot: string,
  paths: readonly string[],
): ArchitectureSourceInventory {
  const selected = new Set<string>();
  const excluded = new Map<string, string>();

  for (const rawPath of paths) {
    const path = toRepositoryPath(rawPath);
    if (!sourceExtensionPattern.test(path)) continue;
    if (!existsSync(join(repositoryRoot, path))) continue;

    const exclusion = architectureSourceExclusions.find(({ pattern }) =>
      pattern.test(path),
    );
    if (exclusion) {
      excluded.set(path, exclusion.reason);
      continue;
    }
    selected.add(path);
  }

  return {
    selected: [...selected].sort(),
    excluded: [...excluded]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, reason]) => ({ path, reason })),
  };
}

export function parseArchitectureReporter(
  args: readonly string[],
): ArchitectureReporter {
  if (args.length === 0) return "err";
  if (args.length !== 2 || args[0] !== "--reporter") {
    throw new Error(
      "Usage: bun scripts/architecture-check.ts [--reporter err|text|json|dot]",
    );
  }

  const reporter = args[1];
  if (
    reporter !== "err" &&
    reporter !== "text" &&
    reporter !== "json" &&
    reporter !== "dot"
  ) {
    throw new Error(`Unsupported architecture reporter: ${reporter ?? ""}`);
  }
  return reporter;
}
