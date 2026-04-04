import { describe, test, expect, afterEach } from "bun:test";
import { Logger, LogLevel } from "../src/logger";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Logger file output", () => {
  let tempDir: string;

  afterEach(async () => {
    Logger.resetInstance();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("writes JSON lines to log file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-log-test-"));
    const logFile = join(tempDir, "brain.log");

    const logger = Logger.createFresh({
      level: LogLevel.DEBUG,
      context: "test",
      logFile,
    });

    logger.info("hello");
    logger.debug("detail");
    logger.warn("careful");

    // Flush — give async write a moment
    await new Promise((r) => setTimeout(r, 50));

    const content = await readFile(logFile, "utf-8");
    const lines = content.trim().split("\n");

    expect(lines.length).toBe(3);

    const first = lines[0]
      ? (JSON.parse(lines[0]) as Record<string, unknown>)
      : undefined;
    expect(first?.["level"]).toBe("info");
    expect(first?.["msg"]).toBe("hello");
    expect(first?.["ctx"]).toBe("test");

    const second = lines[1]
      ? (JSON.parse(lines[1]) as Record<string, unknown>)
      : undefined;
    expect(second?.["level"]).toBe("debug");

    const third = lines[2]
      ? (JSON.parse(lines[2]) as Record<string, unknown>)
      : undefined;
    expect(third?.["level"]).toBe("warn");
  });

  test("log file always uses JSON regardless of format setting", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-log-test-"));
    const logFile = join(tempDir, "brain.log");

    const logger = Logger.createFresh({
      level: LogLevel.INFO,
      format: "text",
      logFile,
    });

    logger.info("text mode");
    await new Promise((r) => setTimeout(r, 50));

    const content = await readFile(logFile, "utf-8");
    const parsed = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(parsed["msg"]).toBe("text mode");
  });

  test("child logger inherits log file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-log-test-"));
    const logFile = join(tempDir, "brain.log");

    const parent = Logger.createFresh({
      level: LogLevel.INFO,
      logFile,
    });
    const child = parent.child("ChildCtx");

    child.info("from child");
    await new Promise((r) => setTimeout(r, 50));

    const content = await readFile(logFile, "utf-8");
    const parsed = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(parsed["ctx"]).toBe("ChildCtx");
    expect(parsed["msg"]).toBe("from child");
  });

  test("log file includes data args", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-log-test-"));
    const logFile = join(tempDir, "brain.log");

    const logger = Logger.createFresh({
      level: LogLevel.INFO,
      logFile,
    });

    logger.info("event", { key: "value" });
    await new Promise((r) => setTimeout(r, 50));

    const content = await readFile(logFile, "utf-8");
    const parsed = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(parsed["data"]).toEqual([{ key: "value" }]);
  });

  test("respects log level for file output", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-log-test-"));
    const logFile = join(tempDir, "brain.log");

    const logger = Logger.createFresh({
      level: LogLevel.WARN,
      logFile,
    });

    logger.debug("should not appear");
    logger.info("should not appear");
    logger.warn("should appear");

    await new Promise((r) => setTimeout(r, 50));

    const content = await readFile(logFile, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(1);

    const parsed = lines[0]
      ? (JSON.parse(lines[0]) as Record<string, unknown>)
      : undefined;
    expect(parsed?.["level"]).toBe("warn");
  });
});
