import { describe, expect, it } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "../../..");
const packageRoot = join(repositoryRoot, "packages/brain-cli");
const fixtureRoot = join(import.meta.dir, "fixtures/public-chat-consumer");

describe("public headless Chat package boundary", () => {
  it("exports transport without a public UI model", () => {
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    );

    expect(manifest.exports["./chat"]).toEqual({
      types: "./dist/chat.d.ts",
      import: "./dist/chat.js",
    });
    expect(manifest.exports["./chat-ui-model"]).toBeUndefined();
    expect(manifest.exports["./chat/react"]).toBeUndefined();
  });

  it("keeps view logic out of the public source boundary", () => {
    const entrySource = readFileSync(
      join(packageRoot, "src/entries/chat.ts"),
      "utf8",
    );
    const contractSource = readFileSync(
      join(repositoryRoot, "shared/contracts/src/browser-chat.ts"),
      "utf8",
    );

    expect(entrySource).toContain('from "@brains/contracts/browser-chat"');
    for (const forbidden of [
      'from "react',
      "@tanstack/",
      "useState",
      "QueryClient",
      "localStorage",
      "sessionStorage",
      "window.history",
      "document.querySelector",
      "navigate(",
      "ActiveConversationState",
      "Reducer",
      "defaultOpen",
      "StructuredChatCard",
    ]) {
      expect(entrySource).not.toContain(forbidden);
      expect(contractSource).not.toContain(forbidden);
    }
  });

  it("keeps the external fixture exact-versioned and view-free", () => {
    const manifestSource = readFileSync(
      join(fixtureRoot, "package.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestSource);
    const source = [
      readFileSync(join(fixtureRoot, "src/index.ts"), "utf8"),
      readFileSync(join(fixtureRoot, "smoke.ts"), "utf8"),
    ].join("\n");

    expect(manifest.dependencies["@rizom/brain"]).toBe("0.2.0-alpha.344");
    expect(manifestSource).not.toContain("workspace:");
    expect(source).toContain('from "@rizom/brain/chat"');
    for (const forbidden of [
      "@brains/",
      'from "react',
      "localStorage",
      "useState",
      "QueryClient",
      "navigate(",
      "window.history",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("typechecks the external fixture against only the public source entry", () => {
    const tsconfigPath = join(
      repositoryRoot,
      ".public-chat-contract.tsconfig.json",
    );
    try {
      writeFileSync(
        tsconfigPath,
        JSON.stringify({
          extends:
            "./packages/brain-cli/test/fixtures/public-chat-consumer/tsconfig.json",
          compilerOptions: {
            rootDir: ".",
            types: ["bun"],
            paths: {
              "@rizom/brain/chat": ["./packages/brain-cli/src/entries/chat.ts"],
            },
          },
          include: [
            "./packages/brain-cli/test/fixtures/public-chat-consumer/src/**/*.ts",
            "./packages/brain-cli/test/fixtures/public-chat-consumer/smoke.ts",
          ],
        }),
      );
      const result = Bun.spawnSync(
        ["bunx", "tsc", "--noEmit", "-p", tsconfigPath],
        {
          cwd: repositoryRoot,
          env: process.env,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      expect(
        result.exitCode,
        `public Chat fixture failed to compile:\n${result.stdout.toString()}${result.stderr.toString()}`,
      ).toBe(0);
    } finally {
      rmSync(tsconfigPath, { force: true });
    }
  }, 15_000);
});
