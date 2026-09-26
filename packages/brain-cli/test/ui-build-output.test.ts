import { describe, expect, it } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "@brains/utils/zod";

async function studioManifestAssets(directory: string): Promise<string[]> {
  const file = Bun.file(join(directory, "studio-asset-manifest.json"));
  if (!(await file.exists())) return [];
  const manifest = z
    .object({
      version: z.literal(2),
      entrypoints: z.object({ script: z.string(), stylesheet: z.string() }),
      assets: z.record(z.string(), z.string()),
    })
    .parse(await file.json());
  expect(manifest.entrypoints.script).toMatch(/^studio-app-[a-zA-Z0-9]+\.js$/);
  expect(manifest.entrypoints.stylesheet).toMatch(
    /^studio-app-[a-zA-Z0-9]+\.css$/,
  );
  expect(manifest.assets[manifest.entrypoints.script]).toBe(
    manifest.entrypoints.script,
  );
  expect(manifest.assets[manifest.entrypoints.stylesheet]).toBe(
    manifest.entrypoints.stylesheet,
  );
  return Object.values(manifest.assets);
}

const root = join(import.meta.dir, "..", "..", "..");

describe("private bundled UI builds", () => {
  for (const fixture of [
    {
      workspace: "interfaces/web-chat",
      assets: ["app", "guest", "dashboard"].flatMap((entry) => [
        `${entry}.js`,
        `${entry}.css`,
        `${entry}.js.map`,
      ]),
    },
    {
      workspace: "plugins/studio",
      assets: ["studio-asset-manifest.json"],
    },
  ]) {
    it(`builds ${fixture.workspace} without touching dependency-owned assets`, async () => {
      const workspace = join(root, fixture.workspace);
      const defaultDirectory = join(workspace, "dist", "ui");
      const protectedAssets = [
        ...fixture.assets.map((asset) => join(defaultDirectory, asset)),
        ...(fixture.workspace === "plugins/studio"
          ? (await studioManifestAssets(defaultDirectory)).map((asset) =>
              join(defaultDirectory, asset),
            )
          : []),
        ...(fixture.workspace === "plugins/studio"
          ? [
              join(root, "shared/operator-view-react/dist/index.js"),
              join(root, "shared/operator-view-react/dist/stylex.css"),
            ]
          : []),
      ];
      const snapshot = async (): Promise<unknown> =>
        Promise.all(
          protectedAssets.map(async (file) => {
            const asset = file;
            if (!(await Bun.file(file).exists()))
              return { asset, exists: false };
            const info = await stat(file);
            return {
              asset,
              exists: true,
              ino: info.ino,
              mtimeMs: info.mtimeMs,
            };
          }),
        );
      const before = await snapshot();
      const directory = await mkdtemp(join(tmpdir(), "private-ui-"));
      try {
        const destination = join(directory, "output");
        await mkdir(destination);
        await writeFile(join(destination, "keep.txt"), "caller-owned");
        const process = Bun.spawn(
          ["bun", "run", "build", "--outdir", destination],
          {
            cwd: workspace,
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        const [code, stdout, stderr] = await Promise.all([
          process.exited,
          new Response(process.stdout).text(),
          new Response(process.stderr).text(),
        ]);
        expect({
          code,
          error: code === 0 ? "" : `${stdout}\n${stderr}`,
        }).toEqual({ code: 0, error: "" });
        const assets = [
          ...fixture.assets,
          ...(fixture.workspace === "plugins/studio"
            ? await studioManifestAssets(destination)
            : []),
        ];
        for (const asset of assets) {
          expect(
            (await readFile(join(destination, asset))).length,
          ).toBeGreaterThan(0);
        }
        expect(await readFile(join(destination, "keep.txt"), "utf8")).toBe(
          "caller-owned",
        );
        expect(await snapshot()).toEqual(before);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }, 15_000);
  }
});
