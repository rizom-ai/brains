/**
 * Before a test app boots: when its seed lives outside this repository, build
 * (or check) the content remote it boots from, with every agent withheld.
 * Usage, from the app's directory: bun ../../scripts/prepare-test-app-remote.ts
 */
import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { z } from "@brains/utils/zod";
import { parse as parseYaml } from "yaml";
import { prepareTestAppRemote } from "./test-app-remote";

const REPOSITORY_ROOT = resolve(import.meta.dir, "..", "..", "..");

const configSchema = z.object({
  plugins: z
    .object({
      "directory-sync": z
        .object({
          seedContentPath: z.string().optional(),
          git: z
            .object({
              gitUrl: z.string().optional(),
              branch: z.string().default("main"),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

const appDir = resolve(process.argv[2] ?? process.cwd());
const sync = configSchema.parse(
  parseYaml(readFileSync(join(appDir, "brain.yaml"), "utf8")),
).plugins?.["directory-sync"];
const seedPath = sync?.seedContentPath
  ? resolve(appDir, sync.seedContentPath)
  : undefined;
const gitUrl = sync?.git?.gitUrl;

if (
  seedPath &&
  !seedPath.startsWith(REPOSITORY_ROOT + sep) &&
  gitUrl?.startsWith("file://")
) {
  const result = await prepareTestAppRemote({
    seedPath,
    gitUrl,
    branch: sync?.git?.branch ?? "main",
  });
  console.log(
    result === "prepared"
      ? `Built ${gitUrl} from ${seedPath}, every agent withheld`
      : `Booting from ${gitUrl}: no agent the app can reach`,
  );
}
