import { describe, expect, it as bunIt } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAndPackFixturePackage,
  combinedOutput,
  installPackedConsumer,
  packedCompatibilityEvidenceEnabled,
  packPackages,
  runCommand,
} from "./helpers/packed-consumer";
import { z } from "@brains/utils/zod";

const packageDirectory = join(import.meta.dir, "..");
const publicFixtureRoot = join(import.meta.dir, "fixtures", "public-authoring");
const entityFixture = join(publicFixtureRoot, "entity");
const serviceFixture = join(publicFixtureRoot, "service");
const accountInterfaceFixture = join(
  publicFixtureRoot,
  "account-settings-interface",
);
const operatorFixture = join(publicFixtureRoot, "operator-surface");
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring-operator-consumer",
);

const it = bunIt.skipIf(!packedCompatibilityEvidenceEnabled());

describe("public authoring Phase 6 packed operator contracts", () => {
  // Not gated on packed evidence: the consumer must keep naming every entry.
  bunIt("compiles every typed public entry without Node types", () => {
    const pkg = z
      .object({ exports: z.record(z.string(), z.unknown()) })
      .parse(
        JSON.parse(
          readFileSync(join(packageDirectory, "package.json"), "utf8"),
        ),
      );
    const typedEntries = Object.entries(pkg.exports)
      .filter(
        ([, entry]) =>
          typeof entry === "object" && entry !== null && "types" in entry,
      )
      .map(([subpath]) =>
        subpath === "." ? "@rizom/brain" : `@rizom/brain/${subpath.slice(2)}`,
      );
    const consumer = readFileSync(
      join(consumerFixture, "import-smoke.ts"),
      "utf8",
    );
    const tsconfig = z
      .object({ compilerOptions: z.record(z.string(), z.unknown()) })
      .parse(
        JSON.parse(
          readFileSync(join(consumerFixture, "tsconfig.json"), "utf8"),
        ),
      );

    expect(
      typedEntries.filter(
        (specifier) => !consumer.includes(`from "${specifier}";`),
      ),
    ).toEqual([]);
    expect(tsconfig.compilerOptions["skipLibCheck"]).toBe(false);
    expect(tsconfig.compilerOptions["types"]).toEqual([]);
  });

  it("installs Account, Dashboard, and Studio authoring together", async () => {
    const root = await mkdtemp(join(tmpdir(), "operator-packed-"));
    const packageTarballs = join(root, "packages");
    const fixtureStaging = join(root, "fixtures");
    const fixtureTarballs = join(root, "fixture-tarballs");
    const consumerDirectory = join(root, "consumer");

    try {
      const tarballs = new Map(
        await packPackages([packageDirectory], packageTarballs),
      );
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          entityFixture,
          fixtureStaging,
          fixtureTarballs,
          tarballs,
        )),
      );
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          serviceFixture,
          fixtureStaging,
          fixtureTarballs,
          tarballs,
        )),
      );
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          accountInterfaceFixture,
          fixtureStaging,
          fixtureTarballs,
          tarballs,
        )),
      );
      tarballs.set(
        ...(await buildAndPackFixturePackage(
          operatorFixture,
          fixtureStaging,
          fixtureTarballs,
          tarballs,
        )),
      );

      await installPackedConsumer(consumerFixture, consumerDirectory, tarballs);
      await runCommand(["bun", "run", "typecheck"], consumerDirectory, {
        timeoutMs: 120_000,
      });
      const smoke = combinedOutput(
        await runCommand(["bun", "run", "smoke"], consumerDirectory),
      );

      expect(smoke).not.toContain("did not compose");
      expect(tarballs.size).toBe(5);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 300_000);
});
