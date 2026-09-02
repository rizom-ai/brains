import { describe, expect, it as bunIt } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  combinedOutput,
  installPackedConsumer,
  packedCompatibilityEvidenceEnabled,
  packPackages,
  runCommand,
} from "./helpers/packed-consumer";

const packageDirectory = join(import.meta.dir, "..");
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-chat-consumer",
);
const it = bunIt.skipIf(!packedCompatibilityEvidenceEnabled());

describe("packed public headless Chat contract", () => {
  it("typechecks and runs from the exact packed @rizom/brain export", async () => {
    const root = await mkdtemp(join(tmpdir(), "public-chat-packed-"));
    const packageTarballs = join(root, "packages");
    const consumerDirectory = join(root, "consumer");

    try {
      const tarballs = await packPackages([packageDirectory], packageTarballs);
      await installPackedConsumer(consumerFixture, consumerDirectory, tarballs);
      await runCommand(["bun", "run", "typecheck"], consumerDirectory, {
        timeoutMs: 120_000,
      });
      await runCommand(
        [
          "bun",
          "build",
          "src/index.ts",
          "--target=browser",
          "--outfile=chat-browser.js",
        ],
        consumerDirectory,
      );
      const browserBundle = await readFile(
        join(consumerDirectory, "chat-browser.js"),
        "utf8",
      );
      const smoke = combinedOutput(
        await runCommand(["bun", "run", "smoke"], consumerDirectory),
      );

      expect(smoke).toContain("public-chat-contract-ok");
      expect(browserBundle).not.toContain("@brains/");
      expect(browserBundle).not.toContain('from "react');
      expect(browserBundle).not.toContain("Bun.");
      expect(tarballs.has("@rizom/brain")).toBeTrue();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 300_000);
});
