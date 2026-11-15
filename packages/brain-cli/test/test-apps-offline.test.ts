import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isSafeSeedAgentUrl } from "@brains/ai-evaluation";
import {
  prepareTestAppRemote,
  remoteAgentProblems,
} from "../scripts/test-app-remote";
import { z } from "@brains/utils/zod";
import { parse as parseYaml } from "yaml";

const REPOSITORY_ROOT = resolve(import.meta.dir, "..", "..", "..");
const TEST_APPS = join(import.meta.dir, "..", "test-apps");
const URL_VALUE = /^(?:https?|wss?):\/\//;
const START_SCRIPT = readFileSync(
  join(import.meta.dir, "..", "scripts", "start-test-app.sh"),
  "utf8",
);

/** A host a test app may name: a reserved `.example` host or loopback. */
function isOfflineHost(hostname: string): boolean {
  return isSafeSeedAgentUrl(`https://${hostname}/`);
}

/** The part of a test app's brain.yaml that decides where its peers come from. */
const testAppConfigSchema = z.object({
  remove: z.array(z.string()).optional(),
  plugins: z
    .object({
      "directory-sync": z
        .object({
          seedContent: z.boolean().optional(),
          seedContentPath: z.string().optional(),
          git: z
            .object({
              gitUrl: z.string().optional(),
              branch: z.string().optional(),
              bootstrapFromSeed: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

interface TestApp {
  name: string;
  dir: string;
  /** The whole brain.yaml, as parsed. */
  raw: unknown;
  config: z.output<typeof testAppConfigSchema>;
}

const testApps: TestApp[] = readdirSync(TEST_APPS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(TEST_APPS, entry.name))
  .filter((dir) => existsSync(join(dir, "brain.yaml")))
  .map((dir) => {
    const raw: unknown = parseYaml(
      readFileSync(join(dir, "brain.yaml"), "utf8"),
    );
    return {
      name: relative(TEST_APPS, dir),
      dir,
      raw,
      config: testAppConfigSchema.parse(raw),
    };
  });

/** Every string a config holds, at any depth, with its key path. */
function configStrings(
  value: unknown,
  path: string,
): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      configStrings(item, `${path}[${index}]`),
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      configStrings(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

/** Every `agent/` directory under a seed, at any depth. */
function agentDirectories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== ".git")
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.name === "agent" ? [path] : agentDirectories(path);
    });
}

/** The hosts a seed agent sends a brain to: its id is the peer's domain. */
function seedAgentProblems(seed: string): string[] {
  return agentDirectories(seed).flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => file.endsWith(".md"))
      .flatMap((file) => {
        const path = relative(REPOSITORY_ROOT, join(dir, file));
        const text = readFileSync(join(dir, file), "utf8");
        const id = file.slice(0, -".md".length);
        const url = /^url: ["']?([^"'\n]+)["']?$/m.exec(text)?.[1];
        return [
          ...(isOfflineHost(id) ? [] : [`${path}: peer id ${id}`]),
          ...(url && isOfflineHost(new URL(url).hostname)
            ? []
            : [`${path}: url ${url ?? "(none)"}`]),
          // An ATProto card is refreshed through plc.directory and a real PDS.
          ...(/^(?:repoDid|cardUri):/m.test(text)
            ? [`${path}: ATProto card reference`]
            : []),
        ];
      }),
  );
}

describe("canonical test apps stay offline", () => {
  it("are all found", () => {
    expect(testApps.map(({ name }) => name)).toContain("publishing");
  });

  for (const app of testApps) {
    describe(app.name, () => {
      it("names no real host in its config", () => {
        const offending = configStrings(app.raw, "")
          .filter(({ value }) => URL_VALUE.test(value))
          .filter(({ value }) => !isOfflineHost(new URL(value).hostname))
          .map(({ path, value }) => `${path}: ${value}`);
        expect(offending).toEqual([]);
      });

      it("syncs content through a local remote", () => {
        const git = app.config.plugins?.["directory-sync"]?.git;
        if (git === undefined) return;
        expect(git.gitUrl ?? "").toStartWith("file://");
      });

      it("seeds offline peers only", async () => {
        const sync = app.config.plugins?.["directory-sync"];
        if (sync?.seedContentPath === undefined) return;
        const seed = resolve(app.dir, sync.seedContentPath);
        if (seed.startsWith(REPOSITORY_ROOT + sep)) {
          expect(seedAgentProblems(seed)).toEqual([]);
          return;
        }
        // A seed outside this repository can carry real peers. The brain never
        // reads it: it boots from the remote the start script prepares, with
        // every agent withheld.
        expect(sync.seedContent).toBe(false);
        expect(sync.git?.bootstrapFromSeed).toBe(false);
        expect(START_SCRIPT).toContain("prepare-test-app-remote.ts");
        const gitUrl = sync.git?.gitUrl ?? "";
        const branch = sync.git?.branch ?? "main";
        if (existsSync(fileURLToPath(gitUrl))) {
          expect(await remoteAgentProblems(gitUrl, branch)).toEqual([]);
        }
        if (!existsSync(seed)) return;
        const scratch = mkdtempSync(join(tmpdir(), "test-app-remote-"));
        try {
          const prepared = `file://${join(scratch, "content.git")}`;
          await prepareTestAppRemote({
            seedPath: seed,
            gitUrl: prepared,
            branch,
          });
          expect(await remoteAgentProblems(prepared, branch)).toEqual([]);
        } finally {
          rmSync(scratch, { recursive: true, force: true });
        }
      });
    });
  }
});
