import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYamlDocument } from "@brains/utils/yaml";
import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";
import { isMap, parseDocument } from "yaml";
import { createDefaultUserRunner } from "./default-user-runner";
import {
  migrateLegacyCohortYaml,
  migrateLegacyPilotYaml,
} from "./legacy-pilot-migration";
import {
  migrateCanonicalCohortYaml,
  migrateCanonicalPilotYaml,
  parseCapabilityBundleReview,
  type CapabilityBundleReview,
} from "./capability-bundle-migration";
import { loadPilotRegistry } from "./load-registry";
import { writeUsersTable } from "./render-users-table";
import {
  exactVersionSchema,
  handleSchema,
  siteOverrideSchema,
  userSchema,
  type SiteOverrideConfig,
} from "./schema";

export interface StagedCrossover {
  outputDir: string;
  changedFiles: string[];
}

interface ReviewedSitePinManifest {
  sites: Record<string, SiteOverrideConfig>;
}

const reviewedSitePinsSchema: z.ZodType<ReviewedSitePinManifest> =
  z.strictObject({
    sites: z.record(handleSchema, siteOverrideSchema),
  });

const stagedSiteUserSchema = z
  .object({
    handle: handleSchema,
    siteOverride: z
      .object({
        package: z.string().min(1),
        version: exactVersionSchema.optional(),
        theme: z.string().min(1).optional(),
        themeVersion: exactVersionSchema.optional(),
      })
      .optional(),
  })
  .passthrough();

export type ReviewedSitePins = ReviewedSitePinManifest["sites"];

export interface StageLegacyCrossoverOptions {
  sitePins?: ReviewedSitePins | undefined;
  bundleReview?: CapabilityBundleReview | undefined;
}

const crossoverRecordTemplate = fileURLToPath(
  new URL(
    "../templates/rover-pilot/docs/canonical-crossover-record.md",
    import.meta.url,
  ),
);

export function parseReviewedSitePins(input: string): ReviewedSitePins {
  const result = parseYamlDocument(input, reviewedSitePinsSchema);
  if (!result.ok) {
    throw new Error(`Invalid reviewed site pins: ${result.error}`);
  }
  return result.data.sites;
}

export async function loadReviewedSitePins(
  filePath: string,
): Promise<ReviewedSitePins> {
  return parseReviewedSitePins(await readFile(filePath, "utf8"));
}

export async function loadCapabilityBundleReview(
  filePath: string,
): Promise<CapabilityBundleReview> {
  return parseCapabilityBundleReview(await readFile(filePath, "utf8"));
}

async function applyReviewedSitePins(
  output: string,
  pins: ReviewedSitePins | undefined,
): Promise<string[]> {
  const userDirectory = join(output, "users");
  const userFiles = (await readdir(userDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const unusedPins = new Set(Object.keys(pins ?? {}));
  const changedFiles: string[] = [];

  for (const fileName of userFiles) {
    const path = join(userDirectory, fileName);
    const input = await readFile(path, "utf8");
    const document = parseDocument(input, { keepSourceTokens: true });
    if (document.errors.length > 0 || !isMap(document.contents)) {
      throw new Error(`Invalid user desired-state YAML: ${fileName}`);
    }
    const user = stagedSiteUserSchema.parse(document.toJS());
    if (!user.siteOverride) continue;

    const pin = pins?.[user.handle];
    if (!pin) {
      throw new Error(
        `User ${user.handle} has a siteOverride but no reviewed site pin`,
      );
    }
    unusedPins.delete(user.handle);

    if (
      pin.package !== user.siteOverride.package ||
      pin.theme !== user.siteOverride.theme
    ) {
      throw new Error(
        `Reviewed site pin identity does not match user ${user.handle}`,
      );
    }
    if (
      user.siteOverride.version !== undefined &&
      user.siteOverride.version !== pin.version
    ) {
      throw new Error(
        `Reviewed site version does not match the existing pin for user ${user.handle}`,
      );
    }
    if (
      user.siteOverride.themeVersion !== undefined &&
      user.siteOverride.themeVersion !== pin.themeVersion
    ) {
      throw new Error(
        `Reviewed theme version does not match the existing pin for user ${user.handle}`,
      );
    }

    document.setIn(["siteOverride", "version"], pin.version);
    if (pin.themeVersion !== undefined) {
      document.setIn(["siteOverride", "themeVersion"], pin.themeVersion);
    } else {
      document.deleteIn(["siteOverride", "themeVersion"]);
    }
    userSchema.parse(document.toJS());
    const outputText = document.toString({ lineWidth: 0 });
    if (outputText !== input) {
      await writeFile(path, outputText);
      changedFiles.push(relative(output, path));
    }
  }

  if (unusedPins.size > 0) {
    throw new Error(
      `Reviewed site pins do not match site users: ${[...unusedPins].sort().join(", ")}`,
    );
  }
  return changedFiles;
}

/**
 * Build a complete review copy without mutating the source repository.
 * This is offline migration tooling; active desired-state loading is canonical-only.
 */
export async function stageLegacyCrossover(
  sourceDir: string,
  outputDir: string,
  options: StageLegacyCrossoverOptions = {},
): Promise<StagedCrossover> {
  const source = resolve(sourceDir);
  const output = resolve(outputDir);
  if (source === output || output.startsWith(`${source}/`)) {
    throw new Error("Crossover output must be outside the source repository");
  }

  await cp(source, output, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (path) => {
      const name = basename(path);
      return (
        name !== ".git" &&
        name !== ".operator" &&
        name !== ".brains-ops" &&
        name !== ".turbo" &&
        name !== "dist" &&
        name !== "node_modules" &&
        name !== ".env" &&
        name !== ".env.local" &&
        !name.endsWith(".secrets.yaml")
      );
    },
  });

  const changedFiles: string[] = [];
  const crossoverRecordPath = join(
    output,
    "docs",
    "canonical-crossover-record.md",
  );
  try {
    await access(crossoverRecordPath);
  } catch {
    await mkdir(join(output, "docs"), { recursive: true });
    await writeFile(
      crossoverRecordPath,
      await readFile(crossoverRecordTemplate, "utf8"),
    );
    changedFiles.push("docs/canonical-crossover-record.md");
  }

  const pilotPath = join(output, "pilot.yaml");
  const pilotInput = await readFile(pilotPath, "utf8");
  const pilotDocument = parseDocument(pilotInput);
  const pilotValue: unknown = pilotDocument.toJS();
  if (!isPlainRecord(pilotValue)) {
    throw new Error(`${pilotPath} is not a YAML mapping`);
  }
  const migratesCanonicalBundles = Array.isArray(pilotValue["bundles"]);
  const bundleReview = options.bundleReview;
  let pilotOutput: string;
  if (migratesCanonicalBundles) {
    if (!bundleReview) {
      throw new Error(
        "Current canonical desired state requires an explicit capability bundle review manifest",
      );
    }
    pilotOutput = migrateCanonicalPilotYaml(pilotInput, bundleReview.pilot);
  } else {
    pilotOutput = migrateLegacyPilotYaml(pilotInput);
  }
  await writeFile(pilotPath, pilotOutput);
  changedFiles.push("pilot.yaml");

  const cohortDirectory = join(output, "cohorts");
  const cohortFiles = (await readdir(cohortDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const reviewedCohorts = new Set(Object.keys(bundleReview?.cohorts ?? {}));
  for (const fileName of cohortFiles) {
    const path = join(cohortDirectory, fileName);
    const input = await readFile(path, "utf8");
    const cohortId = fileName.replace(/\.ya?ml$/, "");
    const review = bundleReview?.cohorts[cohortId];
    if (review) reviewedCohorts.delete(cohortId);
    await writeFile(
      path,
      migratesCanonicalBundles
        ? migrateCanonicalCohortYaml(input, cohortId, review)
        : migrateLegacyCohortYaml(input),
    );
    changedFiles.push(relative(output, path));
  }
  if (migratesCanonicalBundles && reviewedCohorts.size > 0) {
    throw new Error(
      `Capability bundle review names unknown cohorts: ${[...reviewedCohorts].sort().join(", ")}`,
    );
  }

  changedFiles.push(...(await applyReviewedSitePins(output, options.sitePins)));

  const registry = await loadPilotRegistry(output);
  const renderUser = createDefaultUserRunner(registry.pilot.githubOrg);
  for (const user of registry.users) {
    const result = await renderUser(user);
    const userDirectory = join(output, "users", user.handle);
    await mkdir(userDirectory, { recursive: true });
    if (result.brainYaml) {
      const path = join(userDirectory, "brain.yaml");
      await writeFile(path, result.brainYaml);
      changedFiles.push(relative(output, path));
    }
    if (result.envFile) {
      const path = join(userDirectory, ".env");
      await writeFile(path, result.envFile);
      changedFiles.push(relative(output, path));
    }
  }

  await writeUsersTable(output, { registry });
  changedFiles.push("views/users.md");

  return {
    outputDir: output,
    changedFiles: [...new Set(changedFiles)].sort(),
  };
}
