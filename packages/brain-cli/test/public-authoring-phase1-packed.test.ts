import { describe, expect, it as bunIt } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { z } from "@brains/utils/zod";
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

const packageDirectory = join(import.meta.dir, "..");
const entityFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring",
  "entity",
);
const brainFixture = join(import.meta.dir, "fixtures", "brain-definition");
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring-phase1-consumer",
);
const it = bunIt.skipIf(!packedCompatibilityEvidenceEnabled());

async function checkDocumentedPackage(
  directory: string,
  tarball: string,
): Promise<void> {
  const guide = await readFile(
    join(packageDirectory, "../../docs/external-plugin-authoring.md"),
    "utf8",
  );
  const json = [...guide.matchAll(/```json\n([\s\S]*?)\n```/gu)];
  const packageJson = json[0]?.[1];
  const tsconfig = json[1]?.[1];
  const source =
    /<!-- public-authoring-example: external-calendar-service -->\s*```ts\n([\s\S]*?)\n```/u.exec(
      guide,
    )?.[1];
  if (!packageJson || !tsconfig || !source)
    throw new Error("Missing documented package, tsconfig, or service");
  const manifest = z
    .object({ devDependencies: z.record(z.string(), z.string()) })
    .passthrough()
    .parse(JSON.parse(packageJson));
  // Only the local tarball location changes. Do not inject ambient types,
  // workspace paths, compiler flags, or skipLibCheck into this consumer.
  manifest.devDependencies["@rizom/brain"] = `file:${tarball}`;
  await mkdir(join(directory, "src"), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
  await writeFile(join(directory, "tsconfig.json"), tsconfig);
  await writeFile(join(directory, "src/index.ts"), source);
  await runCommand(["bun", "install"], directory);
  await runCommand(["bun", "run", "check"], directory);
  await runCommand(["bun", "run", "build"], directory);
  expect(await readFile(join(directory, "dist/index.d.ts"), "utf8")).toContain(
    "timezone",
  );
}

describe("public authoring Phase 1 packed canary", () => {
  it("builds, packs, installs, imports, and boots declarative definitions", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "public-authoring-phase1-"),
    );
    try {
      const tarballDirectory = join(temporaryDirectory, "tarballs");
      const tarballs = new Map(
        await packPackages([packageDirectory], tarballDirectory),
      );
      const brainTarball = tarballs.get("@rizom/brain");
      if (!brainTarball) throw new Error("Missing Brain tarball");
      await checkDocumentedPackage(
        join(temporaryDirectory, "documented-package"),
        brainTarball,
      );
      const entity = await buildAndPackFixturePackage(
        entityFixture,
        join(temporaryDirectory, "build"),
        tarballDirectory,
        tarballs,
      );
      tarballs.set(...entity);
      const brain = await buildAndPackFixturePackage(
        brainFixture,
        join(temporaryDirectory, "build"),
        tarballDirectory,
        tarballs,
      );
      tarballs.set(...brain);

      const consumerDirectory = join(temporaryDirectory, "consumer");
      await installPackedConsumer(consumerFixture, consumerDirectory, tarballs);
      await runCommand(["bun", "run", "import-smoke.ts"], consumerDirectory);
      const startup = await runCommand(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          env: {
            ...process.env,
            AI_API_KEY: "packed-startup-check",
          },
          timeoutMs: 90_000,
        },
      );

      expect(combinedOutput(startup)).toContain(
        "Default brain-character created successfully",
      );

      const listed = await runCommand(
        ["bun", "run", "brain", "list", "bookmark"],
        consumerDirectory,
        {
          env: {
            ...process.env,
            AI_API_KEY: "packed-startup-check",
          },
          timeoutMs: 90_000,
        },
      );
      expect(combinedOutput(listed)).toContain("[]");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);
});
