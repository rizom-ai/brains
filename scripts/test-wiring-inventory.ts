/**
 * Inventory helpers behind `test-wiring.test.ts`.
 *
 * They answer one question in three parts: can a test file that exists in this
 * repository fail to run without anyone noticing? Each failure mode below has
 * been observed here, and each is silent — a runner that matches nothing exits
 * zero exactly like one that matched and passed.
 */

import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getPackages } from "@manypkg/get-packages";

export interface WorkspacePackage {
  /** Repository-relative package directory, e.g. `sites/professional`. */
  dir: string;
  name: string;
  scripts: Record<string, string>;
  hasTestFiles: boolean;
}

export interface BrokenScriptPath {
  script: string;
  path: string;
}

export interface ScriptTestCoverageInput {
  /** Repository-relative `scripts/*.test.ts` paths. */
  scriptTestFiles: string[];
  /** Root `package.json` scripts, name to command. */
  rootScripts: Record<string, string>;
  /** Root script names invoked as `bun run <name>` by a workflow. */
  workflowInvokedScripts: Set<string>;
}

const TEST_FILE_GLOB = "**/*.test.{ts,tsx}";

/**
 * The repository-relative paths a `bun test` command would run, or `null` when
 * the command is not a `bun test` invocation.
 *
 * An empty array means a bare `bun test`, which runs everything from the
 * working directory — distinct from `null`, which means the command does not
 * run Bun's test runner at all.
 */
export function bunTestTargets(command: string): string[] | null {
  const words = command.trim().split(/\s+/);
  const isBunTest = words[0] === "bun" && words[1] === "test";
  if (!isBunTest) {
    return null;
  }
  return words.slice(2).filter((word) => !word.startsWith("-"));
}

/**
 * Packages that ship test files but declare no `test` script. Turbo drives
 * tests through that script, so these files are unreachable from any runner.
 */
export function packagesMissingTestScript(
  packages: WorkspacePackage[],
): string[] {
  return packages
    .filter((pkg) => pkg.hasTestFiles && !pkg.scripts["test"])
    .map((pkg) => pkg.dir)
    .sort();
}

/**
 * Script-level test files that no root script would run.
 *
 * A target ending in `/` covers everything beneath it; any other target must
 * match the file exactly.
 */
export function scriptTestsNotCovered(
  scriptTestFiles: string[],
  rootScripts: Record<string, string>,
): string[] {
  const targets = Object.values(rootScripts).flatMap(
    (command) => bunTestTargets(command) ?? [],
  );
  return scriptTestFiles
    .filter((file) => !targets.some((target) => targetCoversFile(target, file)))
    .sort();
}

/**
 * Script-level test files that no CI-invoked root script would run.
 *
 * Coverage by a root script is not enough on its own: a script nothing invokes
 * is as silent as no script at all.
 */
export function uncoveredScriptTestFiles(
  input: ScriptTestCoverageInput,
): string[] {
  const ciScripts = Object.fromEntries(
    Object.entries(input.rootScripts).filter(([name]) =>
      input.workflowInvokedScripts.has(name),
    ),
  );
  return scriptTestsNotCovered(input.scriptTestFiles, ciScripts);
}

/**
 * Root scripts whose `bun test` path argument resolves to nothing.
 *
 * Bun treats an unmatched path as a filter rather than an error, so such a
 * script reports success having run nothing — or, worse, having run whatever
 * unrelated file the string happened to match.
 */
export function scriptPathsThatDoNotExist(
  rootScripts: Record<string, string>,
  exists: (repositoryRelativePath: string) => boolean,
): BrokenScriptPath[] {
  return Object.entries(rootScripts).flatMap(([script, command]) =>
    (bunTestTargets(command) ?? [])
      .filter((path) => !exists(path))
      .map((path) => ({ script, path })),
  );
}

/**
 * Every workspace package, with whether it ships test files.
 *
 * `@manypkg/get-packages` enumerates the workspace but its `PackageJSON` type
 * does not model `scripts`, so the manifest is re-read here rather than cast.
 */
export async function collectWorkspacePackages(
  repositoryRoot: string,
): Promise<WorkspacePackage[]> {
  const { packages } = await getPackages(repositoryRoot);
  return Promise.all(
    packages.map(async (pkg) => ({
      dir: relativeTo(repositoryRoot, pkg.dir),
      name: pkg.packageJson.name,
      scripts: await readScripts(pkg.dir),
      hasTestFiles: containsTestFile(pkg.dir),
    })),
  );
}

/** Repository-relative `scripts/*.test.ts` paths. */
export function workspaceScriptTestFiles(repositoryRoot: string): string[] {
  return Array.from(
    new Glob("*.test.{ts,tsx}").scanSync({
      cwd: join(repositoryRoot, "scripts"),
    }),
  )
    .map((file) => `scripts/${file}`)
    .sort();
}

/** The root `package.json` scripts block. */
export async function readRootScripts(
  repositoryRoot: string,
): Promise<Record<string, string>> {
  return readScripts(repositoryRoot);
}

/** Root script names any workflow invokes as `bun run <name>`. */
export async function readWorkflowInvokedScripts(
  repositoryRoot: string,
): Promise<Set<string>> {
  const workflowDir = join(repositoryRoot, ".github", "workflows");
  const files = (await readdir(workflowDir)).filter(
    (file) => file.endsWith(".yml") || file.endsWith(".yaml"),
  );
  const contents = await Promise.all(
    files.map((file) => readFile(join(workflowDir, file), "utf8")),
  );
  return new Set(
    contents.flatMap((content) =>
      Array.from(
        content.matchAll(/\bbun run ([\w:.-]+)/g),
        (match) => match[1] ?? "",
      ),
    ),
  );
}

async function readScripts(
  packageDir: string,
): Promise<Record<string, string>> {
  const manifest: { scripts?: Record<string, string> } = JSON.parse(
    await readFile(join(packageDir, "package.json"), "utf8"),
  );
  return manifest.scripts ?? {};
}

function targetCoversFile(target: string, file: string): boolean {
  return target.endsWith("/") ? file.startsWith(target) : target === file;
}

function containsTestFile(packageDir: string): boolean {
  const matches = new Glob(TEST_FILE_GLOB).scanSync({ cwd: packageDir });
  return Array.from(matches).some((file) => !file.includes("node_modules"));
}

function relativeTo(repositoryRoot: string, absolutePath: string): string {
  return absolutePath.startsWith(`${repositoryRoot}/`)
    ? absolutePath.slice(repositoryRoot.length + 1)
    : absolutePath;
}

export interface LocalFactory {
  /** Repository-relative file the factory is declared in. */
  file: string;
  name: string;
  /** Declared return type, as written. */
  returnType: string;
}

/**
 * Local factories that shadow a shared one *and* claim to build the same type.
 *
 * Name alone is the wrong test. Several packages legitimately declare a
 * `createMockShell` or `createMockEntityService` that builds something else
 * entirely — `ShellInstance`, or a narrow package-local interface — and a
 * thin wrapper around a shared factory is fine too, as long as it does not
 * take the shared name. Only a same-name, same-return-type declaration is a
 * second definition of the same thing.
 */
export function shadowingFactories(
  locals: LocalFactory[],
  sharedReturnTypes: Record<string, string>,
): string[] {
  return locals
    .filter((local) => sharedReturnTypes[local.name] === local.returnType)
    .map((local) => `${local.file}: ${local.name}`)
    .sort();
}

/** Return types of the `create*` factories `@brains/test-utils` exports. */
export function readSharedFactoryReturnTypes(
  repositoryRoot: string,
): Record<string, string> {
  const dir = join(repositoryRoot, "shared", "test-utils", "src");
  const sources = Array.from(new Glob("*.ts").scanSync({ cwd: dir })).map(
    (file) => readFileSync(join(dir, file), "utf8"),
  );
  return Object.fromEntries(
    sources.flatMap((source) =>
      Array.from(
        source.matchAll(
          /export function (create[A-Za-z]+)\([\s\S]*?\)\s*:\s*([A-Za-z<>[\]| ]+?)\s*\{/g,
        ),
        (match) => [match[1] ?? "", (match[2] ?? "").trim()],
      ),
    ),
  );
}

/** `create*` factories declared inside test files, with their return types. */
export function collectLocalFactories(repositoryRoot: string): LocalFactory[] {
  const files = Array.from(
    new Glob(
      "{shell,shared,plugins,interfaces,entities,packages}/*/test/**/*.test.{ts,tsx}",
    ).scanSync({ cwd: repositoryRoot }),
  );
  return files.flatMap((file) =>
    Array.from(
      readFileSync(join(repositoryRoot, file), "utf8").matchAll(
        /^\s*(?:export\s+)?function (create[A-Za-z]+)\([\s\S]*?\)\s*:\s*([A-Za-z<>[\]| ]+?)\s*\{/gm,
      ),
      (match): LocalFactory => ({
        file,
        name: match[1] ?? "",
        returnType: (match[2] ?? "").trim(),
      }),
    ),
  );
}
