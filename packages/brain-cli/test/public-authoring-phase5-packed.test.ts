import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import {
  buildAndPackFixturePackage,
  combinedOutput,
  installPackedConsumer,
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
const interfaceFixture = join(publicFixtureRoot, "interface");
const messageInterfaceFixture = join(publicFixtureRoot, "message-interface");
const brainFixture = join(
  import.meta.dir,
  "fixtures",
  "interface-brain-definition",
);
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring-phase5-consumer",
);

const runtimeEnv = {
  ...process.env,
  AI_API_KEY: "packed-hermetic-runtime",
  BRAIN_SKIP_LOCAL_REEXEC: "1",
};

interface CampfireSocketData {
  authenticated: boolean;
}

interface TransportEvidence {
  close(): Promise<void>;
  readonly campfireConnections: () => number;
  readonly campfireAuthentications: () => number;
  readonly campfireClosures: () => number;
  readonly eventFeedConnections: () => number;
  readonly eventFeedClosures: () => number;
}

async function availablePort(): Promise<number> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("reserved"),
  });
  const port = server.port;
  await server.stop(true);
  if (port === undefined) throw new Error("Bun did not allocate a test port");
  return port;
}

function startTransportEvidence(): TransportEvidence {
  let eventFeedConnections = 0;
  let eventFeedClosures = 0;
  let campfireConnections = 0;
  let campfireAuthentications = 0;
  let campfireClosures = 0;
  const encoder = new TextEncoder();

  const eventFeed = Bun.serve({
    hostname: "127.0.0.1",
    port: 14010,
    fetch(request): Response {
      if (new URL(request.url).pathname !== "/events") {
        return new Response("Not found", { status: 404 });
      }
      eventFeedConnections += 1;
      const stream = new ReadableStream<Uint8Array>({
        start(controller): void {
          controller.enqueue(encoder.encode(": ready\n\n"));
          request.signal.addEventListener(
            "abort",
            () => {
              eventFeedClosures += 1;
              controller.close();
            },
            { once: true },
          );
        },
      });
      return new Response(stream, {
        headers: {
          "cache-control": "no-cache",
          "content-type": "text/event-stream",
        },
      });
    },
  });

  const campfire = Bun.serve<CampfireSocketData>({
    hostname: "127.0.0.1",
    port: 14020,
    fetch(request, server): Response | undefined {
      const url = new URL(request.url);
      if (url.pathname === "/events") {
        if (server.upgrade(request, { data: { authenticated: false } })) {
          return undefined;
        }
        return new Response("Upgrade failed", { status: 400 });
      }
      if (url.pathname === "/messages" && request.method === "POST") {
        return Response.json({ id: "packed-message-1" });
      }
      if (url.pathname.startsWith("/messages/") && request.method === "PUT") {
        return new Response(null, { status: 204 });
      }
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      open(): void {
        campfireConnections += 1;
      },
      message(socket, message): void {
        if (typeof message !== "string") return;
        let payload: unknown;
        try {
          payload = JSON.parse(message);
        } catch {
          return;
        }
        if (
          payload !== null &&
          typeof payload === "object" &&
          Reflect.get(payload, "type") === "authenticate"
        ) {
          socket.data.authenticated = true;
          campfireAuthentications += 1;
        }
      },
      close(): void {
        campfireClosures += 1;
      },
    },
  });

  return {
    async close(): Promise<void> {
      await Promise.all([eventFeed.stop(true), campfire.stop(true)]);
    },
    campfireConnections: () => campfireConnections,
    campfireAuthentications: () => campfireAuthentications,
    campfireClosures: () => campfireClosures,
    eventFeedConnections: () => eventFeedConnections,
    eventFeedClosures: () => eventFeedClosures,
  };
}

async function waitForEvidence(
  label: string,
  predicate: () => boolean,
  diagnostics: () => string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await Bun.sleep(50);
  }
  throw new Error(`${label} did not become observable\n${diagnostics()}`);
}

function startRuntime(consumerDirectory: string): StartedCommand {
  return startCommand(["bun", "run", "brain", "start"], consumerDirectory, {
    env: runtimeEnv,
  });
}

async function stopRuntime(runtime: StartedCommand): Promise<string> {
  await stopProcess(runtime.process, 10_000);
  return combinedOutput(await runtime.completed);
}

async function invokeTool(
  consumerDirectory: string,
  name: string,
  input: Record<string, unknown>,
  confirm = false,
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
        ...(confirm ? ["--yes"] : []),
      ],
      consumerDirectory,
      { env: runtimeEnv, timeoutMs: 90_000 },
    ),
  );
}

async function waitForCompletedDigest(
  consumerDirectory: string,
  jobId: string,
  runtime: StartedCommand,
): Promise<string> {
  const deadline = Date.now() + 30_000;
  let diagnostic = "job status was not queried";
  while (Date.now() < deadline) {
    try {
      diagnostic = await invokeTool(
        consumerDirectory,
        "reading-insights_reading-digest-status",
        { jobId },
      );
      if (diagnostic.includes('"status": "completed"')) return diagnostic;
      if (diagnostic.includes('"status": "failed"')) break;
    } catch (error) {
      diagnostic = getErrorMessage(error);
    }
    await Bun.sleep(250);
  }
  throw new Error(
    `Digest job ${jobId} did not complete\n${diagnostic}\n${combinedOutput(runtime.getOutput())}`,
  );
}

describe("public authoring Phase 5 packed interface contracts", () => {
  it("loads both interfaces and proves routing, trust, jobs, daemons, and worker exclusion", async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "public-authoring-phase5-"),
    );
    const transport = startTransportEvidence();
    let runtime: StartedCommand | undefined;
    try {
      const tarballDirectory = join(temporaryDirectory, "tarballs");
      const tarballs = new Map(
        await packPackages([packageDirectory], tarballDirectory),
      );
      const stagingDirectory = join(temporaryDirectory, "build");

      for (const fixture of [
        entityFixture,
        serviceFixture,
        interfaceFixture,
        messageInterfaceFixture,
        brainFixture,
      ]) {
        const packed = await buildAndPackFixturePackage(
          fixture,
          stagingDirectory,
          tarballDirectory,
          tarballs,
        );
        tarballs.set(...packed);
      }

      const consumerDirectory = join(temporaryDirectory, "consumer");
      await installPackedConsumer(consumerFixture, consumerDirectory, tarballs);
      const runtimePort = await availablePort();
      const brainConfigPath = join(consumerDirectory, "brain.yaml");
      const brainConfig = await readFile(brainConfigPath, "utf8");
      await writeFile(
        brainConfigPath,
        `${brainConfig}plugins:\n  webserver:\n    productionPort: ${runtimePort}\n`,
      );
      await invokeTool(
        consumerDirectory,
        "system_create",
        {
          entityType: "bookmark",
          title: "Interface Jobs",
          source: {
            kind: "text",
            content: [
              "---",
              "title: Interface Jobs",
              "url: https://example.com/interface-jobs",
              "tags:",
              "  - interfaces",
              "---",
              "Typed interface enqueue",
            ].join("\n"),
          },
        },
        true,
      );

      runtime = startRuntime(consumerDirectory);
      await runtime.waitForOutput("Brain worker runtime ready", 60_000);
      await waitForEvidence(
        "generic interface event feed",
        () => transport.eventFeedConnections() === 1,
        () =>
          combinedOutput(runtime?.getOutput() ?? { stdout: "", stderr: "" }),
      );
      await waitForEvidence(
        "message interface authentication",
        () =>
          transport.campfireConnections() === 1 &&
          transport.campfireAuthentications() === 1,
        () =>
          combinedOutput(runtime?.getOutput() ?? { stdout: "", stderr: "" }),
      );

      const health = await fetch(
        `http://127.0.0.1:${runtimePort}/reading-digest/health`,
      );
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "ok" });

      const denied = await fetch(
        `http://127.0.0.1:${runtimePort}/hooks/reading-digest`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bookmarkId: "interface-jobs" }),
        },
      );
      expect(denied.status).toBe(401);

      const accepted = await fetch(
        `http://127.0.0.1:${runtimePort}/hooks/reading-digest`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer packed-interface-secret",
            "content-type": "application/json",
            "x-reading-user": "packed-reader",
          },
          body: JSON.stringify({ bookmarkId: "interface-jobs" }),
        },
      );
      expect(accepted.status).toBe(200);
      const acceptedBody = z
        .object({
          jobId: z.string(),
          acceptedFor: z.string(),
          permission: z.string(),
          anchor: z.boolean(),
        })
        .parse(await accepted.json());
      expect(acceptedBody).toMatchObject({
        acceptedFor: "packed-reader",
        permission: "admin",
        anchor: true,
      });

      const completed = await waitForCompletedDigest(
        consumerDirectory,
        acceptedBody.jobId,
        runtime,
      );
      expect(completed).toContain('"bookmarkId": "interface-jobs"');
      expect(completed).toContain('"status": "completed"');

      await Bun.sleep(250);
      expect(transport.eventFeedConnections()).toBe(1);
      expect(transport.campfireConnections()).toBe(1);

      const shutdown = await stopRuntime(runtime);
      runtime = undefined;
      await waitForEvidence(
        "message listener shutdown",
        () => transport.campfireClosures() === 1,
        () => shutdown,
      );
      expect(transport.eventFeedClosures()).toBeGreaterThanOrEqual(1);
      expect(shutdown).not.toContain("api.openai.com");
      expect(shutdown).not.toContain("missed its worker heartbeat");
    } finally {
      if (runtime) await stopRuntime(runtime);
      await transport.close();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 300_000);
});
