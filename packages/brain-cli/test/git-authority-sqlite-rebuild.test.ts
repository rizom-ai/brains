import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MigrationManager, resolve } from "@brains/app";
import { Shell } from "@brains/core";
import { Logger, LogLevel } from "@brains/utils/logger";
import { canonicalBrain } from "../src/model/canonical-brain";
import {
  MOCK_LOAD_API_KEY,
  MOCK_LOAD_MODEL,
  MockLoadAIService,
  MockLoadTracker,
} from "./helpers/mocked-ai-load-services";

const DATABASE_NAMES = [
  "brain.db",
  "jobs.db",
  "conversations.db",
  "runtime-state.db",
  "embeddings.db",
] as const;

async function run(command: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${stderr}`);
  }
  return stdout.trim();
}

async function resetDatabases(root: string, logger: Logger): Promise<void> {
  for (const name of DATABASE_NAMES) {
    await rm(join(root, name), { force: true });
    await rm(join(root, `${name}-shm`), { force: true });
    await rm(join(root, `${name}-wal`), { force: true });
  }
  await new MigrationManager(logger).runAllMigrations({
    database: `file:${join(root, "brain.db")}`,
    jobQueueDatabase: `file:${join(root, "jobs.db")}`,
    conversationDatabase: `file:${join(root, "conversations.db")}`,
    runtimeStateDatabase: `file:${join(root, "runtime-state.db")}`,
  });
}

function createShell(
  root: string,
  dataDir: string,
  tracker: MockLoadTracker,
): Shell {
  const resolved = resolve(
    canonicalBrain,
    {},
    {
      name: "Hermetic Git authority rebuild",
      bundleContract: "capability-bundles-v1",
      bundles: ["core"],
      remove: [
        "prompt",
        "profile",
        "style-guide",
        "image",
        "document",
        "link",
        "wishlist",
        "topics",
        "decks",
        "atproto-registry",
        "agents",
        "assessment",
        "auth-service",
        "account",
        "notifications",
        "playbook",
        "playbooks",
        "onboarding",
        "email",
        "cms",
        "dashboard",
        "admin",
        "mcp",
        "webserver",
        "web-chat",
        "chat",
        "a2a",
      ],
      plugins: {
        "directory-sync": {
          autoSync: false,
          initialSync: true,
          seedContent: false,
        },
      },
    },
  );
  const logger = Logger.getInstance({ level: LogLevel.ERROR });
  return Shell.createFresh(
    {
      name: resolved.name,
      version: resolved.version,
      plugins: resolved.plugins ?? [],
      permissions: resolved.permissions ?? {},
      spaces: resolved.spaces ?? [],
      database: { url: `file:${join(root, "brain.db")}` },
      jobQueueDatabase: { url: `file:${join(root, "jobs.db")}` },
      conversationDatabase: {
        url: `file:${join(root, "conversations.db")}`,
      },
      runtimeStateDatabase: {
        url: `file:${join(root, "runtime-state.db")}`,
      },
      embeddingDatabase: { url: `file:${join(root, "embeddings.db")}` },
      dataDir,
      ai: { apiKey: MOCK_LOAD_API_KEY, model: MOCK_LOAD_MODEL },
      embedding: { enabled: false },
      logging: { level: "error", context: "git-authority-rebuild" },
    },
    {
      logger,
      aiService: new MockLoadAIService(tracker, { delayMs: 0 }),
    },
  );
}

async function assertAuthoritativeState(shell: Shell): Promise<void> {
  await shell.initialize();
  await shell.getJobQueueService().waitForIdle({
    quietMs: 100,
    timeoutMs: 10_000,
  });
  const entityService = shell.getEntityService();
  const [notes, anchorProfile, brainCharacter] = await Promise.all([
    entityService.listEntities({ entityType: "note" }),
    entityService.getEntity({
      entityType: "anchor-profile",
      id: "anchor-profile",
    }),
    entityService.getEntity({
      entityType: "brain-character",
      id: "brain-character",
    }),
  ]);
  expect(notes.map(({ id }) => id).sort()).toEqual([
    "authoritative-one",
    "authoritative-two",
  ]);
  expect(anchorProfile).toBeDefined();
  expect(brainCharacter).toBeDefined();
  expect(await entityService.hasPendingEntityExports()).toBe(false);
}

describe("Git-authoritative SQLite rebuild", () => {
  let tempRoot: string | undefined;
  let shell: Shell | undefined;

  afterEach(async () => {
    await shell?.shutdown();
    Logger.resetInstance();
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  it("rebuilds exact entity state after deleting SQLite without any AI work", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "git-authority-rebuild-"));
    const dataDir = join(tempRoot, "content");
    await Promise.all([
      mkdir(join(dataDir, "anchor-profile"), { recursive: true }),
      mkdir(join(dataDir, "brain-character"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(dataDir, "authoritative-one.md"),
        "---\ntitle: Authoritative One\n---\n\nFirst Git-authoritative note.\n",
      ),
      writeFile(
        join(dataDir, "authoritative-two.md"),
        "---\ntitle: Authoritative Two\n---\n\nSecond Git-authoritative note.\n",
      ),
      writeFile(
        join(dataDir, "anchor-profile", "anchor-profile.md"),
        "---\nname: Authoritative Anchor\n---\n",
      ),
      writeFile(
        join(dataDir, "brain-character", "brain-character.md"),
        [
          "---",
          "name: Authoritative Brain",
          "role: Rebuild verifier",
          "purpose: Verify Git-authoritative recovery",
          "values:",
          "  - durability",
          "  - hermeticity",
          "---",
          "",
        ].join("\n"),
      ),
    ]);
    await run(["git", "init", "--initial-branch=main"], dataDir);
    await run(["git", "config", "user.name", "Rebuild Test"], dataDir);
    await run(["git", "config", "user.email", "rebuild@example.test"], dataDir);
    await run(["git", "add", "-A"], dataDir);
    await run(["git", "commit", "-m", "authoritative content"], dataDir);

    const tracker = new MockLoadTracker();
    const logger = Logger.getInstance({ level: LogLevel.ERROR });
    await resetDatabases(tempRoot, logger);
    shell = createShell(tempRoot, dataDir, tracker);
    await assertAuthoritativeState(shell);
    await shell.shutdown();
    shell = undefined;

    await resetDatabases(tempRoot, logger);
    shell = createShell(tempRoot, dataDir, tracker);
    await assertAuthoritativeState(shell);

    expect(tracker.snapshot()).toMatchObject({
      embeddingCalls: 0,
      objectCalls: 0,
      textCalls: 0,
    });
    expect(await run(["git", "status", "--porcelain"], dataDir)).toBe("");
  });
});
