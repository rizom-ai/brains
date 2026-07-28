import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { fromYaml } from "@brains/utils/yaml";
import { createDefaultUserRunner } from "./default-user-runner";
import {
  migrateLegacyCohortConfig,
  migrateLegacyPilotConfig,
  renderCohortConfig,
  renderPilotConfig,
} from "./legacy-pilot-migration";
import { loadPilotRegistry } from "./load-registry";
import { writeUsersTable } from "./render-users-table";

export interface StagedCrossover {
  outputDir: string;
  changedFiles: string[];
}

/**
 * Build a complete review copy without mutating the source repository.
 * This is offline migration tooling; active desired-state loading is canonical-only.
 */
export async function stageLegacyCrossover(
  sourceDir: string,
  outputDir: string,
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
  const pilotPath = join(output, "pilot.yaml");
  const pilotInput = fromYaml<unknown>(await readFile(pilotPath, "utf8"));
  await writeFile(
    pilotPath,
    renderPilotConfig(migrateLegacyPilotConfig(pilotInput)),
  );
  changedFiles.push("pilot.yaml");

  const cohortDirectory = join(output, "cohorts");
  const cohortFiles = (await readdir(cohortDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const fileName of cohortFiles) {
    const path = join(cohortDirectory, fileName);
    const input = fromYaml<unknown>(await readFile(path, "utf8"));
    await writeFile(path, renderCohortConfig(migrateLegacyCohortConfig(input)));
    changedFiles.push(relative(output, path));
  }

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
