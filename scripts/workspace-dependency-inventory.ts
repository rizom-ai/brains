import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runProcess } from "@brains/utils/run-process";

/**
 * Workspace packages a package imports but does not declare.
 *
 * Every package here lists the internal packages it uses as devDependencies
 * and bundles them; nothing resolves `@brains/*` at runtime. That makes an
 * undeclared import invisible — it works because the package manager hoists
 * workspace packages to the root `node_modules`, not because the package said
 * it needed them. The build then depends on the layout of somebody else's
 * install, and the place that notices is a release.
 */
export interface UndeclaredImport {
  /** The importing package's name. */
  package: string;
  /** The workspace package it imports without declaring. */
  missing: string;
  /**
   * Where it should be declared.
   *
   * A package imported by shipped source is a `dependencies` entry even though
   * the build inlines it; one reached only from tests is a devDependency. The
   * repository follows that split already — `entities/link` lists its runtime
   * packages as dependencies and `@brains/app` as a devDependency — so the
   * scanner reports which one an import earns rather than assuming.
   */
  section: "dependencies" | "devDependencies";
  /**
   * Whether declaring it is possible.
   *
   * `@brains/test-utils` depends on twenty packages and is imported by the
   * tests of most of them. Declaring it there is not an omission anyone can
   * fix by editing a manifest: it closes a loop, and turbo refuses to build a
   * task graph with one. Those imports work on hoisting and have to, until
   * test-utils stops depending on what it mocks.
   */
  kind: "undeclared" | "would-cycle";
}

const WORKSPACE_SCOPE = /^@(?:brains|rizom)\//;

/**
 * Remove the places an import statement can appear without being one.
 *
 * Comments are the obvious case. Template literals are the awkward one: code
 * generators here hold scaffolded files in backticks, so `init.ts` contains a
 * line beginning `import { defineSection } from "@rizom/site";` that is output,
 * not an import. Nothing in this repository imports from inside a template
 * literal, so dropping them costs nothing.
 */
function withoutCommentsAndTemplates(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, "``");
}

/**
 * Workspace packages imported by `source`.
 *
 * Matches only imports in statement position. A repository that tests its own
 * import scanners has files full of import statements inside string literals —
 * `'import type { B } from "@rizom/other";'` is data, not a dependency — and
 * anchoring to the start of a line is what tells the two apart.
 */
export function workspaceImportsInSource(source: string): string[] {
  const text = withoutCommentsAndTemplates(source);
  const found = new Set<string>();

  // `[^;]*?` keeps a multi-line import from running past its own statement.
  // `import.meta.dir` in a later argument list would otherwise let the scan
  // continue to whatever `from "…"` came next.
  const statement = /^\s*(?:import|export)\b[^;]*?from\s*["']([^"']+)["']/gm;
  const bareImport = /^\s*import\s*["']([^"']+)["']/gm;
  const dynamic = /^[^"'\n]*\bimport\(\s*["']([^"']+)["']/gm;

  for (const pattern of [statement, bareImport, dynamic]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      if (!WORKSPACE_SCOPE.test(specifier)) continue;
      // `@brains/utils/run-process` depends on `@brains/utils`.
      const [scope, packageName] = specifier.split("/");
      if (scope === undefined || packageName === undefined) continue;
      if (packageName === "") continue;
      found.add(`${scope}/${packageName}`);
    }
  }

  return [...found].sort();
}

function declaredNames(manifestPath: string): {
  name: string | undefined;
  isPrivate: boolean;
  declared: Set<string>;
} {
  const manifest: {
    name?: string;
    private?: boolean;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  } = JSON.parse(readFileSync(manifestPath, "utf-8"));

  return {
    name: manifest.name,
    isPrivate: manifest.private === true,
    declared: new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]),
  };
}

/** Every tracked TypeScript file, and every workspace manifest. */
async function trackedFiles(root: string): Promise<string[]> {
  const listed = await runProcess(
    ["git", "ls-files", "-z", "*.ts", "*.tsx", "*/package.json"],
    { cwd: root },
  );
  if (listed.exitCode !== 0) throw new Error(`git ls-files failed in ${root}`);
  return listed.stdout.split("\0").filter((path) => path !== "");
}

/**
 * Everything `name` depends on, transitively, through `dependencies`.
 *
 * Only runtime dependencies: devDependencies do not participate in the
 * topological ordering turbo builds, so they cannot close a build cycle.
 */
function dependencyClosure(
  name: string,
  graph: Map<string, string[]>,
): Set<string> {
  const seen = new Set<string>();
  const visit = (current: string): void => {
    for (const dependency of graph.get(current) ?? []) {
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      visit(dependency);
    }
  };
  visit(name);
  return seen;
}

export async function findUndeclaredWorkspaceImports(
  root: string,
): Promise<UndeclaredImport[]> {
  const tracked = await trackedFiles(root);
  const manifests = tracked
    .filter((path) => path.endsWith("/package.json"))
    .filter((path) => !path.includes("/node_modules/"))
    // Fixture packages are built to be installed standalone by the tests that
    // use them; they are not part of this workspace's dependency graph.
    .filter((path) => !path.includes("/fixtures/"));

  const sources = tracked
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    // Fixture packages are installed standalone by the tests that use them,
    // so their imports are their own manifest's business, not their host's.
    .filter((path) => !path.includes("/fixtures/"));

  // The runtime graph, used to tell an omission from a loop, and which
  // packages are unpublished.
  const runtimeGraph = new Map<string, string[]>();
  const privatePackages = new Set<string>();
  for (const manifest of manifests) {
    const parsed: {
      name?: string;
      private?: boolean;
      dependencies?: Record<string, string>;
    } = JSON.parse(readFileSync(join(root, manifest), "utf-8"));
    if (parsed.name === undefined) continue;
    if (parsed.private === true) privatePackages.add(parsed.name);
    runtimeGraph.set(
      parsed.name,
      Object.keys(parsed.dependencies ?? {}).filter((dependency) =>
        WORKSPACE_SCOPE.test(dependency),
      ),
    );
  }

  const findings: UndeclaredImport[] = [];

  for (const manifest of manifests) {
    const directory = dirname(manifest);
    const { name, isPrivate, declared } = declaredNames(join(root, manifest));
    if (name === undefined) continue;

    // A file belongs to the nearest manifest above it, so a nested package's
    // files are not counted against its parent.
    const owned = sources.filter((path) => {
      if (!path.startsWith(`${directory}/`)) return false;
      const nearest = manifests
        .filter((other) => path.startsWith(`${dirname(other)}/`))
        .sort((a, b) => b.length - a.length)[0];
      return nearest === manifest;
    });

    /** Each import, and whether shipped source is what reaches for it. */
    const used = new Map<string, boolean>();
    for (const file of owned) {
      // `test.ts` at a package root is its test-helper entry — the `./test`
      // subpath other packages import from their own tests — so it is test
      // support wherever it sits, the same as anything under `test/`.
      const shipped =
        !/(^|\/)(test|tests|scripts)\//.test(file) &&
        !/(^|\/)test\.tsx?$/.test(file);
      for (const specifier of workspaceImportsInSource(
        readFileSync(join(root, file), "utf-8"),
      )) {
        if (specifier === name) continue;
        used.set(specifier, (used.get(specifier) ?? false) || shipped);
      }
    }

    for (const [missing, shipped] of [...used].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (declared.has(missing)) continue;
      // Declaring it closes a loop if what is missing already depends on the
      // package that wants it.
      const wouldCycle = dependencyClosure(missing, runtimeGraph).has(name);
      // A published package cannot take a runtime dependency on an
      // unpublished one — nobody installing it could resolve the name. Those
      // are bundled at build time, so they are devDependencies however the
      // shipped source reaches for them. `release-groups.test.ts` already
      // enforces the other half of this.
      const bundledIntoPublic = !isPrivate && privatePackages.has(missing);
      findings.push({
        package: name,
        missing,
        section:
          shipped && !bundledIntoPublic ? "dependencies" : "devDependencies",
        kind: wouldCycle ? "would-cycle" : "undeclared",
      });
    }
  }

  return findings.sort(
    (left, right) =>
      left.package.localeCompare(right.package) ||
      left.missing.localeCompare(right.missing),
  );
}
