import { expect } from "bun:test";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { MCPClient } from "../../src/lib/mcp-client";
import { combinedOutput, startCommand, stopProcess } from "./packed-consumer";

const imageResponse = z.object({
  success: z.literal(true),
  data: z.object({
    entity: z.object({
      id: z.literal("packed-image"),
      content: z.string(),
      metadata: z.object({
        width: z.literal(1),
        height: z.literal(1),
        mediaType: z.literal("image/png"),
        sizeBytes: z.literal(70),
      }),
    }),
  }),
});

const runtimeFailures =
  /Error initializing plugin|Failed to initialize plugin|Persistence owner lost|Proof driver overloaded|Projection coordination sweep failed|Scheduled projection wakeup failed|driver is closed|Local database owner closed|Local database endpoint is unavailable/;

/** Installed actors, global-to-local handoff, joined shutdown and direct restart. */
export async function verifyInstalledFileRuntime(
  directory: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const dist = join(directory, "node_modules/@rizom/brain/dist");
  // A different executable path exercises a real local-over-global handoff.
  await copyFile(join(dist, "brain.js"), join(dist, "global-brain.js"));
  for (let boot = 0; boot < 2; boot++) {
    const runtime = startCommand(
      ["bun", join(dist, boot === 0 ? "global-brain.js" : "brain.js"), "start"],
      directory,
      { env },
    );
    const failures: unknown[] = [];
    let client: MCPClient | undefined;
    try {
      await runtime.waitForOutput("Brain worker runtime ready");
      if (boot === 0) {
        await copyFile(
          join(directory, "packed-image.png"),
          join(directory, "acceptance-content/image/packed-image.png"),
        );
      }
      const port =
        /Production server listening on http:\/\/localhost:(\d+)/.exec(
          combinedOutput(runtime.getOutput()),
        )?.[1];
      expect(port).toBeDefined();
      client = new MCPClient(
        `http://127.0.0.1:${port}/mcp`,
        "packed-file-runtime",
      );
      await client.connect();
      const deadline = Date.now() + 30_000;
      let response: unknown;
      do {
        response = JSON.parse(
          await client.callTool("system_get", {
            entityType: "image",
            id: "packed-image",
          }),
        );
        if (imageResponse.safeParse(response).success) break;
        await Bun.sleep(100);
      } while (Date.now() < deadline);
      const parsed = imageResponse.safeParse(response);
      if (!parsed.success) {
        throw new Error(`Image readback failed: ${JSON.stringify(response)}`, {
          cause: parsed.error,
        });
      }
      expect(parsed.data.data.entity.content).toBe(
        "asset://sha256/6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0",
      );
    } catch (error) {
      failures.push(error);
    } finally {
      try {
        await client?.close();
      } catch (error) {
        failures.push(error);
      }
      try {
        await stopProcess(runtime.process);
      } catch (error) {
        failures.push(error);
      }
    }
    const stopped = await runtime.completed;
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Installed file runtime boot ${boot + 1} failed:\n${combinedOutput(stopped)}`,
      );
    }
    expect(stopped.exitCode).toBe(0);
    expect(combinedOutput(stopped)).not.toMatch(runtimeFailures);
  }
}
