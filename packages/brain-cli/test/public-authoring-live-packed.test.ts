import { expect, it as bunIt } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitUntil } from "@brains/test-utils";
import {
  buildAndPackFixturePackage,
  combinedOutput,
  installPackedConsumer,
  liveEvidenceEnabled,
  runCommand,
  startCommand,
  stopProcess,
  type RegistryPackageVersions,
  type StartedCommand,
} from "./helpers/packed-consumer";

const packageFixtureRoot = join(
  import.meta.dir,
  "fixtures",
  "public-authoring",
);
const consumerFixture = join(
  import.meta.dir,
  "fixtures",
  "public-authoring-phase5-consumer",
);
const brainFixture = join(
  import.meta.dir,
  "fixtures",
  "interface-brain-definition",
);
const runLiveEvidence = liveEvidenceEnabled();
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const providerCallDeadlineMs = 60_000;
const attachmentMarker = "LIVE-ATTACHMENT-EVIDENCE-7F3A";

interface LiveSocketData {
  authenticated: boolean;
}

interface LiveTransport {
  readonly eventFeedUrl: string;
  readonly campfireBaseUrl: string;
  attachmentFileReads(): number;
  attachmentMetadataReads(): number;
  deliveries(): readonly string[];
  edits(): readonly string[];
  sendInbound(input: {
    readonly id: string;
    readonly roomId: string;
    readonly threadId: string;
    readonly userId: string;
    readonly userName: string;
    readonly text: string;
  }): void;
  close(): Promise<void>;
}

function requiredVersion(variable: string, pattern: RegExp): string {
  const value = process.env[variable]?.trim();
  if (!value || !exactVersionPattern.test(value) || !pattern.test(value)) {
    throw new Error(
      `${variable} must name one exact nominated version matching ${pattern}`,
    );
  }
  return value;
}

function requiredSecret(variable: string): string {
  const value = process.env[variable]?.trim();
  if (!value) {
    throw new Error(
      `${variable} is required when live authoring evidence runs`,
    );
  }
  return value;
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

function requestText(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const text = Reflect.get(value, "text");
  return typeof text === "string" ? text : undefined;
}

function startLiveTransport(): LiveTransport {
  const deliveries: string[] = [];
  const edits: string[] = [];
  let attachmentMetadataReads = 0;
  let attachmentFileReads = 0;
  let socketAuthenticated = false;
  let closeSocket: (() => void) | undefined;
  let sendToRuntime: ((message: string) => void) | undefined;
  let messageSequence = 0;
  const encoder = new TextEncoder();

  const eventFeed = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request): Response {
      if (new URL(request.url).pathname !== "/events") {
        return new Response("Not found", { status: 404 });
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller): void {
          controller.enqueue(encoder.encode(": ready\n\n"));
          request.signal.addEventListener("abort", () => controller.close(), {
            once: true,
          });
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

  const campfire = Bun.serve<LiveSocketData>({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, server): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (url.pathname === "/events") {
        if (server.upgrade(request, { data: { authenticated: false } })) {
          return undefined;
        }
        return new Response("Upgrade failed", { status: 400 });
      }

      if (url.pathname === "/files/live-evidence.txt") {
        attachmentFileReads += 1;
        return new Response(
          `The exact attachment marker is ${attachmentMarker}.`,
          { headers: { "content-type": "text/plain" } },
        );
      }

      if (
        request.headers.get("authorization") !==
          "Bearer packed-campfire-secret" ||
        request.headers.get("x-campfire-workspace") !== "packed-reading-club"
      ) {
        return new Response("Unauthorized", { status: 401 });
      }

      if (url.pathname === "/messages" && request.method === "POST") {
        const text = requestText(await request.json());
        if (!text) return new Response("Invalid message", { status: 400 });
        deliveries.push(text);
        messageSequence += 1;
        return Response.json({ id: `live-message-${messageSequence}` });
      }
      if (
        url.pathname.startsWith("/messages/") &&
        url.pathname.endsWith("/attachments") &&
        request.method === "GET"
      ) {
        if (url.pathname !== "/messages/live-attachment/attachments") {
          return Response.json([]);
        }
        attachmentMetadataReads += 1;
        return Response.json([
          {
            name: "live-evidence.txt",
            mediaType: "text/plain",
            url: `http://127.0.0.1:${campfire.port}/files/live-evidence.txt`,
          },
        ]);
      }
      if (url.pathname.startsWith("/messages/") && request.method === "PUT") {
        const text = requestText(await request.json());
        if (!text) return new Response("Invalid edit", { status: 400 });
        edits.push(text);
        return new Response(null, { status: 204 });
      }
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      message(candidate, message): void {
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
          candidate.data.authenticated = true;
          socketAuthenticated = true;
          closeSocket = (): void => candidate.close();
          sendToRuntime = (outgoing): void => {
            candidate.send(outgoing);
          };
        }
      },
    },
  });

  return {
    eventFeedUrl: `http://127.0.0.1:${eventFeed.port}/events`,
    campfireBaseUrl: `http://127.0.0.1:${campfire.port}`,
    attachmentFileReads: () => attachmentFileReads,
    attachmentMetadataReads: () => attachmentMetadataReads,
    deliveries: () => deliveries,
    edits: () => edits,
    sendInbound(input): void {
      if (!socketAuthenticated || !sendToRuntime) {
        throw new Error("Campfire transport is not authenticated");
      }
      sendToRuntime(JSON.stringify(input));
    },
    async close(): Promise<void> {
      closeSocket?.();
      await Promise.all([eventFeed.stop(true), campfire.stop(true)]);
    },
  };
}

function liveRuntimeEnv(
  apiKey: string,
  transport: LiveTransport,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AI_API_KEY: apiKey,
    BRAIN_SKIP_LOCAL_REEXEC: "1",
    FIXTURE_EVENT_FEED_URL: transport.eventFeedUrl,
    FIXTURE_CAMPFIRE_BASE_URL: transport.campfireBaseUrl,
  };
}

function redact(value: string, apiKey: string): string {
  return value.replaceAll(apiKey, "[REDACTED]");
}

function runtimeOutput(runtime: StartedCommand, apiKey: string): string {
  return redact(combinedOutput(runtime.getOutput()), apiKey);
}

async function waitForEvidence(
  description: string,
  predicate: () => boolean | Promise<boolean>,
  runtime: StartedCommand,
  apiKey: string,
): Promise<void> {
  try {
    await waitUntil(predicate, description, {
      timeoutMs: providerCallDeadlineMs,
      intervalMs: 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\n--- redacted runtime output ---\n${runtimeOutput(runtime, apiKey)}`,
      { cause: error },
    );
  }
}

async function invokeTool(
  consumerDirectory: string,
  env: NodeJS.ProcessEnv,
  name: string,
  input: Record<string, unknown>,
  confirm = false,
): Promise<string> {
  try {
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
        { env, timeoutMs: providerCallDeadlineMs },
      ),
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const apiKey = env["AI_API_KEY"];
    if (apiKey) {
      error.message = redact(error.message, apiKey);
      if (error.stack) error.stack = redact(error.stack, apiKey);
    }
    throw new Error(`Live evidence tool command failed: ${name}`, {
      cause: error,
    });
  }
}

function bookmarkMarkdown(input: {
  readonly title: string;
  readonly url: string;
  readonly body: string;
}): string {
  return [
    "---",
    `title: ${input.title}`,
    `url: ${input.url}`,
    "tags:",
    "  - live-evidence",
    "---",
    input.body,
  ].join("\n");
}

async function createBookmark(
  consumerDirectory: string,
  env: NodeJS.ProcessEnv,
  input: {
    readonly title: string;
    readonly url: string;
    readonly body: string;
  },
): Promise<void> {
  await invokeTool(
    consumerDirectory,
    env,
    "system_create",
    {
      entityType: "bookmark",
      title: input.title,
      source: { kind: "text", content: bookmarkMarkdown(input) },
    },
    true,
  );
}

bunIt("redacts provider secrets from live evidence diagnostics", () => {
  const secret = "live-provider-secret-7f3a";
  expect(redact(`before ${secret} after ${secret}`, secret)).toBe(
    "before [REDACTED] after [REDACTED]",
  );
});

const it = bunIt.skipIf(!runLiveEvidence);

it("proves provider-backed public authoring behavior against one exact alpha", async () => {
  const brainVersion = requiredVersion(
    "RIZOM_PUBLIC_API_BRAIN_VERSION",
    /^0\.2\.0-alpha\.\d+$/u,
  );
  const siteVersion = requiredVersion(
    "RIZOM_PUBLIC_API_SITE_VERSION",
    /^0\.2\.0(?:-alpha\.\d+)?$/u,
  );
  const apiKey = requiredSecret("AI_API_KEY");
  const registryVersions: RegistryPackageVersions = {
    "@rizom/brain": brainVersion,
    "@rizom/site": siteVersion,
  };
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "public-authoring-live-"),
  );
  const transport = startLiveTransport();
  let runtime: StartedCommand | undefined;

  try {
    const tarballDirectory = join(temporaryDirectory, "tarballs");
    const stagingDirectory = join(temporaryDirectory, "build");
    const tarballs = new Map<string, string>();
    for (const fixture of [
      "entity",
      "service",
      "interface",
      "message-interface",
    ]) {
      const packed = await buildAndPackFixturePackage(
        join(packageFixtureRoot, fixture),
        stagingDirectory,
        tarballDirectory,
        tarballs,
        registryVersions,
      );
      tarballs.set(...packed);
    }
    const brain = await buildAndPackFixturePackage(
      brainFixture,
      stagingDirectory,
      tarballDirectory,
      tarballs,
      registryVersions,
    );
    tarballs.set(...brain);

    const consumerDirectory = join(temporaryDirectory, "consumer");
    await installPackedConsumer(
      consumerFixture,
      consumerDirectory,
      tarballs,
      registryVersions,
    );
    const runtimePort = await availablePort();
    const brainConfigPath = join(consumerDirectory, "brain.yaml");
    const brainConfig = await readFile(brainConfigPath, "utf8");
    await writeFile(
      brainConfigPath,
      `${brainConfig.replace("embedding:\n  enabled: false", "embedding:\n  enabled: true")}logLevel: debug\nadmins:\n  - campfire:live-reader\nanchors:\n  - campfire:live-reader\nplugins:\n  webserver:\n    productionPort: ${runtimePort}\n`,
    );

    const env = liveRuntimeEnv(apiKey, transport);
    await createBookmark(consumerDirectory, env, {
      title: "Live Digest",
      url: "https://example.com/live-digest",
      body: "A durable reading item for provider backed progress evidence.",
    });
    await createBookmark(consumerDirectory, env, {
      title: "Aurora Observatory",
      url: "https://example.com/aurora-observatory",
      body: "Aurora borealis viewing from a remote polar observatory.",
    });
    await createBookmark(consumerDirectory, env, {
      title: "Tropical Kitchen",
      url: "https://example.com/tropical-kitchen",
      body: "Coconut recipes and warm weather cooking techniques.",
    });

    runtime = startCommand(
      ["bun", "run", "brain", "start"],
      consumerDirectory,
      {
        env,
      },
    );
    const activeRuntime = runtime;
    await waitForEvidence(
      "the packed web and worker runtimes to become ready",
      () => {
        const output = combinedOutput(activeRuntime.getOutput());
        return (
          output.includes("Brain web runtime ready") &&
          output.includes("Brain worker runtime ready")
        );
      },
      activeRuntime,
      apiKey,
    );
    await waitForEvidence(
      "the public message transport to authenticate",
      () => {
        try {
          transport.sendInbound({
            id: "live-probe",
            roomId: "evidence-room",
            threadId: "evidence-thread",
            userId: "live-reader",
            userName: "Live Reader",
            text: "Reply with exactly LIVE-AGENT-OK and do not use tools.",
          });
          return true;
        } catch {
          return false;
        }
      },
      activeRuntime,
      apiKey,
    );
    await waitForEvidence(
      "the provider-backed agent response",
      () =>
        transport.deliveries().some((text) => text.includes("LIVE-AGENT-OK")),
      activeRuntime,
      apiKey,
    );

    await waitForEvidence(
      "all queued entity embeddings to complete",
      () => {
        const output = combinedOutput(activeRuntime.getOutput());
        return output.split("Embedding job completed successfully").length >= 4;
      },
      activeRuntime,
      apiKey,
    );
    const semanticSearch = await invokeTool(
      consumerDirectory,
      env,
      "system_search",
      {
        query: "northern lights research station",
        scope: { kind: "type", entityType: "bookmark" },
        limit: 3,
        minScore: 0,
      },
    );
    const auroraIndex = semanticSearch.indexOf("aurora-observatory");
    const tropicalIndex = semanticSearch.indexOf("tropical-kitchen");
    expect(auroraIndex).toBeGreaterThanOrEqual(0);
    expect(tropicalIndex).toBeGreaterThanOrEqual(0);
    expect(auroraIndex).toBeLessThan(tropicalIndex);

    const attachmentDeliveryCount = transport.deliveries().length;
    transport.sendInbound({
      id: "live-attachment",
      roomId: "evidence-room",
      threadId: "evidence-thread",
      userId: "live-reader",
      userName: "Live Reader",
      text: "Read the attached text file and reply with its exact marker.",
    });
    await waitForEvidence(
      "lazy attachment metadata and content fetch",
      () =>
        transport.attachmentMetadataReads() > 0 &&
        transport.attachmentFileReads() > 0,
      activeRuntime,
      apiKey,
    );
    await waitForEvidence(
      "the attachment-backed agent response",
      () =>
        transport
          .deliveries()
          .slice(attachmentDeliveryCount)
          .some((text) => text.includes(attachmentMarker)),
      activeRuntime,
      apiKey,
    );

    const confirmationDeliveryCount = transport.deliveries().length;
    transport.sendInbound({
      id: "live-digest-request",
      roomId: "evidence-room",
      threadId: "evidence-thread",
      userId: "live-reader",
      userName: "Live Reader",
      text: "Use the reading-insights compile-reading-digest tool for bookmark id live-digest. Do not merely describe the operation.",
    });
    await waitForEvidence(
      "the model-triggered digest confirmation",
      () => transport.deliveries().length > confirmationDeliveryCount,
      activeRuntime,
      apiKey,
    );
    transport.sendInbound({
      id: "live-digest-confirmation",
      roomId: "evidence-room",
      threadId: "evidence-thread",
      userId: "live-reader",
      userName: "Live Reader",
      text: "Yes, confirm that exact pending operation.",
    });
    await waitForEvidence(
      "durable job progress to reach the editable transport message",
      () =>
        transport
          .edits()
          .some(
            (text) =>
              text.includes("Digest ready") || text.includes("completed"),
          ),
      activeRuntime,
      apiKey,
    );

    const continuityDeliveryCount = transport.deliveries().length;
    transport.sendInbound({
      id: "live-continuity",
      roomId: "evidence-room",
      threadId: "evidence-thread",
      userId: "live-reader",
      userName: "Live Reader",
      text: "From our conversation, reply only with the bookmark title I asked you to compile.",
    });
    await waitForEvidence(
      "conversation continuity through the public message interface",
      () =>
        transport
          .deliveries()
          .slice(continuityDeliveryCount)
          .some((text) => text.includes("Live Digest")),
      activeRuntime,
      apiKey,
    );

    await stopProcess(activeRuntime.process, 10_000);
    const rawShutdown = combinedOutput(await activeRuntime.completed);
    runtime = undefined;
    expect(rawShutdown.includes(apiKey)).toBeFalse();
    expect(redact(rawShutdown, apiKey)).not.toContain(
      "missed its worker heartbeat",
    );
  } finally {
    if (runtime) await stopProcess(runtime.process, 10_000);
    await transport.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}, 900_000);
