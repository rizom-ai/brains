import { describe, test, expect, afterEach } from "bun:test";
import { ConsoleLogger, LogLevel } from "../src/logger";
import { mkdtemp, rm, readFile, watch } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "../src/zod";

const logRecordSchema = z.record(z.string(), z.unknown());

/**
 * Wait until the log file holds at least `count` lines.
 *
 * The writes are asynchronous I/O, not timers, so a fake clock cannot drive
 * them and a fixed sleep is only a guess at how fast the disk is. Polling the
 * file is the actual signal. `@brains/utils` cannot import `waitUntil` from
 * `@brains/test-utils` — test-utils depends on this package — so this is a
 * local helper rather than the shared one.
 */
async function waitForLogLines(
  logFile: string,
  count: number,
  deadline = Date.now() + 2000,
): Promise<string[]> {
  const readLines = async (): Promise<string[]> => {
    const content = await readFile(logFile, "utf-8").catch(() => "");
    return content.trim() === "" ? [] : content.trim().split("\n");
  };
  const initial = await readLines();
  if (initial.length >= count) return initial;

  const remainingMs = Math.max(1, deadline - Date.now());
  try {
    for await (const event of watch(dirname(logFile), {
      signal: AbortSignal.timeout(remainingMs),
    })) {
      if (event.filename && event.filename !== basename(logFile)) continue;
      const lines = await readLines();
      if (lines.length >= count) return lines;
    }
  } catch (error) {
    if (Date.now() < deadline) throw error;
  }

  const lines = await readLines();
  throw new Error(
    `Timed out waiting for ${count} log lines; saw ${lines.length}`,
  );
}

function parseLogRecord(
  line: string | undefined,
): z.output<typeof logRecordSchema> | undefined {
  return line ? logRecordSchema.parse(JSON.parse(line)) : undefined;
}

describe("Logger file output", () => {
  let tempDir: string;

  afterEach(async () => {
    ConsoleLogger.resetInstance();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("writes JSON lines to log file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-log-test-"));
    const logFile = join(tempDir, "brain.log");

    const logger = ConsoleLogger.createFresh({
      level: LogLevel.DEBUG,
      context: "test",
      logFile,
    });

    logger.info("hello");
    logger.debug("detail");
    logger.warn("careful");

    const lines = await waitForLogLines(logFile, 3);

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

    const logger = ConsoleLogger.createFresh({
      level: LogLevel.INFO,
      format: "text",
      logFile,
    });

    logger.info("text mode");
    const [onlyLine] = await waitForLogLines(logFile, 1);
    const parsed = parseLogRecord(onlyLine);
    expect(parsed?.["msg"]).toBe("text mode");
  });

  test("child logger inherits log file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-log-test-"));
    const logFile = join(tempDir, "brain.log");

    const parent = ConsoleLogger.createFresh({
      level: LogLevel.INFO,
      logFile,
    });
    const child = parent.child("ChildCtx");

    child.info("from child");
    const [onlyLine] = await waitForLogLines(logFile, 1);
    const parsed = parseLogRecord(onlyLine);
    expect(parsed?.["ctx"]).toBe("ChildCtx");
    expect(parsed?.["msg"]).toBe("from child");
  });

  test("log file includes data args", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-log-test-"));
    const logFile = join(tempDir, "brain.log");

    const logger = ConsoleLogger.createFresh({
      level: LogLevel.INFO,
      logFile,
    });

    logger.info("event", { key: "value" });
    const [onlyLine] = await waitForLogLines(logFile, 1);
    const parsed = parseLogRecord(onlyLine);
    expect(parsed?.["data"]).toEqual([{ key: "value" }]);
  });

  test("respects log level for file output", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-log-test-"));
    const logFile = join(tempDir, "brain.log");

    const logger = ConsoleLogger.createFresh({
      level: LogLevel.WARN,
      logFile,
    });

    logger.debug("should not appear");
    logger.info("should not appear");
    logger.warn("should appear");

    const lines = await waitForLogLines(logFile, 1);
    expect(lines.length).toBe(1);

    const parsed = parseLogRecord(lines[0]);
    expect(parsed?.["level"]).toBe("warn");
  });
});
