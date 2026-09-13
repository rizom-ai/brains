import { describe, expect, it as bunIt } from "bun:test";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
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

const packageDirectory = join(import.meta.dir, "..");
const publicFixtureRoot = join(import.meta.dir, "fixtures", "public-authoring");
const entityFixture = join(publicFixtureRoot, "entity");
const serviceFixture = join(publicFixtureRoot, "service");
const brainFixture = join(
  import.meta.dir,
  "fixtures",
  "service-brain-definition",
);
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring-phase3-consumer",
);

const it = bunIt.skipIf(!packedCompatibilityEvidenceEnabled());

const runtimeEnv = {
  ...process.env,
  AI_API_KEY: "packed-hermetic-runtime",
  BRAIN_SKIP_LOCAL_REEXEC: "1",
};

async function invokeTool(
  consumerDirectory: string,
  name: string,
  input: Record<string, unknown>,
  options: { readonly confirm?: boolean | undefined } = {},
): Promise<string> {
  return combinedOutput(
    await runCommand(
      [
        "bun",
        "run",
        "brain",
        "tool",
        name,
        JSON.stringify(input),
        ...(options.confirm ? ["--yes"] : []),
      ],
      consumerDirectory,
      {
        env: {
          ...runtimeEnv,
          BUN_OPTIONS: `--preload=${join(consumerDirectory, "generation-provider.ts")}`,
        },
        timeoutMs: 90_000,
      },
    ),
  );
}

function startRuntime(consumerDirectory: string): StartedCommand {
  return startCommand(["bun", "run", "brain", "start"], consumerDirectory, {
    env: {
      ...runtimeEnv,
      BUN_OPTIONS: `--preload=${join(consumerDirectory, "generation-provider.ts")}`,
    },
  });
}

async function stopRuntime(runtime: StartedCommand): Promise<string> {
  await stopProcess(runtime.process, 10_000);
  return combinedOutput(await runtime.completed);
}

function jobIdFrom(output: string): string {
  const match = /"jobId":\s*"([^"]+)"/u.exec(output);
  if (!match?.[1]) throw new Error(`Tool output has no jobId:\n${output}`);
  return match[1];
}

async function waitForCompletedDigest(
  consumerDirectory: string,
  jobId: string,
  runtime: StartedCommand,
  tool = "reading-insights_reading-digest-status",
): Promise<string> {
  const deadline = Date.now() + 30_000;
  let diagnostic = "job status was not queried";
  while (Date.now() < deadline) {
    try {
      diagnostic = await invokeTool(consumerDirectory, tool, { jobId });
      if (diagnostic.includes('"status": "completed"')) return diagnostic;
      if (diagnostic.includes('"status": "failed"')) break;
    } catch (error) {
      diagnostic = getErrorMessage(error);
    }
    await Bun.sleep(250);
  }
  throw new Error(
    `Digest job ${jobId} did not complete\n${diagnostic}\n--- runtime ---\n${combinedOutput(runtime.getOutput())}`,
  );
}

/** Generated entities appear asynchronously; read them back through typed readers. */
async function waitForGeneratedOutputs(
  consumerDirectory: string,
  references: { digestId: string; overviewId: string },
  runtime: StartedCommand,
): Promise<string> {
  const deadline = Date.now() + 30_000;
  let diagnostic = "generated outputs were not read";
  while (Date.now() < deadline) {
    try {
      const readback = await invokeTool(
        consumerDirectory,
        "reading-insights_read-generated-outputs",
        references,
      );
      diagnostic = await waitForCompletedDigest(
        consumerDirectory,
        jobIdFrom(readback),
        runtime,
        "reading-insights_generated-output-status",
      );
      if (diagnostic.includes("Generated reading digest")) return diagnostic;
    } catch (error) {
      diagnostic = getErrorMessage(error);
    }
    await Bun.sleep(250);
  }
  throw new Error(
    `Generated outputs were not persisted\n${diagnostic}\n--- runtime ---\n${combinedOutput(runtime.getOutput())}`,
  );
}

describe("public authoring Phase 3 packed service contract", () => {
  it("executes durable jobs and mixed generation after the enqueueing process exits", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "public-authoring-phase3-"),
    );
    let runtime: StartedCommand | undefined;
    try {
      const tarballDirectory = join(temporaryDirectory, "tarballs");
      const tarballs = new Map(
        await packPackages([packageDirectory], tarballDirectory),
      );
      const stagingDirectory = join(temporaryDirectory, "build");

      const entity = await buildAndPackFixturePackage(
        entityFixture,
        stagingDirectory,
        tarballDirectory,
        tarballs,
      );
      tarballs.set(...entity);
      const service = await buildAndPackFixturePackage(
        serviceFixture,
        stagingDirectory,
        tarballDirectory,
        tarballs,
      );
      tarballs.set(...service);
      const brain = await buildAndPackFixturePackage(
        brainFixture,
        stagingDirectory,
        tarballDirectory,
        tarballs,
      );
      tarballs.set(...brain);

      const consumerDirectory = join(temporaryDirectory, "consumer");
      await installPackedConsumer(consumerFixture, consumerDirectory, tarballs);
      // Generation uses the existing service grant, not the CLI's ambient admin ceiling.
      await appendFile(
        join(consumerDirectory, "brain.yaml"),
        "\npermissions:\n  admins: [service:brain-cli]\n",
      );

      await invokeTool(
        consumerDirectory,
        "system_create",
        {
          entityType: "bookmark",
          title: "Durable Services",
          source: {
            kind: "text",
            content: [
              "---",
              "title: Durable Services",
              "url: https://example.com/durable-services",
              "tags:",
              "  - jobs",
              "---",
              "Hermetic durable service execution",
            ].join("\n"),
          },
        },
        { confirm: true },
      );

      const enqueued = await invokeTool(
        consumerDirectory,
        "reading-insights_compile-reading-digest",
        { bookmarkId: "durable-services" },
        { confirm: true },
      );
      const jobId = jobIdFrom(enqueued);
      expect(jobId).not.toBeEmpty();

      const preview = await invokeTool(
        consumerDirectory,
        "reading-insights_generate-reading-content",
        { bookmarkId: "durable-services", dryRun: true },
      );
      expect(preview).toContain('"plannedTargets": 2');
      expect(preview).toContain('"queuedTargets": 0');
      expect(preview).not.toContain('"batchId"');
      expect(preview).not.toContain('"jobId"');
      const admitted = await invokeTool(
        consumerDirectory,
        "reading-insights_generate-reading-content",
        { bookmarkId: "durable-services" },
      );
      expect(admitted).toContain('"queuedTargets": 2');
      const batchId = /"batchId":\s*"([^"]+)"/u.exec(admitted)?.[1];
      if (!batchId) throw new Error(`Missing generation batch: ${admitted}`);
      const admittedJobs = [...admitted.matchAll(/"jobId":\s*"([^"]+)"/gu)].map(
        (match) => match[1],
      );
      expect(new Set(admittedJobs).size).toBe(2);

      runtime = startRuntime(consumerDirectory);
      await runtime.waitForOutput("Brain worker runtime ready");
      const completed = await waitForCompletedDigest(
        consumerDirectory,
        jobId,
        runtime,
      );
      expect(completed).toContain('"bookmarkId": "durable-services"');
      expect(completed).toContain(
        '"summary": "Saved reading: Durable Services (4 words)"',
      );
      expect(completed).toContain('"wordCount": 4');
      expect(completed).toContain('"progress": 100');
      expect(completed).toContain('"message": "Digest ready"');

      expect(admitted).toContain('"template": "generatedDigest"');
      expect(admitted).toContain('"template": "generatedBookmark"');
      // The result carries each destination's stored entity ID, so an author
      // reads output back without reconstructing one from path segments.
      const [digestId, overviewId] = [
        ...admitted.matchAll(/"entityId":\s*"([^"]+)"/gu),
      ].map((match) => match[1]);
      if (!digestId || !overviewId)
        throw new Error(`Missing output references: ${admitted}`);
      const outputs = await waitForGeneratedOutputs(
        consumerDirectory,
        { digestId, overviewId },
        runtime,
      );
      expect(outputs).toContain("Generated reading digest");
      expect(outputs).toContain("Independent bookmark output");
      expect(outputs).toContain('"bookmarkId": "durable-services"');
      expect(outputs).toContain(
        "https://example.test/reading/durable-services",
      );
      const skipped = await invokeTool(
        consumerDirectory,
        "reading-insights_generate-reading-content",
        { bookmarkId: "durable-services" },
      );
      expect(skipped).toContain('"skippedTargets": 2');
      expect(skipped).toContain('"queuedTargets": 0');
      expect(skipped).not.toContain('"batchId"');

      const shutdown = await stopRuntime(runtime);
      runtime = undefined;
      expect(shutdown).not.toContain("missed its worker heartbeat");
    } finally {
      if (runtime) await stopRuntime(runtime);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 240_000);
});
