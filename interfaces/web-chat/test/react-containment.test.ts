import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const packageRoot = join(import.meta.dir, "..");
const packageJsonPath = join(packageRoot, "package.json");
const buildScriptPath = join(packageRoot, "scripts", "build-ui.ts");
const allowedReactDir = `${join("ui-react")}${sep}`;
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"];

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

function importsReact(content: string): boolean {
  const packageName = ["re", "act"].join("");
  return (
    content.includes(`from "${packageName}"`) ||
    content.includes(`from '${packageName}'`) ||
    content.includes(`import("${packageName}")`) ||
    content.includes(`import('${packageName}')`) ||
    content.includes(`@jsxImportSource ${packageName}`)
  );
}

describe("React containment", () => {
  it("publishes the built UI asset directory", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      files: string[];
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["build"]).toBe("bun scripts/build-ui.ts");
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("src");
  });

  it("keeps React and React DOM on the same declared range", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      dependencies: Record<string, string>;
    };

    const reactVersion = packageJson.dependencies["react"];
    const reactDomVersion = packageJson.dependencies["react-dom"];

    if (!reactVersion || !reactDomVersion) {
      throw new Error("web-chat must declare react and react-dom dependencies");
    }

    expect(reactVersion).toBe(reactDomVersion);
  });

  it("persists a browser conversation id for AI SDK chat requests", () => {
    const appSource = readFileSync(
      join(packageRoot, "ui-react", "src", "App.tsx"),
      "utf-8",
    );

    expect(appSource).toContain("brain:web-chat:conversation-id");
    expect(appSource).toContain("localStorage");
    expect(appSource).toContain("id: conversationId");
    expect(appSource).toContain("New conversation");
    expect(appSource).toContain("new Chat<UIMessage>");
    expect(appSource).toContain("setInitialMessages([])");
    const promptInputSource = readFileSync(
      join(packageRoot, "ui-react", "src", "ai-elements", "prompt-input.tsx"),
      "utf-8",
    );
    expect(promptInputSource).toContain("requestSubmit");
    expect(promptInputSource).toContain("PromptInputMessage");
    expect(appSource).toContain("isBusyStatus");
    expect(appSource).toContain("onStop={stop}");
    expect(appSource).toContain("clearError");
    expect(appSource).toContain("Dismiss");
    expect(appSource).toContain("resizePromptTextarea");
    expect(appSource).toContain("promptInputRef");
    expect(appSource).toContain("focusPromptTextarea");
    expect(appSource).toContain("loadSessions");
    expect(appSource).toContain("switchConversation");
    expect(appSource).toContain("deriveSessionTitle");
    expect(appSource).toContain("upsertPendingSession");
    expect(appSource).toContain("void loadSessions({ quiet: true })");
    expect(appSource).toContain("uploadAccept");
    expect(appSource).toContain("PromptAttachmentButton");
    expect(appSource).toContain("UploadedFilePart");
    expect(appSource).toContain("uploadNotice");
    expect(appSource).toContain('case "file"');
    expect(appSource).toContain("web-chat-sessions-state");
    expect(appSource).toContain("renameConversation");
    expect(appSource).toContain("archiveConversation");
    expect(appSource).toContain("deleteConversation");
    expect(appSource).toContain("web-chat-session-dialog");
    expect(appSource).not.toContain("window.prompt");
    expect(appSource).not.toContain("window.confirm");
    expect(appSource).toContain('method: "PUT"');
    expect(appSource).toContain('method: "DELETE"');
    expect(appSource).toContain("/api/chat/sessions");
    expect(appSource).toContain("/api/chat/messages");

    const messageSource = readFileSync(
      join(packageRoot, "ui-react", "src", "ai-elements", "message.tsx"),
      "utf-8",
    );
    expect(messageSource).toContain('from "streamdown"');
    expect(messageSource).toContain("MessageResponse");
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

  it("keeps React imports inside ui-react", () => {
    const violations = listSourceFiles(packageRoot)
      .map((file) => ({ file, relativePath: relative(packageRoot, file) }))
      .filter((entry) => !entry.relativePath.startsWith(allowedReactDir))
      .filter((entry) => importsReact(readFileSync(entry.file, "utf-8")))
      .map((entry) => entry.relativePath);

    expect(violations).toEqual([]);
  });
});
