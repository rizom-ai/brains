import { describe, expect, it as bunIt } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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

const runtimeEnv = {
  ...process.env,
  AI_API_KEY: "packed-hermetic-runtime",
  BRAIN_SKIP_LOCAL_REEXEC: "1",
};

function bookmarkMarkdown(input: {
  readonly title: string;
  readonly url: string;
  readonly body: string;
  readonly visibility?: "public" | "shared" | "restricted" | undefined;
}): string {
  return [
    "---",
    `title: ${input.title}`,
    `url: ${input.url}`,
    "tags:",
    "  - reference",
    ...(input.visibility ? [`visibility: ${input.visibility}`] : []),
    "---",
    input.body,
  ].join("\n");
}

async function invokeTool(
  consumerDirectory: string,
  name: string,
  input: Record<string, unknown>,
  options: {
    readonly confirm?: boolean | undefined;
    readonly permission?: "public" | "trusted" | "admin" | undefined;
  } = {},
): Promise<string> {
  const command = [
    "bun",
    "run",
    "brain",
    "tool",
    name,
    JSON.stringify(input),
    ...(options.confirm ? ["--yes"] : []),
    ...(options.permission ? ["--permission", options.permission] : []),
  ];
  return combinedOutput(
    await runCommand(command, consumerDirectory, {
      env: runtimeEnv,
      timeoutMs: 90_000,
    }),
  );
}

async function waitForEntity(
  consumerDirectory: string,
  entityType: string,
  id: string,
  expectedContent: string,
  recordShutdown: (output: string) => void,
): Promise<string> {
  const deadline = Date.now() + 45_000;
  let lastDiagnostic = "entity was not queried";
  while (Date.now() < deadline) {
    recordShutdown(await runProjectionRuntimeSlice(consumerDirectory));
    try {
      const output = await invokeTool(consumerDirectory, "system_get", {
        entityType,
        id,
      });
      lastDiagnostic = output;
      if (output.includes(expectedContent)) return output;
    } catch (error) {
      lastDiagnostic = getErrorMessage(error);
    }
  }
  throw new Error(
    `Timed out waiting for ${entityType}:${id} to contain ${JSON.stringify(expectedContent)}\n${lastDiagnostic}`,
  );
}

async function waitForEntityMissing(
  consumerDirectory: string,
  entityType: string,
  id: string,
  recordShutdown: (output: string) => void,
): Promise<void> {
  const deadline = Date.now() + 45_000;
  let lastDiagnostic = "entity was not queried";
  while (Date.now() < deadline) {
    recordShutdown(await runProjectionRuntimeSlice(consumerDirectory));
    try {
      lastDiagnostic = await invokeTool(consumerDirectory, "system_get", {
        entityType,
        id,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.includes("not found")) return;
      lastDiagnostic = message;
    }
  }
  throw new Error(
    `Timed out waiting for ${entityType}:${id} deletion\n${lastDiagnostic}`,
  );
}

function startRuntime(consumerDirectory: string): StartedCommand {
  return startCommand(["bun", "run", "brain", "start"], consumerDirectory, {
    env: runtimeEnv,
  });
}

async function stopRuntime(
  runtime: ReturnType<typeof startRuntime>,
): Promise<string> {
  await stopProcess(runtime.process, 10_000);
  const result = await runtime.completed;
  return combinedOutput(result);
}

async function runProjectionRuntimeSlice(
  consumerDirectory: string,
): Promise<string> {
  const runtime = startRuntime(consumerDirectory);
  try {
    await runtime.waitForOutput("Brain worker runtime ready");
    await Bun.sleep(1_000);
  } catch (error) {
    await stopRuntime(runtime);
    throw error;
  }
  return stopRuntime(runtime);
}

describe("public authoring Phase 2 packed entity contract", () => {
  it("persists typed markdown entities and converges projections across restart", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "public-authoring-phase2-"),
    );
    const shutdownOutputs: string[] = [];
    const recordShutdown = (output: string): void => {
      shutdownOutputs.push(output);
    };
    try {
      const tarballDirectory = join(temporaryDirectory, "tarballs");
      const tarballs = new Map(
        await packPackages([packageDirectory], tarballDirectory),
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

      const created = await invokeTool(
        consumerDirectory,
        "system_create",
        {
          entityType: "bookmark",
          title: "Deep Focus",
          source: {
            kind: "text",
            content: bookmarkMarkdown({
              title: "Deep Focus",
              url: "https://example.com/deep-focus",
              body: "Hermetic quokka reading notes",
            }),
          },
        },
        { confirm: true },
      );
      expect(created).toContain('"entityId": "deep-focus"');

      const duplicateInput = {
        entityType: "bookmark",
        title: "Deep Focus",
        source: {
          kind: "text",
          content: bookmarkMarkdown({
            title: "Deep Focus copy",
            url: "https://example.com/deep-focus-copy",
            body: "A deliberate duplicate title",
          }),
        },
      };
      expect(
        invokeTool(consumerDirectory, "system_create", duplicateInput, {
          confirm: true,
        }),
      ).rejects.toThrow("already exists");
      const duplicate = await invokeTool(
        consumerDirectory,
        "system_create",
        { ...duplicateInput, replace: true },
        { confirm: true },
      );
      expect(duplicate).toContain('"entityId": "deep-focus-2"');

      await invokeTool(
        consumerDirectory,
        "system_create",
        {
          entityType: "bookmark",
          title: "Private Reading",
          source: {
            kind: "text",
            content: bookmarkMarkdown({
              title: "Private Reading",
              url: "https://example.com/private",
              body: "Restricted reading notes",
              visibility: "restricted",
            }),
          },
        },
        { confirm: true },
      );

      const saved = await invokeTool(consumerDirectory, "system_get", {
        entityType: "bookmark",
        id: "deep-focus",
      });
      expect(saved).toContain('"visibility": "public"');
      expect(saved).toContain('"url": "https://example.com/deep-focus"');
      expect(saved).toContain("Hermetic quokka reading notes");

      const searched = await invokeTool(consumerDirectory, "system_search", {
        query: "Hermetic quokka",
        scope: { kind: "type", entityType: "bookmark" },
        limit: 5,
        minScore: 0,
      });
      expect(searched).toContain('"id": "deep-focus"');
      expect(searched).toContain("Hermetic quokka reading notes");

      const adminList = await invokeTool(consumerDirectory, "system_list", {
        entityType: "bookmark",
        limit: 20,
      });
      expect(adminList).toContain('"count": 3');
      expect(adminList).toContain("private-reading");

      const publicList = await invokeTool(
        consumerDirectory,
        "system_list",
        { entityType: "bookmark", limit: 20 },
        { permission: "public" },
      );
      expect(publicList).toContain('"count": 2');
      expect(publicList).not.toContain("private-reading");

      expect(
        invokeTool(
          consumerDirectory,
          "system_get",
          { entityType: "bookmark", id: "private-reading" },
          { permission: "public" },
        ),
      ).rejects.toThrow("not found");

      const digest = await waitForEntity(
        consumerDirectory,
        "reading-digest",
        "deep-focus",
        "Hermetic quokka reading notes",
        recordShutdown,
      );
      expect(digest).toContain('"wordCount": 4');
      expect(digest).toContain('"visibility": "public"');

      const durable = await invokeTool(consumerDirectory, "system_get", {
        entityType: "bookmark",
        id: "deep-focus",
      });
      expect(durable).toContain("Hermetic quokka reading notes");

      await invokeTool(
        consumerDirectory,
        "system_update",
        {
          entityType: "bookmark",
          id: "deep-focus",
          fields: { title: "Deep Focus Revised" },
        },
        { confirm: true },
      );
      const revisedSource = await invokeTool(consumerDirectory, "system_get", {
        entityType: "bookmark",
        id: "deep-focus",
      });
      expect(revisedSource).toContain('"title": "Deep Focus Revised"');

      const revisedDigest = await waitForEntity(
        consumerDirectory,
        "reading-digest",
        "deep-focus",
        "Deep Focus Revised",
        recordShutdown,
      );
      expect(revisedDigest).toContain('"title": "Deep Focus Revised"');
      await invokeTool(
        consumerDirectory,
        "system_delete",
        { entityType: "bookmark", id: "deep-focus" },
        { confirm: true },
      );
      await waitForEntityMissing(
        consumerDirectory,
        "reading-digest",
        "deep-focus",
        recordShutdown,
      );

      expect(shutdownOutputs.join("\n")).not.toContain(
        "missed its worker heartbeat",
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 240_000);
});
