import { describe, test, expect, afterEach } from "bun:test";
import { Logger, LogLevel } from "../src/logger";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../src/zod-v4";

const logRecordSchema = z.record(z.string(), z.unknown());

function parseLogRecord(
  line: string | undefined,
): z.output<typeof logRecordSchema> | undefined {
  return line ? logRecordSchema.parse(JSON.parse(line)) : undefined;
}

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

    const first = parseLogRecord(lines[0]);
    expect(first?.["level"]).toBe("info");
    expect(first?.["msg"]).toBe("hello");
    expect(first?.["ctx"]).toBe("test");

    const second = parseLogRecord(lines[1]);
    expect(second?.["level"]).toBe("debug");

    const third = parseLogRecord(lines[2]);
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
    const parsed = parseLogRecord(content.trim());
    expect(parsed?.["msg"]).toBe("text mode");
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
    const parsed = parseLogRecord(content.trim());
    expect(parsed?.["ctx"]).toBe("ChildCtx");
    expect(parsed?.["msg"]).toBe("from child");
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
    const parsed = parseLogRecord(content.trim());
    expect(parsed?.["data"]).toEqual([{ key: "value" }]);
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

    const parsed = parseLogRecord(lines[0]);
    expect(parsed?.["level"]).toBe("warn");
  });
});
