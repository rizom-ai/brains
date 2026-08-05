import { describe, expect, it } from "bun:test";
import {
  DASHBOARD_CHANNELS,
  EMAIL_INBOUND,
  type InboundEmail,
} from "@brains/contracts";
import {
  CMS_WORKSPACE_REGISTER_MESSAGE,
  type CmsWorkspaceActor,
  type CmsWorkspaceRegistration,
  type DashboardWidgetRegistration,
} from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockLogger } from "@brains/test-utils";

import {
  EmailTriagePlugin,
  MailItemPlugin,
  createMailItemProjection,
  emailTriage,
  mailTriageDecisionSchema,
  mailTriageWorkspaceSnapshotSchema,
  type RetainedMailClassification,
} from "../src";

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

const classification: RetainedMailClassification = {
  decision: "retain",
  title: "Possible collaboration",
  category: "opportunity",
  priority: "normal",
  needsReply: true,
  requestedActions: ["Consider availability next month"],
  summary: "A prospective collaborator asks about availability next month.",
};

describe("email triage plugin", () => {
  it("activates the entity and service without a parallel prompt config", () => {
    expect(() =>
      Reflect.apply(emailTriage, undefined, [
        { instructions: "Prioritize collaboration." },
      ]),
    ).toThrow();
    expect(
      emailTriage().map((plugin) => ({ id: plugin.id, type: plugin.type })),
    ).toEqual([
      { id: "mail-item", type: "entity" },
      { id: "email-triage", type: "service" },
    ]);
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
      return { object: schema.parse(classification) };
    };

    await harness.getEntityService().createEntity({
      entity: {
        id: "email-triage-classification",
        entityType: "prompt",
        content: `---
title: Email Triage Classification
target: email-triage:classification
---
Prioritize collaboration connected to Project Aurora.`,
        metadata: {
          title: "Email Triage Classification",
          target: "email-triage:classification",
        },
        created: inbound.receivedAt,
        updated: inbound.receivedAt,
      },
    });
    await harness.installPlugin(new MailItemPlugin());
    await harness.installPlugin(new EmailTriagePlugin());

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
    expect(schemas).toEqual([mailTriageDecisionSchema]);
    expect(items).toHaveLength(1);
    expect(items[0]?.visibility).toBe("restricted");
  });

  it("registers the Admin tool, CMS workflow, inbox source, and compact dashboard", async () => {
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
          data: { workspaceUrl: "/cms/workspaces/email-triage" },
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
    await harness.getEntityService().createEntity({
      entity: {
        ...createMailItemProjection(inbound, classification),
        created: inbound.receivedAt,
        updated: inbound.receivedAt,
      },
    });
    const plugin = new EmailTriagePlugin();
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
    expect(await inboxSource?.list()).toMatchObject([
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
      id: "email-triage",
      label: "Email Triage",
      rendererName: "EmailTriageWorkspace",
      entityTypes: ["mail-item"],
    });
    if (!workspace) throw new Error("CMS workspace was not registered");
    expect(
      await workspace.accessHandler({
        interfaceType: "cms",
        userId: "trusted-user",
        actor: { kind: "user", userId: "trusted-user" },
        userPermissionLevel: "trusted",
        visibilityScope: "shared",
        isAnchor: false,
      }),
    ).toBe(false);
    const admin: CmsWorkspaceActor = {
      interfaceType: "cms",
      userId: "admin-user",
      actor: { kind: "user", userId: "admin-user" },
      userPermissionLevel: "admin",
      visibilityScope: "restricted",
      isAnchor: true,
    };
    expect(await workspace.accessHandler(admin)).toBe(true);
    const workspaceData = mailTriageWorkspaceSnapshotSchema.parse(
      await workspace.dataProvider(admin),
    );
    expect(workspaceData.summary.new).toBe(1);
    expect(workspaceData.items[0]?.title).toBe("Possible collaboration");
    const itemId = workspaceData.items[0]?.id;
    if (!itemId || !workspace.actionHandler) {
      throw new Error("CMS workspace action handler was not registered");
    }
    expect(
      await workspace.actionHandler(
        { type: "mark-reviewed", id: itemId },
        admin,
      ),
    ).toEqual({ id: itemId, status: "reviewed" });
    expect(await inboxSource?.list()).toEqual([]);

    expect(widget).toMatchObject({
      pluginId: "email-triage",
      id: "email-triage",
      title: "Email Triage",
      rendererName: "CustomWidget",
      visibility: "admin",
    });
    if (!widget) throw new Error("Dashboard widget was not registered");
    expect(await widget.dataProvider()).toEqual({
      summary: {
        total: 1,
        new: 0,
        high: 0,
        needsReply: 1,
        unclassified: 0,
      },
      managementUrl: "/cms/workspaces/email-triage",
    });
  });
});
