import { expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAndPackFixturePackage,
  combinedOutput,
  installPackedConsumer,
  registryEvidenceEnabled,
  runCommand,
  type RegistryPackageVersions,
} from "./helpers/packed-consumer";

const publicFixtureRoot = join(import.meta.dir, "fixtures", "public-authoring");
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring-registry-consumer",
);
const runRegistryEvidence = registryEvidenceEnabled();
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

function requiredVersion(variable: string, pattern: RegExp): string {
  const value = process.env[variable];
  if (!value || !exactVersionPattern.test(value) || !pattern.test(value)) {
    throw new Error(
      `${variable} must name one exact nominated version matching ${pattern}`,
    );
  }
  return value;
}

async function packageManifest(
  consumerDirectory: string,
  packageName: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(
      join(consumerDirectory, "node_modules", packageName, "package.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

async function declarationText(directory: string): Promise<string> {
  const entries = await readdir(directory, { recursive: true });
  const declarations = entries.filter((entry) => entry.endsWith(".d.ts"));
  return (
    await Promise.all(
      declarations.map((entry) => readFile(join(directory, entry), "utf8")),
    )
  ).join("\n");
}

it.skipIf(!runRegistryEvidence)(
  "packs all six authoring packages against one nominated published alpha",
  async () => {
    const brainVersion = requiredVersion(
      "RIZOM_PUBLIC_API_BRAIN_VERSION",
      /^0\.2\.0-alpha\.\d+$/u,
    );
    const siteVersion = requiredVersion(
      "RIZOM_PUBLIC_API_SITE_VERSION",
      /^0\.2\.0(?:-alpha\.\d+)?$/u,
    );
    const registryVersions: RegistryPackageVersions = {
      "@rizom/brain": brainVersion,
      "@rizom/site": siteVersion,
    };
    const expectedBrainPeer = `>=${brainVersion} <0.3.0`;
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "public-authoring-registry-"),
    );

    try {
      const tarballDirectory = join(temporaryDirectory, "tarballs");
      const stagingDirectory = join(temporaryDirectory, "build");
      const tarballs = new Map<string, string>();
      for (const fixtureName of [
        "entity",
        "service",
        "site",
        "interface",
        "message-interface",
        "brain-definition",
      ]) {
        const fixtureDirectory = join(publicFixtureRoot, fixtureName);
        const fixtureManifest = JSON.parse(
          await readFile(join(fixtureDirectory, "package.json"), "utf8"),
        ) as {
          peerDependencies?: Record<string, string>;
        };
        expect(fixtureManifest.peerDependencies?.["@rizom/brain"]).toBe(
          expectedBrainPeer,
        );
        const packed = await buildAndPackFixturePackage(
          fixtureDirectory,
          stagingDirectory,
          tarballDirectory,
          tarballs,
          registryVersions,
        );
        tarballs.set(...packed);
      }
      expect(tarballs.size).toBe(6);

      const consumerDirectory = join(temporaryDirectory, "consumer");
      await installPackedConsumer(
        consumerFixture,
        consumerDirectory,
        tarballs,
        registryVersions,
      );

      const brainManifest = await packageManifest(
        consumerDirectory,
        "@rizom/brain",
      );
      const siteManifest = await packageManifest(
        consumerDirectory,
        "@rizom/site",
      );
      expect(brainManifest["version"]).toBe(brainVersion);
      expect(brainManifest["license"]).toBe("AGPL-3.0-only");
      expect(siteManifest["version"]).toBe(siteVersion);
      expect(siteManifest["license"]).toBe("Apache-2.0");
      expect(brainManifest["exports"]).not.toHaveProperty("./site");

      const brainDeclarations = await declarationText(
        join(consumerDirectory, "node_modules", "@rizom", "brain", "dist"),
      );
      expect(brainDeclarations).not.toContain('from "@brains/');
      const siteSource = await readFile(
        join(
          consumerDirectory,
          "node_modules",
          "@rizom",
          "site",
          "src",
          "index.ts",
        ),
        "utf8",
      );
      expect(siteSource).toContain("export function defineSite");
      expect(siteSource).toContain("export function defineSection");
      expect(siteSource).not.toContain("RizomFrameProps");

      await runCommand(["bun", "run", "import-smoke.ts"], consumerDirectory);
      const startup = await runCommand(
        ["bun", "run", "brain", "start", "--startup-check"],
        consumerDirectory,
        {
          env: {
            ...process.env,
            AI_API_KEY: "registry-startup-check",
            BRAIN_SKIP_LOCAL_REEXEC: "1",
          },
          timeoutMs: 120_000,
        },
      );
      expect(combinedOutput(startup)).toContain(
        "Default brain-character created successfully",
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  },
  300_000,
);
