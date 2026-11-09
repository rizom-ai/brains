import { describe, expect, it } from "bun:test";
import chatReplPackage from "@brains/chat-repl/package.json";
import { createCliInterface } from "../src/cli-interface";

describe("the CLI interface the app registers with --cli", () => {
  it("is the chat-repl package under the plugin id its class had", async () => {
    const plugins = await createCliInterface({
      theme: { primaryColor: "#000000", accentColor: "#ffffff" },
    });

    expect(
      plugins.map(({ id, type, packageName, version }) => ({
        id,
        type,
        packageName,
        version,
      })),
    ).toEqual([
      {
        id: "cli",
        type: "interface",
        packageName: "@brains/chat-repl",
        version: chatReplPackage.version,
      },
    ]);
  });

  it("refuses a config the CLI's schema refuses", async () => {
    expect(
      createCliInterface({
        // @ts-expect-error a theme color the schema refuses, as brain.yaml may carry one
        theme: { primaryColor: 1, accentColor: "#ffffff" },
      }),
    ).rejects.toThrow("Invalid plugin config for cli at theme.primaryColor");
  });
});
