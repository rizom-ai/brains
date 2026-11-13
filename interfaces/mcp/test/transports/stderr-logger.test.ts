import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { ConsoleLogger } from "@brains/utils/logger";
import { createStderrLogger } from "../../src/transports/types";

/**
 * The stdio transport's own logger: stdout carries the MCP protocol, so every
 * line goes to stderr, and in a supervised child it names the child.
 */
describe("stdio transport logger", () => {
  afterEach(() => {
    ConsoleLogger.setProcessRole(undefined);
  });

  it("writes every level to stderr, labeled with the process role", () => {
    const stderr = spyOn(console, "error").mockImplementation(() => {});
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const stdout = [
      spyOn(console, "log").mockImplementation(() => {}),
      spyOn(console, "info").mockImplementation(() => {}),
      spyOn(console, "debug").mockImplementation(() => {}),
    ];
    ConsoleLogger.setProcessRole("web");

    const logger = createStderrLogger();
    logger.debug("connected");
    logger.info("started");
    logger.error("failed");

    const lines = stderr.mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line).toStartWith("[web] [");
      expect(line).toContain("[STDIO MCP]");
    }
    for (const spy of stdout) expect(spy).not.toHaveBeenCalled();

    for (const spy of [stderr, warn, ...stdout]) spy.mockRestore();
  });
});
