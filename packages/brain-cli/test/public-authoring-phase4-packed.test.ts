import { describe, expect, it as bunIt } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import {
  buildAndPackFixturePackage,
  combinedOutput,
  installPackedConsumer,
  packedCompatibilityEvidenceEnabled,
  packPackages,
  runCommand,
  startCommand,
  stopProcess,
  type StartedCommand,
} from "./helpers/packed-consumer";

const brainPackageDirectory = join(import.meta.dir, "..");
const siteSdkDirectory = join(import.meta.dir, "../../site");
const siteFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring",
  "site",
);
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring-phase4-consumer",
);

const it = bunIt.skipIf(!packedCompatibilityEvidenceEnabled());
const remoteToken = "packed-phase4-static-operator-token-0001";
const runtimeEnv = {
  ...process.env,
  AI_API_KEY: "packed-hermetic-runtime",
  MCP_AUTH_TOKEN: remoteToken,
  BRAIN_SKIP_LOCAL_REEXEC: "1",
};

function startRuntime(consumerDirectory: string): StartedCommand {
  return startCommand(["bun", "run", "brain", "start"], consumerDirectory, {
    env: runtimeEnv,
  });
}

async function stopRuntime(runtime: StartedCommand): Promise<string> {
  await stopProcess(runtime.process, 10_000);
  return combinedOutput(await runtime.completed);
}

const publishedBuildMarker =
  "Emitting site:build:completed event for preview environment";
const unchangedBuildMarker =
  "Skipping site render because inputs are unchanged";

function markerCount(output: string, marker: string): number {
  return output.split(marker).length - 1;
}

function buildSettlementCount(runtime: StartedCommand): number {
  const output = combinedOutput(runtime.getOutput());
  return (
    markerCount(output, publishedBuildMarker) +
    markerCount(output, unchangedBuildMarker)
  );
}

async function waitForAdditionalBuildSettlement(
  runtime: StartedCommand,
  previousCount: number,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (buildSettlementCount(runtime) > previousCount) return;
    await Bun.sleep(250);
  }
  throw new Error(
    `Triggered preview build did not settle\n${combinedOutput(runtime.getOutput())}`,
  );
}

async function waitForBuiltFile(
  path: string,
  expected: string,
  runtime: StartedCommand,
): Promise<string> {
  const deadline = Date.now() + 60_000;
  let diagnostic = "site output was not read";
  while (Date.now() < deadline) {
    try {
      const content = await readFile(path, "utf8");
      diagnostic = content;
      if (content.includes(expected)) return content;
    } catch (error) {
      diagnostic = getErrorMessage(error);
    }
    await Bun.sleep(250);
  }
  throw new Error(
    `Site output ${path} did not contain ${JSON.stringify(expected)}\n${diagnostic}\n--- runtime ---\n${combinedOutput(runtime.getOutput())}`,
  );
}

describe("public authoring Phase 4 packed site contract", () => {
  it("builds every stable one-import site field through the running app", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "public-authoring-phase4-"),
    );
    let runtime: StartedCommand | undefined;
    try {
      const tarballDirectory = join(temporaryDirectory, "tarballs");
      const tarballs = new Map(
        await packPackages(
          [brainPackageDirectory, siteSdkDirectory],
          tarballDirectory,
        ),
      );
      const site = await buildAndPackFixturePackage(
        siteFixture,
        join(temporaryDirectory, "build"),
        tarballDirectory,
        tarballs,
      );
      tarballs.set(...site);

      const consumerDirectory = join(temporaryDirectory, "consumer");
      await installPackedConsumer(consumerFixture, consumerDirectory, tarballs);
      await runCommand(
        [
          "bun",
          "-e",
          `import assert from "node:assert/strict";
          import site from "@fixture/reading-site";
          import { defineSite, entityDisplaySchema } from "@rizom/site";
          assert.deepEqual(entityDisplaySchema.parse({ label: "Excluded", citable: false }), { label: "Excluded", citable: false });
          assert.throws(() => entityDisplaySchema.parse({ label: "Invalid", citable: "false" }));
          assert.throws(() => entityDisplaySchema.parse({ label: "Typo", citabel: false }));
          assert.equal(site.entityDisplay.bookmark.citable, true);
          assert.equal(site.entityDisplay["reading-digest"].citable, false);
          const excluded = defineSite({ ...site, entityDisplay: { bookmark: { label: "Bookmark", citable: false } } });
          assert.equal(excluded.entityDisplay.bookmark.citable, false);`,
        ],
        consumerDirectory,
      );

      const generatedSourceDirectory = join(consumerDirectory, "generated");
      await runCommand(
        [
          "bun",
          "run",
          "brain",
          "init",
          "generated",
          "--recipe",
          "professional",
        ],
        consumerDirectory,
        { env: runtimeEnv, timeoutMs: 90_000 },
      );
      const generatedSite = await readFile(
        join(generatedSourceDirectory, "src/site.tsx"),
        "utf8",
      );
      expect(generatedSite).toContain('from "@rizom/site"');
      expect(generatedSite).toContain("export default defineSite");

      const generatedConsumerDirectory = join(
        temporaryDirectory,
        "generated-consumer",
      );
      await installPackedConsumer(
        generatedSourceDirectory,
        generatedConsumerDirectory,
        tarballs,
      );
      // Advanced export probe stays outside the stable-only golden package.
      await writeFile(
        join(generatedConsumerDirectory, "src/entity-display-canary.ts"),
        `import { entityDisplaySchema, type EntityDisplayEntry } from "@rizom/site";
         export const parsed: EntityDisplayEntry = entityDisplaySchema.parse({ label: "Excluded", citable: false });
         export const citable: boolean | undefined = parsed.citable;`,
      );
      await runCommand(
        ["bun", "x", "tsc", "--noEmit"],
        generatedConsumerDirectory,
        { timeoutMs: 120_000 },
      );

      runtime = startRuntime(consumerDirectory);
      await runtime.waitForOutput("Brain worker runtime ready", 60_000);

      await runtime.waitForOutput(publishedBuildMarker, 60_000);
      const settledBuilds = buildSettlementCount(runtime);
      let request: string;
      try {
        request = combinedOutput(
          await runCommand(
            [
              "bun",
              "run",
              "brain",
              "build-site",
              "--environment",
              "preview",
              "--remote",
              "http://127.0.0.1:8085",
              "--token",
              remoteToken,
            ],
            consumerDirectory,
            { env: runtimeEnv, timeoutMs: 90_000 },
          ),
        );
      } catch (error) {
        throw new Error(
          `${getErrorMessage(error)}\n--- runtime ---\n${combinedOutput(runtime.getOutput())}`,
          { cause: error },
        );
      }
      expect(request).toContain('"requested": "preview"');
      await waitForAdditionalBuildSettlement(runtime, settledBuilds);

      const outputDirectory = join(consumerDirectory, "dist", "site-preview");
      const html = await waitForBuiltFile(
        join(outputDirectory, "index.html"),
        "Read with intention",
        runtime,
      );
      expect(html).toContain("Reading library");
      expect(html).toContain("Saved pages and their digests");
      expect(html).toContain('class="hero"');
      expect(html).toContain("application/ld+json");
      expect(html).toContain("CollectionPage");

      const css = await readFile(
        join(outputDirectory, "styles/main.css"),
        "utf8",
      );
      expect(css).toContain("max-width: 48rem");
      expect(css).toContain("letter-spacing: 0.12em");

      const robots = await readFile(
        join(outputDirectory, "robots.txt"),
        "utf8",
      );
      expect(robots).toBe("User-agent: *\nAllow: /\n");

      const shutdown = await stopRuntime(runtime);
      runtime = undefined;
      expect(shutdown).not.toContain("missed its worker heartbeat");
      expect(shutdown).not.toContain("api.openai.com");

      // Exercise the built-in declarative Organization composition in the same
      // isolated packed app, with an explicit rebuild on the running worker.
      const configPath = join(consumerDirectory, "brain.yaml");
      const config = await readFile(configPath, "utf8");
      if (!config.includes('package: "@fixture/reading-site"'))
        throw new Error("Missing fixture site selection");
      await writeFile(
        configPath,
        config
          .replace(
            'package: "@fixture/reading-site"',
            'package: "@brains/site-organization"',
          )
          .replace("add: [mcp]", "add: [mcp, agents]")
          .replace(
            "plugins:\n",
            "plugins:\n  agents:\n    enableSkillDerivation: false\n",
          ),
      );
      runtime = startRuntime(consumerDirectory);
      await runtime.waitForOutput("Brain worker runtime ready", 60_000);
      const organizationBuilds = buildSettlementCount(runtime);
      await runCommand(
        [
          "bun",
          "run",
          "brain",
          "build-site",
          "--environment",
          "preview",
          "--remote",
          "http://127.0.0.1:8085",
          "--token",
          remoteToken,
        ],
        consumerDirectory,
        { env: runtimeEnv, timeoutMs: 90_000 },
      );
      await waitForAdditionalBuildSettlement(runtime, organizationBuilds);
      const organizationHtml = await waitForBuiltFile(
        join(outputDirectory, "index.html"),
        'data-atlas=""',
        runtime,
      );
      expect(organizationHtml).not.toContain("Read with intention");
      const atlasScript = /\/scripts\/homepage-atlas\.[a-f0-9]{12}\.js/u.exec(
        organizationHtml,
      )?.[0];
      expect(atlasScript).toBeDefined();
      if (!atlasScript)
        throw new Error("Missing site-owned deferred atlas script");
      expect(organizationHtml).toContain(
        `<script src="${atlasScript}" defer></script>`,
      );
      expect(
        await readFile(join(outputDirectory, atlasScript.slice(1)), "utf8"),
      ).toContain("data-atlas");
      const organizationShutdown = await stopRuntime(runtime);
      runtime = undefined;
      expect(organizationShutdown).not.toContain("api.openai.com");
    } finally {
      if (runtime) await stopRuntime(runtime);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 240_000);
});
