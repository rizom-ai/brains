import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createTempDir } from "@brains/test-utils";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  preparePublishManifest,
  restorePublishManifest,
} from "../src/publish-manifest";
import { runWithPreparedPublishManifests } from "../src/publish-workspace";

async function createPackage(manifest: unknown): Promise<string> {
  const dir = await createTempDir("publish-manifest-");
  await writeFile(
    join(dir, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return dir;
}

async function readManifest(dir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
}

const manifest = {
  name: "@x/site",
  version: "1.0.0",
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      bun: "./src/index.ts",
      import: "./dist/index.js",
    },
  },
  publishExports: {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
  },
  dependencies: {
    "@x/base": "workspace:*",
    react: "^19.0.0",
  },
  publishPeerDependencies: {
    "@x/runtime": ">=1.0.0 <2.0.0",
  },
  devDependencies: {
    "@x/dev-only": "workspace:*",
  },
};

async function createWorkspaceDep(dir: string): Promise<void> {
  const depDir = join(dir, "node_modules/@x/base");
  await mkdir(depDir, { recursive: true });
  await writeFile(
    join(depDir, "package.json"),
    JSON.stringify({ name: "@x/base", version: "2.3.4" }),
  );
}

describe("preparePublishManifest", () => {
  test("produces a publishable manifest and restores the original", async () => {
    const dir = await createPackage(manifest);
    await createWorkspaceDep(dir);
    const original = await readFile(join(dir, "package.json"), "utf8");

    await preparePublishManifest(dir);
    const prepared = await readManifest(dir);

    expect(prepared["devDependencies"]).toBeUndefined();
    expect(prepared["publishPeerDependencies"]).toBeUndefined();
    expect(prepared["publishExports"]).toBeUndefined();
    expect(prepared["peerDependencies"]).toEqual({
      "@x/runtime": ">=1.0.0 <2.0.0",
    });
    expect(prepared["dependencies"]).toEqual({
      "@x/base": "2.3.4",
      react: "^19.0.0",
    });
    expect(prepared["exports"]).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    });

    await restorePublishManifest(dir);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(original);
    const backupRemains = await stat(
      join(dir, "package.json.publish-backup"),
    ).then(
      () => true,
      () => false,
    );
    expect(backupRemains).toBe(false);
  });

  test("is idempotent without overwriting the original backup", async () => {
    const dir = await createPackage(manifest);
    await createWorkspaceDep(dir);
    const original = await readFile(join(dir, "package.json"), "utf8");

    await preparePublishManifest(dir);
    const prepared = await readFile(join(dir, "package.json"), "utf8");
    await preparePublishManifest(dir);

    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(prepared);
    await restorePublishManifest(dir);
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(original);
  });

  test("resolves workspace versions from an explicit resolveFrom dir", async () => {
    const workspaceDir = await createPackage(manifest);
    await createWorkspaceDep(workspaceDir);
    const copyDir = await createPackage(manifest);

    await preparePublishManifest(copyDir, { resolveFrom: workspaceDir });
    const prepared = await readManifest(copyDir);
    expect(prepared["dependencies"]).toEqual({
      "@x/base": "2.3.4",
      react: "^19.0.0",
    });
  });

  test("fails when a workspace dependency version cannot be resolved", async () => {
    const dir = await createPackage(manifest);
    try {
      await preparePublishManifest(dir);
      expect.unreachable("expected preparePublishManifest to fail");
    } catch (error) {
      expect(String(error)).toContain("@x/base");
    }
  });

  test("restore fails when no backup exists unless ifPresent is set", async () => {
    const dir = await createPackage(manifest);
    try {
      await restorePublishManifest(dir);
      expect.unreachable("expected restorePublishManifest to fail");
    } catch (error) {
      expect(String(error)).toContain("backup");
    }

    await restorePublishManifest(dir, { ifPresent: true });
  });
});

describe("runWithPreparedPublishManifests", () => {
  test("restores source manifests after a successful publish", async () => {
    const dir = await createPackage(manifest);
    await createWorkspaceDep(dir);
    const original = await readFile(join(dir, "package.json"), "utf8");

    const result = await runWithPreparedPublishManifests([dir], async () => {
      const prepared = await readManifest(dir);
      expect(prepared["peerDependencies"]).toEqual({
        "@x/runtime": ">=1.0.0 <2.0.0",
      });
      return "published";
    });

    expect(result).toBe("published");
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(original);
  });

  test("restores source manifests when publishing fails", async () => {
    const dir = await createPackage(manifest);
    await createWorkspaceDep(dir);
    const original = await readFile(join(dir, "package.json"), "utf8");

    try {
      await runWithPreparedPublishManifests([dir], async () => {
        throw new Error("publish failed");
      });
      expect.unreachable("expected publishing to fail");
    } catch (error) {
      expect(String(error)).toContain("publish failed");
    }
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(original);
  });
});
