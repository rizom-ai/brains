import { describe, expect, it } from "bun:test";
import { runProcess } from "@brains/utils/run-process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Boots the built artifact, not the source graph. The runtime ships as
 * separate bundles (brain.js loading dist/model.js at runtime), and two boot
 * regressions have shipped invisibly because only the built binary exercises
 * that split: definition metadata resolution and cross-bundle module state.
 * Unit suites run on a single module graph and can never catch either.
 */

const packageDir = join(import.meta.dir, "..");

function freePort(): number {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = listener;
  listener.stop(true);
  return port;
}

interface BootOutcome {
  log: string;
  listening: boolean;
}

/**
 * Bun types a spawned stdio slot as a stream, a file descriptor, or nothing,
 * depending on how the process was configured. Checking is what makes this a
 * stream; asserting it would read a file descriptor as one.
 */
function readableStream(
  stream: unknown,
): ReadableStream<Uint8Array> | undefined {
  return stream instanceof ReadableStream ? stream : undefined;
}

async function waitForListening(
  proc: ReturnType<typeof Bun.spawn>,
  timeoutMs: number,
): Promise<BootOutcome> {
  let log = "";
  const listen = async (
    stream: ReadableStream<Uint8Array> | undefined,
  ): Promise<BootOutcome | undefined> => {
    if (!stream) return undefined;
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    const pump = async (): Promise<BootOutcome | undefined> => {
      const { done, value } = await reader.read();
      if (done) return undefined;
      log += decoder.decode(value, { stream: true });
      if (log.includes("Production server listening")) {
        return { log, listening: true };
      }
      return pump();
    };
    return pump();
  };
  const exited = proc.exited.then((): BootOutcome => ({
    log,
    listening: false,
  }));
  // A deadline for the race below, not a wait: whichever of the streams, the
  // exit, or this resolves first decides the outcome, and this one only wins
  // when the process never reported either way.
  const timedOut = Bun.sleep(timeoutMs).then((): BootOutcome => ({
    log,
    listening: false,
  }));
  const outcome = await Promise.race([
    listen(readableStream(proc.stdout)),
    listen(readableStream(proc.stderr)),
    exited,
    timedOut,
  ]);
  return outcome ?? { log, listening: false };
}

describe("built binary boot smoke", () => {
  it("boots the canonical model and serves HTTP", async () => {
    const instanceDir = mkdtempSync(join(tmpdir(), "brain-boot-smoke-"));
    const productionPort = freePort();
    const apiPort = freePort();
    writeFileSync(
      join(instanceDir, "brain.yaml"),
      [
        "brain: brain",
        "bundleContract: capability-bundles-v1",
        "anchor: person",
        "kind: professional",
        "bundles:",
        "  - core",
        "  - web",
        // An add:-ed plugin loads an opt-in capability alongside the shared
        // runtime bundles, retaining the cross-bundle path under test.
        "add:",
        "  - wishlist",
        "plugins:",
        "  onboarding:",
        "    enabled: false",
        "  webserver:",
        "    enablePreview: false",
        `    productionPort: ${productionPort}`,
        `    apiPort: ${apiPort}`,
        "",
      ].join("\n"),
    );

    const proc = Bun.spawn(
      ["bun", join(packageDir, "dist", "brain.js"), "start"],
      {
        cwd: instanceDir,
        env: {
          ...process.env,
          NODE_ENV: "production",
          AI_API_KEY: "placeholder-boot-smoke",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    try {
      const outcome = await waitForListening(proc, 90_000);
      const tail = outcome.log.split("\n").slice(-40).join("\n");

      expect(outcome.listening, `boot log tail:\n${tail}`).toBe(true);
      expect(outcome.log).not.toContain("snapshot provider is not bound");
      expect(outcome.log).not.toContain("failed to start");

      const response = await fetch(`http://localhost:${productionPort}/`);
      expect(await response.text()).not.toBe("Internal Server Error");
      expect(response.status).toBe(200);
    } finally {
      proc.kill();
      await proc.exited;
      rmSync(instanceDir, { recursive: true, force: true });
    }
  }, 240_000);

  it("passes startup checks without a webserver", async () => {
    const instanceDir = mkdtempSync(join(tmpdir(), "brain-headless-smoke-"));
    try {
      writeFileSync(
        join(instanceDir, "brain.yaml"),
        [
          "brain: brain",
          "bundleContract: capability-bundles-v1",
          "anchor: person",
          "kind: professional",
          "bundles:",
          "  - core",
          "plugins:",
          "  onboarding:",
          "    enabled: false",
          "",
        ].join("\n"),
      );

      const startup = await runProcess(
        [
          "bun",
          join(packageDir, "dist", "brain.js"),
          "start",
          "--startup-check",
        ],
        {
          cwd: instanceDir,
          env: {
            ...process.env,
            AI_API_KEY: "placeholder-boot-smoke",
            XDG_DATA_HOME: join(instanceDir, "xdg-data"),
          },
        },
      );
      const output = `${startup.stdout}${startup.stderr}`;

      expect(startup.exitCode, output).toBe(0);
      expect(output).toContain("A2A interface registered in tool-only mode");
      expect(output).not.toContain("Production server listening");
      expect(output).not.toContain("MCP HTTP transport requires the webserver");
    } finally {
      rmSync(instanceDir, { recursive: true, force: true });
    }
  }, 240_000);
});
