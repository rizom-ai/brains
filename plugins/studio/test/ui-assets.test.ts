import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "@brains/utils/zod";

const manifestSchema = z.object({
  version: z.literal(1),
  assets: z.record(z.string(), z.string()),
});
const uiDirectory = join(import.meta.dir, "..", "dist", "ui");

function readManifest(): z.output<typeof manifestSchema> {
  return manifestSchema.parse(
    JSON.parse(
      readFileSync(join(uiDirectory, "studio-asset-manifest.json"), "utf8"),
    ),
  );
}

describe("Studio split UI assets", () => {
  it("emits one bounded manifest with lazy native Account and Chat chunks", () => {
    const manifest = readManifest();
    const entries = Object.entries(manifest.assets);

    expect(manifest.assets["app.js"]).toBe("studio-app.js");
    expect(manifest.assets["app.css"]).toBe("studio-app.css");
    expect(
      entries.every(
        ([publicPath, filePath]) =>
          /^(?:app\.(?:js|css)|studio-app\.js\.map|studio-chunks\/[A-Za-z0-9_-]+\.(?:js|js\.map))$/.test(
            publicPath,
          ) &&
          /^(?:studio-app\.(?:js|css)|studio-app\.js\.map|studio-chunks\/[A-Za-z0-9_-]+\.(?:js|js\.map))$/.test(
            filePath,
          ),
      ),
    ).toBe(true);

    const accountEntry = entries.find(([publicPath]) =>
      /^studio-chunks\/account-view-[a-z0-9]+\.js$/.test(publicPath),
    );
    expect(accountEntry).toBeDefined();
    if (!accountEntry) throw new Error("Missing lazy Account asset");

    const stylesheet = readFileSync(
      join(uiDirectory, manifest.assets["app.css"] ?? ""),
      "utf8",
    );
    expect(stylesheet).toContain("var(--console-accent)");
    expect(stylesheet).not.toContain("insertRule");
    // The area/leaf composition and Browse breakpoint must ship as CSS,
    // including styles used by lazy native Chat and Account.
    expect(stylesheet).toContain("grid-template-columns:124px minmax(0,220px)");
    expect(stylesheet).toContain("grid-template-columns:344px minmax(0,1fr)");
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*900px\)/);
    for (const [, filePath] of entries.filter(([, file]) =>
      file.endsWith(".js"),
    )) {
      const source = readFileSync(join(uiDirectory, filePath), "utf8");
      expect(source).not.toContain("stylex.create(");
      expect(source).not.toContain("@stylexjs/babel-plugin");
    }

    const entrySource = readFileSync(
      join(uiDirectory, manifest.assets["app.js"] ?? ""),
      "utf8",
    );
    const accountSource = readFileSync(
      join(uiDirectory, accountEntry[1]),
      "utf8",
    );

    expect(entrySource).toContain(accountEntry[0]);
    expect(entrySource).not.toContain("/auth/account/passkeys/options");
    expect(accountSource).toContain("/auth/account/passkeys/options");
    expect(accountSource).toContain("Signed-in sessions");

    const chatEntry = entries.find(([publicPath]) =>
      /^studio-chunks\/studio-chat-workspace-[a-z0-9]+\.js$/.test(publicPath),
    );
    expect(chatEntry).toBeDefined();
    if (!chatEntry) throw new Error("Missing lazy native Chat asset");
    const chatSource = readFileSync(join(uiDirectory, chatEntry[1]), "utf8");

    expect(entrySource).toContain(chatEntry[0]);
    expect(entrySource).not.toContain("/api/chat");
    expect(chatSource).toContain("/api/chat");
    expect(chatSource).toContain("Working room");
    expect(chatSource).not.toContain("data-web-chat-root");
    expect(chatSource).not.toContain("<iframe");
  });
});
