import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { EMAIL_INBOUND, type InboundEmail } from "@brains/contracts";
import { resetPromptCache } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  createMailItemProjection,
  type RetainedMailClassification,
} from "../src";
import {
  ENTITY_PLUGIN_ID,
  SERVICE_PLUGIN_ID,
  installEmailWorkflows,
  instantiate,
} from "./helpers/install";

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

describe("email workflows package", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("email-workflows-package-test"),
  });

  beforeEach(() => resetPromptCache());
  afterEach(async () => {
    await harness.reset();
  });

  it("produces the service and the mail-item entity, scoped to the package, from an empty config", () => {
    const { service, entity } = instantiate();

    expect(entity.id).toBe(ENTITY_PLUGIN_ID);
    expect(entity.type).toBe("entity");
    expect(service.id).toBe(SERVICE_PLUGIN_ID);
    expect(service.type).toBe("service");
    // The rubric is an operator-editable prompt, not configuration.
    expect(() =>
      instantiate({ instructions: "Prioritize collaboration." }),
    ).toThrow(/Invalid plugin config/);
  });

  it("keeps mail items out of projections and registers the restricted-only validator", async () => {
    const registry = harness.getEntityRegistry();
    type Validator = Parameters<typeof registry.registerPersistValidator>[1];
    const validators = new Map<string, Validator>();
    registry.registerPersistValidator = (entityType, candidate): void => {
      validators.set(entityType, candidate);
    };
    await installEmailWorkflows(harness);
    await harness.finalizeRegistration();

    expect(registry.getEntityTypeConfig("mail-item")).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    const validator = validators.get("mail-item");
    if (!validator) throw new Error("Persist validator was not registered");
    const projection = createMailItemProjection(inbound, classification);
    const refused = await validator(
      {
        ...projection,
        visibility: "public",
        created: inbound.receivedAt,
        updated: inbound.receivedAt,
        contentHash: "hash",
      },
      { operation: "create" },
    ).catch((error: unknown) => error);
    expect(String(refused)).toContain(
      "Mail items must have restricted visibility",
    );
  });

  it("queues an inbound email for triage before acknowledging, and the job stores it", async () => {
    const prompts: string[] = [];
    const schemas: Array<{ parse(input: unknown): unknown }> = [];
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
    const { runTriage } = await installEmailWorkflows(harness);

    const response = await harness.getMockShell().getMessageBus().send({
      type: EMAIL_INBOUND,
      payload: inbound,
      sender: "email",
    });

    // Acknowledged once durably queued; nothing has been classified yet.
    expect(response).toMatchObject({ success: true });
    expect(prompts).toHaveLength(0);
    const queued = harness.getMockShell().getJobQueueService().getActiveJobs();
    expect(await queued).toMatchObject([
      { type: expect.stringContaining("triage") },
    ]);

    expect(await runTriage(inbound)).toEqual({ acknowledged: true });
    const items = await harness.getEntityService().listEntities({
      entityType: "mail-item",
      options: { filter: { visibilityScope: "restricted" } },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.visibility).toBe("restricted");
    // The edited rubric reached the model, through the classifier's flat
    // wire schema rather than the domain decision union.
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(
      "Prioritize collaboration connected to Project Aurora.",
    );
    const wireSchema = schemas[0];
    if (!wireSchema) throw new Error("no schema handed to the AI");
    expect(() => wireSchema.parse(wireClassification)).not.toThrow();
  });

  it("refuses an inbound email it cannot read instead of queueing it", async () => {
    await installEmailWorkflows(harness);

    const response = await harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: EMAIL_INBOUND,
        payload: { messageId: "<broken>" },
        sender: "email",
      });

    expect(response).toMatchObject({ success: false });
  });

  it("lists new items in the inbox and offers the admin list tool", async () => {
    const { service, capabilities } = await installEmailWorkflows(harness);
    await harness.getEntityService().createEntity({
      entity: {
        ...createMailItemProjection(inbound, classification),
        created: inbound.receivedAt,
        updated: inbound.receivedAt,
      },
    });
    await harness.finalizeRegistration();
    if (!service.ready) throw new Error("Service plugin has no ready hook");
    await service.ready();

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

    const tool = capabilities.tools.find(
      ({ name }) => name === "email-workflows_triage-list",
    );
    expect(tool?.visibility).toBe("admin");
    const listed = await harness.executeTool("email-workflows_triage-list", {
      category: "opportunity",
      priority: "normal",
      status: "new",
      needsReply: true,
    });
    expect(listed).toMatchObject({
      success: true,
      data: { total: 1, items: [{ title: "Possible collaboration" }] },
    });

    const openItem = openItems?.[0];
    if (!openItem || !inboxSource) throw new Error("Inbox item was not listed");
    await inboxSource.act(openItem.id, "mark-reviewed", {
      permissionLevel: "admin",
    });
    expect(await inboxSource.list()).toEqual([]);
    expect(
      await harness.executeTool("email-workflows_triage-list", {
        status: "reviewed",
      }),
    ).toMatchObject({
      success: true,
      data: { total: 1, items: [{ id: openItem.id }] },
    });
  });

  it("registers no reply drafting: no follow-up kind and no workspace", async () => {
    await installEmailWorkflows(harness);
    await harness.finalizeRegistration();

    expect(
      harness
        .getMockShell()
        .getInboxFollowUpRegistry()
        .listKinds()
        .some((kind) => kind.kind === "draft-reply"),
    ).toBe(false);
  });
});
