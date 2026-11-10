import { describe, expect, it, spyOn } from "bun:test";
import {
  createPluginHarness,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import {
  baseEntitySchema,
  type ChannelDeliveryInput,
  type JobHandler,
  type WebRouteDefinition,
  instantiatePluginPackageDefinition,
} from "@brains/plugins";
import { parseFormMarkdown } from "@brains/forms";
import notificationsPackage from "@brains/notifications";
import { CallbackProgressReporter } from "@brains/utils/progress";
import {
  quizPlugin,
  quizResultAdapter,
  quizResultSchema,
  type QuizPlugin,
} from "../src";

const origin = "https://brain.test";
const peer = "192.0.2.1";
const brandTest = `---
target: quiz-result
path: /brand-test
title: Brand test
thanks:
  title: Your result
steps:
  - title: Identity
    fields:
      - kind: choice
        id: q1
        label: Who are you?
        required: true
        options:
          - value: a
            label: Seeking
            scores:
              - dimension: identity
                outcome: seeking
                weight: 2
          - value: b
            label: Play
            scores:
              - dimension: identity
                outcome: play
  - title: You
    fields:
      - kind: email
        id: email
        label: Email
scoring:
  dimensions:
    - id: identity
      title: Identity
      outcomes:
        - id: seeking
          title: Seeking
          body: You look for what is next.
        - id: play
          title: Play
translations:
  zh-TW:
    title: 品牌測驗
    thanks:
      title: 你的結果
    fields:
      q1:
        label: 你是誰？
        options:
          a: 探索
          b: 玩耍
    dimensions:
      identity:
        title: 認同
        outcomes:
          seeking:
            title: 探索
---
Two questions about your brand.
`;

type Harness = ReturnType<typeof createPluginHarness>;

async function setup(): Promise<{
  h: Harness;
  plugin: QuizPlugin;
  sent: ChannelDeliveryInput[];
  handlers: Map<string, JobHandler>;
}> {
  const h = createPluginHarness({ domain: "brain.test" });
  const shell = h.getMockShell();
  const handlers = new Map<string, JobHandler>();
  spyOn(shell.getJobQueueService(), "registerHandler").mockImplementation(
    (type, handler) => {
      handlers.set(type, handler);
    },
  );
  // The brain's other plugins, unified-inbox among them, are installed.
  spyOn(shell, "getPluginPackageName").mockImplementation(
    (id) => `@brains/${id}`,
  );
  spyOn(shell, "getPluginWebRoutes").mockReturnValue([
    {
      pluginId: "studio",
      fullPath: "/studio/workspaces",
      definition: {
        path: "/studio/workspaces",
        method: "GET",
        match: "prefix",
        role: "studio-workspaces",
        public: true,
        handler: (): Response => new Response(),
      },
    },
  ]);
  shell
    .getEntityRegistry()
    .registerEntityType(
      "form",
      baseEntitySchema.partial().passthrough(),
      createTestEntityAdapter("form"),
    );
  const sent: ChannelDeliveryInput[] = [];
  const channels = shell.getChannelRegistry();
  channels.registerDescriptor("test-email", {
    type: "email",
    displayName: "Email",
    subjectLabel: "Email address",
  });
  channels.registerDeliveryProvider("test-email", {
    channelType: "email",
    isAvailable: async () => true,
    send: async (message) => {
      sent.push(message);
      return { status: "sent" };
    },
  });
  channels.finalize();
  const [notifications] = instantiatePluginPackageDefinition(
    notificationsPackage,
    { defaultRecipient: { type: "email", address: "owner@example.com" } },
    { name: "@brains/notifications", version: "0.0.0-test" },
    { pluginId: "notifications" },
  );
  if (!notifications) throw new Error("Notifications installs no plugin");
  await notifications.register(shell);
  const [results, plugin] = quizPlugin();
  await results.register(shell);
  await plugin.register(shell);
  const { title, target, path } = parseFormMarkdown("brand-test", brandTest);
  await h.getEntityService().createEntity({
    entity: {
      id: "brand-test",
      entityType: "form",
      visibility: "public",
      content: brandTest,
      metadata: { title, target, path },
    },
  });
  await plugin.ready();
  return { h, plugin, sent, handlers };
}

function routeFor(
  plugin: QuizPlugin,
  path: string,
  method: "GET" | "POST",
): WebRouteDefinition | undefined {
  return plugin
    .getWebRoutes()
    .find(
      (route) =>
        (route.method ?? "GET") === method &&
        route.match === "claim" &&
        route.claims?.(path),
    );
}

async function take(
  plugin: QuizPlugin,
  path: string,
  answers: string[][],
): Promise<Response> {
  const page = await routeFor(plugin, path, "GET")?.handler(
    new Request(`${origin}${path}`),
    { remoteAddress: peer },
  );
  const token = (await page?.text())?.match(
    /name="token" value="([a-f0-9]+)"/,
  )?.[1];
  if (!token) throw new Error("Missing token");
  const post = routeFor(plugin, path, "POST");
  if (!post) throw new Error(`Nothing takes ${path}`);
  return post.handler(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: { origin, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([["token", token], ...answers]),
    }),
    { remoteAddress: peer },
  );
}

async function thanks(plugin: QuizPlugin, location: string): Promise<string> {
  const response = await routeFor(
    plugin,
    location.split("?")[0] ?? "",
    "GET",
  )?.handler(new Request(`${origin}${location}`), { remoteAddress: peer });
  return (await response?.text()) ?? "";
}

describe("a quiz defined in the brain's content", () => {
  it("is taken in its own language, shows its results, and is kept as a quiz result", async () => {
    const f = await setup();
    const page = await (
      await routeFor(f.plugin, "/brand-test", "GET")?.handler(
        new Request(`${origin}/brand-test`),
        { remoteAddress: peer },
      )
    )?.text();
    expect(page).toContain("<h1>Brand test</h1>");
    expect(page).toContain("<script data-form-steps>");
    const sent = await take(f.plugin, "/brand-test", [
      ["q1", "a"],
      ["email", "ada@example.com"],
    ]);
    expect(sent.status).toBe(303);
    const location = sent.headers.get("location") ?? "";
    expect(location).toMatch(/^\/brand-test\/thanks\?receipt=[a-f0-9]{64}$/);
    const shown = await thanks(f.plugin, location);
    expect(shown).toContain(
      "<h2>Identity</h2><h3>Seeking</h3><p>You look for what is next.</p>",
    );
    const [result] = await f.h.getEntityService().listEntities(
      {
        entityType: "quiz-result",
        options: { filter: { visibilityScope: "restricted" } },
      },
      quizResultSchema,
    );
    if (!result) throw new Error("Missing result");
    // Filed under its quiz, so Studio lists results by quiz.
    expect(result.id).toMatch(/^brand-test:[a-f0-9]{64}$/);
    expect(
      quizResultAdapter.parseContent(result.content).frontmatter,
    ).toMatchObject({
      quiz: "brand-test",
      email: "ada@example.com",
      results: [
        {
          dimension: "identity",
          title: "Identity",
          outcome: "seeking",
          outcomeTitle: "Seeking",
        },
      ],
      answers: [{ field: "q1", label: "Who are you?", value: "Seeking" }],
    });
    await f.plugin.shutdown();
  });

  it("is taken in its translation at its language's path, the result saying so", async () => {
    const f = await setup();
    const page = await (
      await routeFor(f.plugin, "/zh-tw/brand-test", "GET")?.handler(
        new Request(`${origin}/zh-tw/brand-test`),
        { remoteAddress: peer },
      )
    )?.text();
    expect(page).toContain('<html lang="zh-TW"');
    expect(page).toContain("<h1>品牌測驗</h1>");
    expect(page).toContain("下一步");
    const sent = await take(f.plugin, "/zh-tw/brand-test", [["q1", "a"]]);
    expect(sent.headers.get("location")).toMatch(
      /^\/zh-tw\/brand-test\/thanks\?receipt=/,
    );
    const shown = await thanks(f.plugin, sent.headers.get("location") ?? "");
    expect(shown).toContain("<h1>你的結果</h1>");
    expect(shown).toContain("<h2>認同</h2><h3>探索</h3>");
    const [result] = await f.h.getEntityService().listEntities(
      {
        entityType: "quiz-result",
        options: { filter: { visibilityScope: "restricted" } },
      },
      quizResultSchema,
    );
    expect(
      quizResultAdapter.parseContent(result?.content ?? "").frontmatter,
    ).toMatchObject({
      language: "zh-TW",
      answers: [{ field: "q1", label: "你是誰？", value: "探索" }],
    });
    await f.plugin.shutdown();
  });

  it("puts a result in the Inbox only when its taker left an email, and alerts the owner with it", async () => {
    const f = await setup();
    await take(f.plugin, "/brand-test", [["q1", "b"]]);
    await take(f.plugin, "/brand-test", [
      ["q1", "a"],
      ["email", "ada@example.com"],
    ]);
    const registry = f.h.getMockShell().getInboxRegistry();
    registry.finalize();
    const items = (await registry.getSource("quiz-results")?.list()) ?? [];
    expect(items.map((item) => item.summary)).toEqual(["Identity: Seeking"]);
    const jobs = await f.h.getMockShell().getJobQueueService().getActiveJobs();
    const handler = f.handlers.get("quiz:notify");
    for (const job of jobs)
      await handler?.process(
        JSON.parse(job.data),
        job.id,
        CallbackProgressReporter.noop(),
        new AbortController().signal,
      );
    expect(f.sent.map((message) => message.replyTo)).toEqual([
      undefined,
      "ada@example.com",
    ]);
    expect(f.sent[1]?.text).toContain("Results:\nIdentity: Seeking");
    expect(f.sent[1]?.text).toContain("Who are you?: Seeking");
    await f.plugin.shutdown();
  });
});

/** A quiz result file as a directory-sync import or restore reads it: the
 * type deserializes the markdown, and the store keeps the file as written. */
async function importResult(
  h: Harness,
  id: string,
  quizTitle?: string,
): Promise<void> {
  const markdown = quizResultAdapter.createContent({
    quiz: "brand-test",
    ...(quizTitle ? { quizTitle } : {}),
    receivedAt: "2026-11-07T10:00:00.000Z",
    status: "new",
    notification: "none",
    email: "ada@example.com",
    results: [
      {
        dimension: "identity",
        title: "Identity",
        outcome: "seeking",
        outcomeTitle: "Seeking",
      },
    ],
    answers: [{ field: "q1", label: "Who are you?", value: "Seeking" }],
  });
  const entityService = h.getEntityService();
  const parsed = entityService.deserializeEntity(markdown, "quiz-result");
  await entityService.upsertEntity({
    entity: {
      ...parsed,
      id,
      entityType: "quiz-result",
      content: markdown,
      visibility: "restricted",
      metadata: parsed.metadata ?? {},
      created: "2026-11-07T10:00:00.000Z",
      updated: "2026-11-07T10:00:00.000Z",
      contentHash: "",
    },
  });
}

async function inboxTitles(h: Harness): Promise<string[]> {
  const registry = h.getMockShell().getInboxRegistry();
  registry.finalize();
  const items = (await registry.getSource("quiz-results")?.list()) ?? [];
  return items.map((item) => item.title);
}

describe("an imported quiz result", () => {
  it("is listed under the title of the quiz as it was taken", async () => {
    const f = await setup();
    await importResult(
      f.h,
      `brand-test:${"a".repeat(64)}`,
      "Brand personality test",
    );
    const result = await f.h.getEntityService().getEntity(
      {
        entityType: "quiz-result",
        id: `brand-test:${"a".repeat(64)}`,
        visibilityScope: "restricted",
      },
      quizResultSchema,
    );
    expect(result?.metadata.title).toBe("Brand personality test");
    expect(await inboxTitles(f.h)).toEqual(["Brand personality test result"]);
    await f.plugin.shutdown();
  });

  it("written before it kept its quiz's title, is listed under its quiz's id", async () => {
    const f = await setup();
    await importResult(f.h, `brand-test:${"b".repeat(64)}`);
    expect(await inboxTitles(f.h)).toEqual(["brand-test result"]);
    await f.plugin.shutdown();
  });
});
