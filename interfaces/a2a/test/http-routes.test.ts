import { afterEach, describe, expect, it } from "bun:test";
import type { Daemon } from "@brains/plugins";
import { A2AInterface } from "../src/a2a-interface";

class TestA2AInterface extends A2AInterface {
  buildDaemon(): Daemon {
    const daemon = this.createDaemon();
    if (!daemon) {
      throw new Error("Expected A2A daemon");
    }
    return daemon;
  }

  getServerPort(): number {
    const server = Reflect.get(this, "server");
    if (!server || typeof server.port !== "number") {
      throw new Error("A2A server not started");
    }
    return server.port;
  }
}

describe("A2A HTTP routes", () => {
  let daemon: ReturnType<TestA2AInterface["buildDaemon"]> | undefined;

  afterEach(async () => {
    if (daemon) {
      await daemon.stop();
      daemon = undefined;
    }
  });

  it("redirects bare / to the agent card", async () => {
    const plugin = new TestA2AInterface({ port: 0 });
    const currentDaemon = plugin.buildDaemon();
    daemon = currentDaemon;
    await currentDaemon.start();

    const response = await fetch(
      `http://127.0.0.1:${plugin.getServerPort()}/`,
      { redirect: "manual" },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/.well-known/agent-card.json",
    );
  });

  it("returns a helpful 405 for GET /a2a", async () => {
    const plugin = new TestA2AInterface({ port: 0 });
    const currentDaemon = plugin.buildDaemon();
    daemon = currentDaemon;
    await currentDaemon.start();

    const response = await fetch(
      `http://127.0.0.1:${plugin.getServerPort()}/a2a`,
    );

    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body).toEqual({
      error: "Use POST with JSON-RPC 2.0 requests.",
      agentCard: "/.well-known/agent-card.json",
    });
  });
});
