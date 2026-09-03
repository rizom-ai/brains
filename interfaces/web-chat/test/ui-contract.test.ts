import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { z } from "@brains/utils/zod";

const packageRoot = join(import.meta.dir, "..");
const packageJsonPath = join(packageRoot, "package.json");
const buildScriptPath = join(packageRoot, "scripts", "build-ui.ts");
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];

const webChatPackageJsonSchema = z.looseObject({
  files: z.array(z.string()),
  scripts: z.record(z.string(), z.string()),
  dependencies: z.record(z.string(), z.string()),
});

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (sourceExtensions.some((extension) => path.endsWith(extension))) {
      files.push(path);
    }
  }

  return files;
}

describe("Web chat UI contract", () => {
  it("publishes the built UI asset directory", () => {
    const packageJson = webChatPackageJsonSchema.parse(
      JSON.parse(readFileSync(packageJsonPath, "utf-8")),
    );

    expect(packageJson.scripts["build"]).toBe("bun scripts/build-ui.ts");
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("src");
  });

  it("keeps React and React DOM on the same declared range", () => {
    const packageJson = webChatPackageJsonSchema.parse(
      JSON.parse(readFileSync(packageJsonPath, "utf-8")),
    );

    const reactVersion = packageJson.dependencies["react"];
    const reactDomVersion = packageJson.dependencies["react-dom"];

    if (!reactVersion || !reactDomVersion) {
      throw new Error("web-chat must declare react and react-dom dependencies");
    }

    expect(reactVersion).toBe(reactDomVersion);
  });

  it("persists a browser conversation id for AI SDK chat requests", () => {
    // App.tsx wires these behaviors together but does not own all of them —
    // assert against every ui-react source so splitting a module out of the
    // app shell stays a refactor rather than a failure.
    const uiSource = listSourceFiles(join(packageRoot, "ui-react", "src"))
      .map((file) => readFileSync(file, "utf-8"))
      .join("\n");
    const apiSource = readFileSync(
      join(packageRoot, "ui-react", "src", "api.ts"),
      "utf-8",
    );
    const mutationSource = readFileSync(
      join(packageRoot, "ui-react", "src", "mutations.ts"),
      "utf-8",
    );

    expect(uiSource).toContain("brain:web-chat:conversation-id");
    expect(uiSource).toContain("localStorage");
    expect(uiSource).toContain("id: conversationId");
    expect(uiSource).toContain("New conversation");
    expect(uiSource).toContain("new Chat<UIMessage>");
    expect(uiSource).toContain("setInitialMessages([])");
    const promptInputSource = readFileSync(
      join(packageRoot, "ui-react", "src", "ai-elements", "prompt-input.tsx"),
      "utf-8",
    );
    expect(promptInputSource).toContain("requestSubmit");
    expect(promptInputSource).toContain("PromptInputMessage");
    expect(uiSource).toContain("isBusyStatus");
    expect(uiSource).toContain("onStop={stop}");
    expect(uiSource).toContain("clearError");
    expect(uiSource).toContain("Dismiss");
    expect(uiSource).toContain("resizePromptTextarea");
    expect(uiSource).toContain("promptInputRef");
    expect(uiSource).toContain("focusPromptTextarea");
    expect(uiSource).toContain("loadSessions");
    expect(uiSource).toContain("switchConversation");
    expect(uiSource).toContain("deriveSessionTitle");
    expect(uiSource).toContain("upsertPendingSession");
    expect(uiSource).toContain("web-chat-sessions-state");
    expect(uiSource).toContain("renameConversation");
    expect(uiSource).toContain("archiveConversation");
    expect(uiSource).toContain("deleteConversation");
    expect(uiSource).toContain("web-chat-session-dialog");
    expect(uiSource).toContain("web-chat-message-header");
    expect(uiSource).toContain("Conversations");
    expect(uiSource).not.toContain("window.prompt");
    expect(uiSource).not.toContain("window.confirm");
    expect(mutationSource).toContain('method: "PUT"');
    expect(mutationSource).toContain('method: "DELETE"');
    expect(mutationSource).toContain("/api/chat/sessions");
    expect(apiSource).toContain("/api/chat/messages");
    expect(uiSource).toContain("queryClient.fetchQuery");
    expect(uiSource).toContain("createActiveMessageSeed");

    const messageSource = readFileSync(
      join(packageRoot, "ui-react", "src", "ai-elements", "message.tsx"),
      "utf-8",
    );
    expect(messageSource).toContain('from "streamdown"');
    expect(messageSource).toContain("MessageResponse");
  });

  it("emits the shared app controls as static StyleX CSS", () => {
    const buildScript = readFileSync(buildScriptPath, "utf-8");
    const css = readFileSync(
      join(packageRoot, "dist", "ui", "app.css"),
      "utf-8",
    );

    expect(buildScript).toContain("createStylexBunTransform");
    expect(buildScript).toContain('writeFile(join(outdir, "app.css")');
    expect(css).toContain("var(--console-accent)");
    expect(css).not.toContain("insertRule");
  });

  it("dedupes React entrypoints in the UI build config", () => {
    const buildScript = readFileSync(buildScriptPath, "utf-8");

    expect(buildScript).toContain('name: "dedupe-react"');
    expect(buildScript).toContain('require.resolve("react/package.json")');
    expect(buildScript).toContain('require.resolve("react-dom/package.json")');
    expect(buildScript).toContain('"react/jsx-runtime"');
    expect(buildScript).toContain('"react/jsx-dev-runtime"');
    expect(buildScript).toContain('"react-dom/client"');
  });
});
