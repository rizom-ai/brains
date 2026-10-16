import { describe, expect, it } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempDir } from "@brains/test-utils";
import type { RunCommand } from "@brains/deploy-support/run-subprocess";
import type { RequiredImage } from "../src/image-types";
import {
  assertRuntimeImageLock,
  lockRuntimeImage,
  runtimeImageLockDirectory,
} from "../src/runtime-image-lock";
import { parseArgs, runCommand } from "../src/index";

const image: RequiredImage = {
  tag: "brain-0.2.0-alpha.552",
  brainVersion: "0.2.0-alpha.552",
  sitePackages: [],
};

function fakeResolver(calls: string[] = []): RunCommand {
  return async (command, args, options) => {
    calls.push(`${command} ${args.join(" ")}`);
    if (args.includes("--lockfile-only")) {
      await writeFile(
        join(options?.cwd ?? "", "bun.lock"),
        "test-resolver-lock\n",
      );
    }
  };
}

async function fixture(): Promise<{ root: string; directory: string }> {
  const root = await createTempDir("runtime-image-lock-");
  return { root, directory: join(root, runtimeImageLockDirectory(image)) };
}

describe("runtime image dependency locks", () => {
  it("creates exact reviewed inputs with the parser fix and disables lifecycle scripts", async () => {
    const { root, directory } = await fixture();
    const calls: string[] = [];
    expect(await lockRuntimeImage(root, image, fakeResolver(calls))).toBe(
      "created",
    );
    expect(
      JSON.parse(await readFile(join(directory, "package.json"), "utf8")),
    ).toEqual({
      name: "rover-pilot-runtime",
      private: true,
      packageManager: "bun@1.4.0",
      dependencies: { "@rizom/brain": "0.2.0-alpha.552" },
      overrides: { "postcss-selector-parser": "7.1.6" },
    });
    expect(calls).toEqual([
      `${process.execPath} install --lockfile-only --ignore-scripts`,
      `${process.execPath} install --frozen-lockfile --ignore-scripts --dry-run`,
    ]);
    expect(await assertRuntimeImageLock(root, image)).toBeUndefined();
    await rejects(readFile(join(directory, ".incomplete")), /ENOENT/);
  });

  it("never resolves or overwrites an existing entry", async () => {
    const { root, directory } = await fixture();
    await lockRuntimeImage(root, image, fakeResolver());
    const before = await readFile(join(directory, "bun.lock"), "utf8");
    const calls: string[] = [];
    expect(await lockRuntimeImage(root, image, fakeResolver(calls))).toBe(
      "existing",
    );
    expect(calls).toHaveLength(0);
    expect(await readFile(join(directory, "bun.lock"), "utf8")).toBe(before);
  });

  it("fences a concurrent generator without overwriting its reserved entry", async () => {
    const { root } = await fixture();
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const first = lockRuntimeImage(
      root,
      image,
      async (command, args, options) => {
        if (args.includes("--lockfile-only")) {
          started.resolve();
          await release.promise;
        }
        await fakeResolver()(command, args, options);
      },
    );
    await started.promise;
    try {
      await rejects(
        lockRuntimeImage(root, image, fakeResolver()),
        /Incomplete/,
      );
    } finally {
      release.resolve();
    }
    expect(await first).toBe("created");
    expect(await assertRuntimeImageLock(root, image)).toBeUndefined();
  });

  it("locks exactly the selected site and theme pins, never the fleet union", async () => {
    const { root } = await fixture();
    const siteImage = {
      ...image,
      tag: "brain-552--site",
      sitePackages: ["@acme/theme-default@1.2.3", "@rizom/site-default@4.5.6"],
    };
    await lockRuntimeImage(root, siteImage, fakeResolver());
    const manifest = JSON.parse(
      await readFile(
        join(root, runtimeImageLockDirectory(siteImage), "package.json"),
        "utf8",
      ),
    );
    expect(manifest.dependencies).toEqual({
      "@rizom/brain": image.brainVersion,
      "@rizom/site-default": "4.5.6",
      "@acme/theme-default": "1.2.3",
    });
  });

  it("rejects conflicting pins, non-exact versions, and path traversal before running Bun", async () => {
    const { root } = await fixture();
    const calls: string[] = [];
    for (const invalid of [
      { ...image, tag: "../../outside" },
      { ...image, brainVersion: "latest" },
      { ...image, sitePackages: ["@rizom/site-default@^1.2.3"] },
      { ...image, sitePackages: ["@rizom/site-default@https://example.com/x"] },
      { ...image, sitePackages: ["@rizom/brain@1.2.3"] },
      {
        ...image,
        sitePackages: [
          "@rizom/site-default@1.2.3",
          "@rizom/site-default@1.2.4",
        ],
      },
    ]) {
      await rejects(lockRuntimeImage(root, invalid, fakeResolver(calls)));
    }
    expect(calls).toHaveLength(0);
  });

  it("retains failed resolution evidence and refuses to reuse its incomplete entry", async () => {
    const { root, directory } = await fixture();
    await rejects(
      lockRuntimeImage(root, image, async () => {
        throw new Error("resolver unavailable");
      }),
      /resolver unavailable/,
    );
    expect(await readFile(join(directory, ".incomplete"), "utf8")).toContain(
      "not completed",
    );
    await rejects(assertRuntimeImageLock(root, image), /Incomplete/);
    await rejects(lockRuntimeImage(root, image, fakeResolver()), /Incomplete/);
  });

  it("retains the incomplete marker when frozen validation fails", async () => {
    const { root, directory } = await fixture();
    await rejects(
      lockRuntimeImage(root, image, async (command, args, options) => {
        if (args.includes("--dry-run"))
          throw new Error("lockfile would change");
        await fakeResolver()(command, args, options);
      }),
      /lockfile would change/,
    );
    expect(await readFile(join(directory, "bun.lock"), "utf8")).toContain(
      "test-resolver-lock",
    );
    await rejects(assertRuntimeImageLock(root, image), /Incomplete/);
  });

  it("rejects a symlinked lock parent without writing through it", async () => {
    const root = await createTempDir("runtime-image-parent-");
    const outside = await createTempDir("runtime-image-outside-");
    await symlink(outside, join(root, "deploy"));
    const calls: string[] = [];
    await rejects(
      lockRuntimeImage(root, image, fakeResolver(calls)),
      /must be a directory/,
    );
    expect(calls).toHaveLength(0);
    await rejects(
      readFile(join(outside, "runtime", image.tag, "package.json")),
      /ENOENT/,
    );
  });

  it("rejects missing, empty, tampered, or symlinked inputs", async () => {
    const { root, directory } = await fixture();
    await rejects(assertRuntimeImageLock(root, image), /ENOENT/);
    await lockRuntimeImage(root, image, fakeResolver());
    await writeFile(join(directory, "bun.lock"), "\n");
    await rejects(assertRuntimeImageLock(root, image), /Empty/);
    await writeFile(join(directory, "bun.lock"), "test-resolver-lock\n");
    const manifestPath = join(directory, "package.json");
    const valid = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(
      manifestPath,
      JSON.stringify({ ...valid, scripts: { postinstall: "unexpected" } }),
    );
    await rejects(assertRuntimeImageLock(root, image), /Unrecognized key/);
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...valid,
        dependencies: { "@rizom/brain": "0.2.0-alpha.551" },
      }),
    );
    await rejects(assertRuntimeImageLock(root, image), /does not match/);
    const otherRoot = await createTempDir("runtime-image-symlink-");
    await mkdir(join(otherRoot, "deploy", "runtime"), { recursive: true });
    await symlink(directory, join(otherRoot, runtimeImageLockDirectory(image)));
    await rejects(
      assertRuntimeImageLock(otherRoot, image),
      /must be a directory/,
    );
  });

  it("exposes a planning-only CLI command and rejects site pins without a version", async () => {
    const parsed = parseArgs([
      "images:lock",
      "/tmp/pilot",
      "--brain-version",
      image.brainVersion,
      "--site-packages",
      "@rizom/site-default@1.2.3",
    ]);
    expect(parsed.command).toBe("images:lock");
    expect(parsed.flags["brain-version"]).toBe(image.brainVersion);
    const result = await runCommand(
      parseArgs([
        "images:lock",
        "/tmp/pilot",
        "--site-packages",
        "@rizom/site-default@1.2.3",
      ]),
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("Usage:");
    await rejects(
      runCommand(
        parseArgs(["images:lock", "/tmp/pilot", "--brain-version", ""]),
      ),
      /expected exact pinned version/,
    );
  });

  it("generates locks through the CLI without invoking an infrastructure command", async () => {
    const root = await createTempDir("runtime-image-cli-");
    await mkdir(join(root, "users"));
    await mkdir(join(root, "cohorts"));
    await writeFile(
      join(root, "pilot.yaml"),
      `brainVersion: 0.2.0-alpha.508
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles: [core]
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
    );
    await writeFile(
      join(root, "users", "alice.yaml"),
      "handle: alice\ndiscord:\n  enabled: false\n",
    );
    await writeFile(join(root, "cohorts", "pilot.yaml"), "members: [alice]\n");
    const calls: string[] = [];
    const result = await runCommand(
      parseArgs(["images:lock", root, "--brain-version", image.brainVersion]),
      { imageLockRunCommand: fakeResolver(calls) },
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain(`created: ${image.tag}`);
    expect(calls).toHaveLength(2);
    expect(
      calls.every((call) => call.startsWith(`${process.execPath} install `)),
    ).toBe(true);
    expect(await assertRuntimeImageLock(root, image)).toBeUndefined();
  });
});
