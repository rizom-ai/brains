import { describe, expect, it, spyOn } from "bun:test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { Shell } from "../src/shell";
import { createTestShellConfig } from "./helpers/test-config";

describe("Shell capability registration", () => {
  it("propagates tool and resource failures so plugin registration can roll back", async () => {
    const directory = await createTestDirectory();
    const shell = Shell.createFresh(createTestShellConfig(directory.dir), {
      logger: createSilentLogger(),
    });
    const failure = new Error("Capability registration failed");
    const toolRegistration = spyOn(
      shell.getMCPService(),
      "registerTool",
    ).mockImplementation(() => {
      throw failure;
    });
    const resourceRegistration = spyOn(
      shell.getMCPService(),
      "registerResource",
    ).mockImplementation(() => {
      throw failure;
    });
    try {
      expect(() =>
        shell.registerTools("owner", [
          {
            name: "test_tool",
            description: "Test",
            inputSchema: {},
            handler: async (): Promise<{ success: true }> => ({
              success: true,
            }),
          },
        ]),
      ).toThrow(failure);
      expect(() =>
        shell.registerResources("owner", [
          {
            name: "test-resource",
            uri: "test://resource",
            description: "Test",
            mimeType: "text/plain",
            handler: async (): Promise<{ contents: [] }> => ({ contents: [] }),
          },
        ]),
      ).toThrow(failure);
    } finally {
      toolRegistration.mockRestore();
      resourceRegistration.mockRestore();
      await shell.shutdown();
      await directory.cleanup();
    }
  });
});
