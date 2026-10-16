import { describe, expect, it as bunIt } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  combinedOutput,
  installPackedConsumer,
  packedCompatibilityEvidenceEnabled,
  packPackages,
  runCommand,
} from "./helpers/packed-consumer";

const packageDirectory = join(import.meta.dir, "..");
const it = bunIt.skipIf(!packedCompatibilityEvidenceEnabled());

describe("packed PDF extraction dependencies", () => {
  it("loads PDF.js and its worker from the installed CLI dependency", async () => {
    const root = await mkdtemp(join(tmpdir(), "public-authoring-pdf-"));
    try {
      // Exercise the reviewed workspace resolutions, not newer range matches.
      // Overrides do not add dependencies: the packed CLI must declare PDF.js.
      const workspaceRequire = createRequire(import.meta.url);
      const pdfRequire = createRequire(
        workspaceRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
      );
      const versions: Record<string, string> = {};
      for (const name of ["pdfjs-dist", "@napi-rs/canvas"]) {
        const metadata = z
          .object({ version: z.string() })
          .parse(
            JSON.parse(
              await readFile(
                pdfRequire.resolve(`${name}/package.json`),
                "utf8",
              ),
            ),
          );
        versions[name] = metadata.version;
      }
      const tarballs = await packPackages(
        [packageDirectory],
        join(root, "tarballs"),
      );
      const consumer = join(root, "consumer");
      await installPackedConsumer(
        join(import.meta.dir, "fixtures/pdf-consumer"),
        consumer,
        tarballs,
        versions,
      );
      const result = await runCommand(["bun", "run", "smoke"], consumer);
      expect(combinedOutput(result)).toContain(
        `packed-pdf-extraction-ok:${versions["pdfjs-dist"]}`,
      );
      expect(tarballs.has("@rizom/brain")).toBeTrue();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 300_000);
});
