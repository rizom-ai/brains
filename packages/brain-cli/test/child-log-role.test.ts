import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConsoleLogger, type LogFormat } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { start } from "../src/commands/start";
import { runGitBrokerChild } from "../src/lib/git-broker-child";
import { resetBootFn, setBootFn } from "../src/lib/boot";
import {
  resetCanonicalDefinition,
  setCanonicalDefinition,
} from "../src/lib/definition-registry";
import { GIT_BROKER_SOCKET_ENV } from "../src/lib/process-supervisor";

/**
 * Every supervised child shares the supervisor's stdout, so each line a child
 * logs names the child that wrote it. The role comes from what the child
 * already knows at startup, not from rewriting its output in the supervisor.
 */

const jsonLineSchema = z.object({ role: z.string(), msg: z.string() });

const formats: LogFormat[] = ["text", "json"];

/** One line logged the way the runtime's own loggers log, in `format`. */
function logOneLine(format: LogFormat, message: string): void {
  ConsoleLogger.createFresh({ context: "directory-sync", format }).info(
    message,
  );
}

function expectRole(
  line: string | undefined,
  format: LogFormat,
  role: string,
  message: string,
): void {
  if (format === "json") {
    expect(jsonLineSchema.parse(JSON.parse(String(line)))).toEqual({
      role,
      msg: message,
    });
    return;
  }
  expect(line).toStartWith(`[${role}] [`);
  expect(line).toEndWith(`[directory-sync] ${message}`);
}

describe("a supervised child's log lines carry its role", () => {
  let testDir: string;
  let infoSpy: ReturnType<typeof spyOn<Console, "info">>;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `brain-log-role-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, "brain.yaml"),
      "brain: brain\nbundleContract: capability-bundles-v1\nbundles: [core]\n",
    );
    infoSpy = spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    ConsoleLogger.setProcessRole(undefined);
    resetBootFn();
    resetCanonicalDefinition();
    rmSync(testDir, { recursive: true, force: true });
  });

  it.each(formats)("labels a worker line (%s)", async (format) => {
    const previousApiKey = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "test-key";
    setCanonicalDefinition({
      name: "brain",
      version: "1.0.0",
      capabilities: [],
      interfaces: [],
    });
    setBootFn(async () => {
      logOneLine(format, "sync failed");
    });

    try {
      const result = await start(
        testDir,
        { chat: false },
        { argv: ["start", "--child=worker"], entrypointPath: "/tmp/brain.js" },
      );
      expect(result).toEqual({ success: true });
    } finally {
      if (previousApiKey === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = previousApiKey;
    }

    expectRole(
      String(infoSpy.mock.calls[0]?.[0]),
      format,
      "worker",
      "sync failed",
    );
  });

  it.each(formats)("labels a git-broker line (%s)", async (format) => {
    const processImpl = Object.assign(new EventEmitter(), {
      env: { [GIT_BROKER_SOCKET_ENV]: "/run/brain/git-broker.sock" },
      send: (): void => {},
    });

    const running = runGitBrokerChild(
      testDir,
      { plugins: { "directory-sync": {} } },
      {
        processImpl,
        startHost: async () => {
          logOneLine(format, "checkout ready");
          return { stop: async (): Promise<void> => {} };
        },
      },
    );
    await Bun.sleep(0);
    processImpl.emit("SIGTERM");
    expect(await running).toEqual({ success: true });

    expectRole(
      String(infoSpy.mock.calls[0]?.[0]),
      format,
      "git-broker",
      "checkout ready",
    );
  });
});
