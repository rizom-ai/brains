import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, expect, it, spyOn } from "bun:test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  dashboardWidgetRegisterContract,
  SYSTEM_CHANNELS,
  type BaseEntity,
  type ListEntitiesRequest,
} from "@brains/plugins";
import { topicDocument } from "../../src/lib/topic-document";
import { createTopicsPlugins } from "../topics-plugins";

const adapter = topicDocument;

function createTopic(id: string, title: string, content: string): BaseEntity {
  const now = new Date().toISOString();
  return {
    id,
    entityType: "topic",
    content: adapter.createTopicBody({ title, content }),
    contentHash: "hash",
    visibility: "public",
    metadata: {},
    created: now,
    updated: now,
  };
}

interface RegisteredWidget {
  id: string;
  group: string;
  rendererName: string;
  digestProvider: unknown;
  dataProvider(context: {
    caller: unknown;
    signal: AbortSignal;
  }): Promise<unknown>;
}

/** The topics package on a shell, its widget as the Dashboard receives it. */
async function topicsWidget(
  shell: MockShell,
): Promise<RegisteredWidget | undefined> {
  const registered: RegisteredWidget[] = [];
  shell
    .getMessageBus()
    .subscribe<RegisteredWidget>(
      dashboardWidgetRegisterContract.name,
      async (message) => {
        registered.push(message.payload);
        return { success: true };
      },
    );
  for (const plugin of createTopicsPlugins()) await plugin.register(shell);
  await shell.getMessageBus().send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "shell",
    broadcast: true,
  });
  return registered.find(({ id }) => id === "topics");
}

describe("the topics Dashboard widget", () => {
  it("registers a dashboard widget with topic items", async () => {
    const shell = createMockShell();
    shell.addEntities([
      createTopic(
        "human-ai-collaboration",
        "Human-AI Collaboration",
        "Humans and AI systems work together. More detail follows.",
      ),
    ]);
    const registeredWidget = await topicsWidget(shell);
    if (!registeredWidget) throw new Error("Widget was not registered");

    expect(registeredWidget).toEqual(
      expect.objectContaining({
        id: "topics",
        group: "knowledge",
        rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
        digestProvider: expect.any(Function),
      }),
    );

    // Assert the whole value: toEqual checks every key.
    const data = await registeredWidget.dataProvider({
      caller: null,
      signal: new AbortController().signal,
    });

    expect(data).toEqual({
      view: {
        blocks: [
          {
            type: "list",
            id: "topics",
            empty: "No topics yet.",
            items: [
              {
                id: "human-ai-collaboration",
                title: "Human-AI Collaboration",
                description: "Humans and AI systems work together.",
              },
            ],
          },
        ],
      },
      digest: {
        items: [
          {
            label: "Latest topic",
            value: "Human-AI Collaboration",
          },
        ],
      },
    });
  });

  // An unscoped read sees public topics only, so the owner saw none of the
  // topics derived from their non-public work.
  it("reads topics at the caller's scope", async () => {
    const requests: ListEntitiesRequest[] = [];
    const shell = createMockShell();
    const listEntities = spyOn(shell.getEntityService(), "listEntities");
    const registered = await topicsWidget(shell);
    if (!registered) throw new Error("Widget was not registered");

    listEntities.mockClear();
    await registered.dataProvider({
      caller: { actor: { id: "owner" }, permission: "admin", isAnchor: true },
      signal: new AbortController().signal,
    });
    requests.push(
      ...listEntities.mock.calls
        .map(([request]) => request)
        .filter((request) => request.entityType === "topic"),
    );

    expect(requests).toEqual([
      expect.objectContaining({
        options: expect.objectContaining({
          filter: { visibilityScope: "restricted" },
        }),
      }),
    ]);
  });
});
