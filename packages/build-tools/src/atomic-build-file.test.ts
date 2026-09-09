import { describe, expect, it } from "bun:test";
import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { writeBuildFileAtomically } from "./atomic-build-file";

describe("atomic build artifacts", () => {
  it("keeps an already-open reader on the old complete artifact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "atomic-build-"));
    const destination = join(directory, "app.js");
    try {
      await writeBuildFileAtomically(destination, "old complete bundle");
      const reader = await open(destination, "r");
      try {
        await writeBuildFileAtomically(destination, "new complete bundle");
        expect(await reader.readFile("utf8")).toBe("old complete bundle");
        expect(await readFile(destination, "utf8")).toBe("new complete bundle");
      } finally {
        await reader.close();
      }
      expect(await readdir(directory)).toEqual(["app.js"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("publishes staged Bun outputs without replacing assets when compilation fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "atomic-bundle-"));
    const entry = join(directory, "entry.js");
    const destination = join(directory, "dist", "app.js");
    const staging = join(directory, "staging");
    try {
      await writeBuildFileAtomically(destination, "previous bundle");
      const build = (): Promise<Bun.BuildOutput> =>
        Bun.build({
          entrypoints: [entry],
          outdir: staging,
          naming: "app.js",
          sourcemap: "external",
          throw: false,
        });
      await writeFile(entry, "export const value = ;");
      const failed = await build();
      expect(failed.success).toBe(false);
      expect(await readFile(destination, "utf8")).toBe("previous bundle");
      await writeFile(entry, 'export const value = "new";');
      const result = await build();
      expect(result.success).toBe(true);
      expect(result.outputs).toHaveLength(2);
      const reader = await open(destination, "r");
      try {
        for (const output of result.outputs) {
          await writeBuildFileAtomically(
            join(directory, "dist", relative(staging, output.path)),
            new Uint8Array(await output.arrayBuffer()),
          );
        }
        expect(await reader.readFile("utf8")).toBe("previous bundle");
        expect(await readFile(destination, "utf8")).toContain('"new"');
        expect(await Bun.file(`${destination}.map`).json()).toMatchObject({
          sources: ["../entry.js"],
        });
      } finally {
        await reader.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("cleans staging files on publication failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "atomic-failure-"));
    try {
      const destination = join(directory, "occupied");
      await mkdir(destination);
      const failure = await writeBuildFileAtomically(
        destination,
        "bundle",
      ).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(await readdir(directory)).toEqual(["occupied"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
