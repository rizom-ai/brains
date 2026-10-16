import { lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "@brains/utils/zod";
import { exactVersionSchema } from "./schema";
import type { RequiredImage } from "./image-types";
import {
  runSubprocess,
  type RunCommand,
} from "@brains/deploy-support/run-subprocess";

const imageTagSchema = z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/);
const packageNameSchema = z
  .string()
  .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/);
const manifestSchema = z.strictObject({
  name: z.literal("rover-pilot-runtime"),
  private: z.literal(true),
  packageManager: z.literal("bun@1.4.0"),
  dependencies: z.record(packageNameSchema, exactVersionSchema),
  overrides: z.strictObject({
    "postcss-selector-parser": z.literal("7.1.6"),
  }),
});
type RuntimeManifest = z.infer<typeof manifestSchema>;

/** Operator-owned build inputs, not generated per-user deploy output. */
export function runtimeImageLockDirectory(image: RequiredImage): string {
  return join("deploy", "runtime", imageTagSchema.parse(image.tag));
}

function expectedManifest(image: RequiredImage): RuntimeManifest {
  const dependencies: Record<string, string> = {
    "@rizom/brain": exactVersionSchema.parse(image.brainVersion),
  };
  for (const pin of [...image.sitePackages].sort()) {
    const separator = pin.lastIndexOf("@");
    const name = packageNameSchema.parse(pin.slice(0, separator));
    const version = exactVersionSchema.parse(pin.slice(separator + 1));
    if (dependencies[name] !== undefined && dependencies[name] !== version) {
      throw new Error(`Conflicting runtime dependency pin: ${pin}`);
    }
    dependencies[name] = version;
  }
  return manifestSchema.parse({
    name: "rover-pilot-runtime",
    private: true,
    packageManager: "bun@1.4.0",
    dependencies,
    overrides: { "postcss-selector-parser": "7.1.6" },
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    // Only absence is expected; permission and filesystem failures propagate.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertRegularFile(path: string): Promise<void> {
  if (!(await lstat(path)).isFile()) {
    throw new Error(`Runtime lock input must be a regular file: ${path}`);
  }
}

async function assertDirectory(path: string): Promise<void> {
  if (!(await lstat(path)).isDirectory()) {
    throw new Error(`Runtime lock input must be a directory: ${path}`);
  }
}

async function assertExistingParents(rootDir: string): Promise<void> {
  for (const relative of ["deploy", join("deploy", "runtime")]) {
    const path = join(rootDir, relative);
    if (await exists(path)) await assertDirectory(path);
  }
}

async function assertLockFiles(
  directory: string,
  image: RequiredImage,
): Promise<void> {
  const manifestPath = join(directory, "package.json");
  const lockPath = join(directory, "bun.lock");
  await assertRegularFile(manifestPath);
  await assertRegularFile(lockPath);
  const actual = manifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  if (!isDeepStrictEqual(actual, expectedManifest(image))) {
    throw new Error(`Runtime dependency manifest does not match ${image.tag}`);
  }
  if (!(await readFile(lockPath, "utf8")).trim()) {
    throw new Error(`Empty runtime dependency lock: ${lockPath}`);
  }
}

/** Fail before publishing when a required build has no reviewed, matching inputs. */
export async function assertRuntimeImageLock(
  rootDir: string,
  image: RequiredImage,
): Promise<void> {
  await assertExistingParents(rootDir);
  const directory = join(rootDir, runtimeImageLockDirectory(image));
  await assertDirectory(directory);
  if (await exists(join(directory, ".incomplete"))) {
    throw new Error(`Incomplete runtime dependency lock: ${directory}`);
  }
  await assertLockFiles(directory, image);
}

/**
 * Resolve once for operator review; CI and Docker only consume the frozen result.
 * Existing entries are never refreshed or overwritten. Failed new entries retain
 * their incomplete marker and diagnostic files and cannot be used by a build.
 */
export async function lockRuntimeImage(
  rootDir: string,
  image: RequiredImage,
  run: RunCommand = runSubprocess,
): Promise<"created" | "existing"> {
  if (Bun.version !== "1.4.0") {
    throw new Error(
      "Runtime dependency locks must be generated with Bun 1.4.0",
    );
  }
  const manifest = expectedManifest(image);
  await assertExistingParents(rootDir);
  const directory = join(rootDir, runtimeImageLockDirectory(image));
  if (await exists(directory)) {
    await assertRuntimeImageLock(rootDir, image);
    return "existing";
  }
  await mkdir(join(rootDir, "deploy", "runtime"), { recursive: true });
  // Exclusive reservation also fences concurrent generators for this image.
  await mkdir(directory);
  const marker = join(directory, ".incomplete");
  await writeFile(
    marker,
    "Runtime dependency resolution has not completed.\n",
    { flag: "wx" },
  );
  await writeFile(
    join(directory, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" },
  );
  await run(
    process.execPath,
    ["install", "--lockfile-only", "--ignore-scripts"],
    {
      cwd: directory,
    },
  );
  // Validate with the incomplete marker still present, then publish by removing
  // only the marker owned by this invocation. No failed evidence is cleaned up.
  await assertLockFiles(directory, image);
  await run(
    process.execPath,
    ["install", "--frozen-lockfile", "--ignore-scripts", "--dry-run"],
    { cwd: directory },
  );
  await assertLockFiles(directory, image);
  await unlink(marker);
  return "created";
}
