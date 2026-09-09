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

const root = join(import.meta.dir, "..", "..", "..");

describe("private bundled UI builds", () => {
  for (const fixture of [
    {
      workspace: "interfaces/web-chat",
      assets: ["app.js", "app.css", "app.js.map"],
    },
    {
      workspace: "plugins/studio",
      assets: ["studio-app.js", "studio-app.css", "studio-asset-manifest.json"],
    },
  ]) {
    it(`builds ${fixture.workspace} without touching dependency-owned assets`, async () => {
      const workspace = join(root, fixture.workspace);
      const snapshot = async (): Promise<unknown> =>
        Promise.all(
          fixture.assets.map(async (asset) => {
            const file = join(workspace, "dist", "ui", asset);
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
        for (const asset of fixture.assets) {
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
