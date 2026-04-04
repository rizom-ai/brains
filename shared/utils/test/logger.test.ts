import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Logger, LogLevel } from "../src/logger";

describe("Logger", () => {
  beforeEach(() => {
    Logger.resetInstance();
  });

  afterEach(() => {
    Logger.resetInstance();
  });

  describe("text format (default)", () => {
    test("formats with timestamp and context", () => {
      const spy = spyOn(console, "info").mockImplementation(() => {});
      const logger = Logger.createFresh({ context: "TestCtx" });
      logger.info("hello");
      expect(spy).toHaveBeenCalledTimes(1);
      const msg = spy.mock.calls[0]?.[0] as string;
      expect(msg).toMatch(/^\[.*\] \[TestCtx\] hello$/);
      spy.mockRestore();
    });

    test("formats without context", () => {
      const spy = spyOn(console, "info").mockImplementation(() => {});
      const logger = Logger.createFresh({});
      logger.info("hello");
      const msg = spy.mock.calls[0]?.[0] as string;
      expect(msg).toMatch(/^\[.*\] hello$/);
      expect(msg).not.toContain("[undefined]");
      spy.mockRestore();
    });
  });

  describe("json format", () => {
    test("outputs JSON line with level, context, and message", () => {
      const spy = spyOn(console, "info").mockImplementation(() => {});
      const logger = Logger.createFresh({
        context: "TestCtx",
        format: "json",
      });
      logger.info("hello world");
      expect(spy).toHaveBeenCalledTimes(1);
      const raw = spy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      expect(parsed["level"]).toBe("info");
      expect(parsed["ctx"]).toBe("TestCtx");
      expect(parsed["msg"]).toBe("hello world");
      expect(typeof parsed["ts"]).toBe("string");
      spy.mockRestore();
    });

    test("includes extra args as data field", () => {
      const spy = spyOn(console, "info").mockImplementation(() => {});
      const logger = Logger.createFresh({
        format: "json",
      });
      logger.info("event", { key: "value" });
      const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string) as Record<
        string,
        unknown
      >;
      expect(parsed["msg"]).toBe("event");
      expect(parsed["data"]).toEqual([{ key: "value" }]);
      spy.mockRestore();
    });

    test("omits data field when no extra args", () => {
      const spy = spyOn(console, "info").mockImplementation(() => {});
      const logger = Logger.createFresh({ format: "json" });
      logger.info("clean");
      const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string) as Record<
        string,
        unknown
      >;
      expect(parsed["data"]).toBeUndefined();
      spy.mockRestore();
    });

    test("works for all log levels", () => {
      const debugSpy = spyOn(console, "debug").mockImplementation(() => {});
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = spyOn(console, "error").mockImplementation(() => {});

      const logger = Logger.createFresh({
        level: LogLevel.DEBUG,
        format: "json",
      });

      logger.debug("d");
      logger.warn("w");
      logger.error("e");

      const dParsed = JSON.parse(
        debugSpy.mock.calls[0]?.[0] as string,
      ) as Record<string, unknown>;
      const wParsed = JSON.parse(
        warnSpy.mock.calls[0]?.[0] as string,
      ) as Record<string, unknown>;
      const eParsed = JSON.parse(
        errorSpy.mock.calls[0]?.[0] as string,
      ) as Record<string, unknown>;

      expect(dParsed["level"]).toBe("debug");
      expect(wParsed["level"]).toBe("warn");
      expect(eParsed["level"]).toBe("error");

      debugSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("child logger inherits format", () => {
    test("child of json logger outputs json", () => {
      const spy = spyOn(console, "info").mockImplementation(() => {});
      const parent = Logger.createFresh({ format: "json" });
      const child = parent.child("ChildCtx");
      child.info("from child");
      const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string) as Record<
        string,
        unknown
      >;
      expect(parsed["ctx"]).toBe("ChildCtx");
      expect(parsed["level"]).toBe("info");
      spy.mockRestore();
    });

    test("child of text logger outputs text", () => {
      const spy = spyOn(console, "info").mockImplementation(() => {});
      const parent = Logger.createFresh({});
      const child = parent.child("ChildCtx");
      child.info("from child");
      const msg = spy.mock.calls[0]?.[0] as string;
      expect(msg).toContain("[ChildCtx]");
      expect(msg).not.toStartWith("{");
      spy.mockRestore();
    });
  });

  describe("level filtering", () => {
    test("suppresses messages below configured level", () => {
      const spy = spyOn(console, "debug").mockImplementation(() => {});
      const logger = Logger.createFresh({ level: LogLevel.INFO });
      logger.debug("should not appear");
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("useStderr", () => {
    test("info writes to stderr when useStderr is true", () => {
      const spy = spyOn(console, "error").mockImplementation(() => {});
      const logger = Logger.createFresh({ useStderr: true });
      logger.info("stderr msg");
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
