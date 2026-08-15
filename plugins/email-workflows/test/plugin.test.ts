import { beforeEach, describe, expect, it } from "bun:test";
import {
  DASHBOARD_CHANNELS,
  EMAIL_INBOUND,
  type InboundEmail,
} from "@brains/contracts";
import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  resetPromptCache,
  type CmsWorkspaceRegistration,
  type DashboardWidgetRegistration,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockLogger, createMockShell } from "@brains/test-utils";

import {
  EmailWorkflowsPlugin,
  MailItemPlugin,
  createMailItemProjection,
  emailWorkflows,
  type RetainedMailClassification,
} from "../src";
import { EmailReplyDraftEntityPlugin } from "../src/reply-drafts/entity/plugin";

const inbound: InboundEmail = {
  messageId: "<plugin-test@example.com>",
  sourceRef: "imap:plugin-test",
  from: { address: "sender@example.com" },
  to: [{ address: "recipient@example.net" }],
  subject: "A private collaboration request",
  receivedAt: "2026-04-15T09:00:00.000Z",
  text: "Would you be available to collaborate next month?",
  headers: { autoSubmitted: "no" },
};

const adminActor = {
  interfaceType: "cms" as const,
  userId: "admin-user",
  actor: { kind: "user" as const, userId: "admin-user" },
  userPermissionLevel: "admin" as const,
  visibilityScope: "restricted" as const,
  isAnchor: true,
};

function requireActionWorkspace(
  workspace: CmsWorkspaceRegistration | undefined,
): CmsWorkspaceRegistration & {
  actionHandler: NonNullable<CmsWorkspaceRegistration["actionHandler"]>;
} {
  if (!workspace?.actionHandler) {
    throw new Error("Reply draft workspace was not registered");
  }
  return { ...workspace, actionHandler: workspace.actionHandler };
}

const classification: RetainedMailClassification = {
  decision: "retain",
  title: "Possible collaboration",
  category: "opportunity",
  priority: "normal",
  needsReply: true,
  requestedActions: ["Consider availability next month"],
  summary: "A prospective collaborator asks about availability next month.",
};

// Shaped like the classifier's flat wire schema (what the mocked
// generateObject must satisfy), not the domain decision union.
const wireClassification = {
  decision: "retain",
  retained: {
    title: classification.title,
    category: classification.category,
    priority: classification.priority,
    needsReply: classification.needsReply,
    organization: null,
    requestedActions: classification.requestedActions,
    summary: classification.summary,
  },
};

describe("email workflow plugin", () => {
  beforeEach(() => resetPromptCache());

  it("activates the entity and service without a parallel prompt config", () => {
    expect(() =>
      Reflect.apply(emailWorkflows, undefined, [
        { instructions: "Prioritize collaboration." },
      ]),
    ).toThrow();
    expect(
      emailWorkflows().map((plugin) => ({ id: plugin.id, type: plugin.type })),
    ).toEqual([
      { id: "mail-item", type: "entity" },
      { id: "email-reply-draft", type: "entity" },
      { id: "email-workflows", type: "service" },
    ]);
  });

  it("does not expose source-backed drafting in execution-only workers", async () => {
    const shell = createMockShell();
    const plugin = new EmailWorkflowsPlugin();

    await plugin.register(shell, { executionOnly: true });
    shell.getInboxFollowUpRegistry().finalize();

    expect(
      shell
        .getInboxFollowUpRegistry()
        .listKinds()
        .some((kind) => kind.kind === "draft-reply"),
    ).toBe(false);
  });

  it("subscribes to EMAIL_INBOUND and persists before acknowledging", async () => {
    const logger = createMockLogger();
    const harness = createPluginHarness({ logger });
    const prompts: string[] = [];
    const schemas: unknown[] = [];
    harness.getMockShell().generateObject = async <T>(
      prompt: string,
      schema: { parse(input: unknown): T },
    ): Promise<{ object: T }> => {
      prompts.push(prompt);
      schemas.push(schema);
      return { object: schema.parse(wireClassification) };
    };

    await harness.getEntityService().createEntity({
      entity: {
        id: "email-workflows-classification",
        entityType: "prompt",
        content: `---
title: Email Triage Classification
target: email-workflows:classification
---
Prioritize collaboration connected to Project Aurora.`,
        metadata: {
          title: "Email Triage Classification",
          target: "email-workflows:classification",
        },
        created: inbound.receivedAt,
        updated: inbound.receivedAt,
      },
    });
    await harness.installPlugin(new MailItemPlugin());
    await harness.installPlugin(new EmailWorkflowsPlugin());

    const response = await harness.getMockShell().getMessageBus().send({
      type: EMAIL_INBOUND,
      payload: inbound,
      sender: "email",
    });
    const items = await harness.getEntityService().listEntities({
      entityType: "mail-item",
    });

    expect(response).toEqual({ success: true });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(
      "Prioritize collaboration connected to Project Aurora.",
    );
    // The AI receives the classifier's flat wire schema (strict-mode safe),
    // not the domain decision union.
    expect(schemas).toHaveLength(1);
    const wireSchema = schemas[0] as { parse(data: unknown): unknown };
    expect(() => wireSchema.parse(wireClassification)).not.toThrow();
    expect(items).toHaveLength(1);
    expect(items[0]?.visibility).toBe("restricted");
  });

  it("registers triage and reply drafting as one email workflow", async () => {
    const harness = createPluginHarness();
    const entityService = harness.getEntityService();
    entityService.countEntities = async (request): Promise<number> =>
      (
        await entityService.listEntities({
          entityType: request.entityType,
          ...(request.options ? { options: request.options } : {}),
        })
      ).length;
    let workspace: CmsWorkspaceRegistration | undefined;
    let widget:
      (DashboardWidgetRegistration & { pluginId: string }) | undefined;
    harness.subscribe<CmsWorkspaceRegistration, { workspaceUrl: string }>(
      CMS_WORKSPACE_REGISTER_MESSAGE,
      async (message) => {
        workspace = message.payload;
        return {
          success: true,
          data: { workspaceUrl: "/cms/workspaces/email-reply-drafts" },
        };
      },
    );
    harness.subscribe<DashboardWidgetRegistration & { pluginId: string }>(
      DASHBOARD_CHANNELS.registerWidget,
      async (message) => {
        widget = message.payload;
        return { success: true };
      },
    );

    await harness.installPlugin(new MailItemPlugin());
    await harness.installPlugin(new EmailReplyDraftEntityPlugin());
    await harness.getEntityService().createEntity({
      entity: {
        ...createMailItemProjection(inbound, classification),
        created: inbound.receivedAt,
        updated: inbound.receivedAt,
      },
    });
    const plugin = new EmailWorkflowsPlugin();
    const capabilities = await harness.installPlugin(plugin);
    await harness.finalizeRegistration();
    await plugin.ready();

    const inboxSource = harness
      .getMockShell()
      .getInboxRegistry()
      .getSource("mail-items");
    expect(inboxSource).toMatchObject({
      sourceId: "mail-items",
      displayName: "Email Triage",
    });
    const openItems = await inboxSource?.list();
    expect(openItems).toMatchObject([
      {
        title: "Possible collaboration",
        urgency: "normal",
        entityRef: { entityType: "mail-item" },
      },
    ]);

    expect(capabilities.tools.map((tool) => tool.name)).toEqual([
      "email_triage_list",
    ]);
    const denied = await harness.executeTool(
      "email_triage_list",
      {},
      { userPermissionLevel: "trusted" },
    );
    expect(denied).toEqual({
      success: false,
      error: "Email triage requires admin permission",
    });
    const listed = await harness.executeTool("email_triage_list", {
      category: "opportunity",
      priority: "normal",
      status: "new",
      needsReply: true,
    });
    expect(listed).toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [{ title: "Possible collaboration" }],
      },
    });

    expect(workspace).toMatchObject({
      id: "email-reply-drafts",
      pluginId: "email-workflows",
      label: "Reply drafts",
      rendererName: "EmailReplyDraftWorkspace",
      urlQuery: true,
    });
    const replyWorkspace = requireActionWorkspace(workspace);
    const openItem = openItems?.[0];
    const itemId = openItem?.id;
    if (!itemId || !inboxSource) {
      throw new Error("Inbox item was not listed");
    }
    expect(
      await replyWorkspace.dataProvider(adminActor, { mailItemId: itemId }),
    ).toEqual({ mailItemId: itemId, draft: null });
    expect(
      await replyWorkspace.actionHandler(
        { type: "source", mailItemId: itemId },
        adminActor,
      ),
    ).toEqual({
      kind: "source-unavailable",
      error: "Original content is unavailable",
    });
    expect(
      await replyWorkspace.actionHandler(
        { type: "generate", mailItemId: itemId },
        adminActor,
      ),
    ).toEqual({ kind: "error", error: "Draft generation failed" });
    expect(openItem.followUps).toEqual([
      { kind: "draft-reply", context: { mailItemId: itemId } },
    ]);
    expect(
      await harness
        .getMockShell()
        .getInboxFollowUpRegistry()
        .resolve({
          sourceId: "mail-items",
          item: openItem,
          actor: { permissionLevel: "admin" },
        }),
    ).toContainEqual({
      kind: "draft-reply",
      label: "Draft reply",
      href: `/cms/workspaces/email-reply-drafts?mailItemId=${itemId}`,
    });
    await inboxSource.act(itemId, "mark-reviewed", {
      permissionLevel: "admin",
    });
    expect(await inboxSource.list()).toEqual([]);
    expect(
      await harness.executeTool("email_triage_list", { status: "reviewed" }),
    ).toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [{ id: itemId, title: "Possible collaboration" }],
      },
    });

    harness.getMockShell().registerInteraction({
      id: "unified-inbox",
      label: "Inbox",
      description: "Review source-owned items that need operator attention.",
      href: "/studio/workspaces/inbox",
      kind: "admin",
      pluginId: "unified-inbox",
      priority: 20,
      visibility: "admin",
    });
    expect(widget).toMatchObject({
      pluginId: "email-workflows",
      id: "email-workflows",
      title: "Email Triage",
      rendererName: "CustomWidget",
      visibility: "admin",
    });
    if (!widget) throw new Error("Dashboard widget was not registered");
    expect(
      await widget.dataProvider({
        caller: null,
        signal: new AbortController().signal,
      }),
    ).toEqual({
      summary: {
        new: 0,
        high: 0,
        needsReply: 0,
        unclassified: 0,
      },
      links: {
        new: "/studio/workspaces/inbox?sourceId=mail-items",
        high: "/studio/workspaces/inbox?sourceId=mail-items&facet.mail-priority=high",
        needsReply:
          "/studio/workspaces/inbox?sourceId=mail-items&facet.needs-reply=true",
        unclassified:
          "/studio/workspaces/inbox?sourceId=mail-items&facet.category=unclassified",
      },
    });
  });
});
