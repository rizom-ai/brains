import { describe, expect, it } from "bun:test";
import { EMAIL_INBOUND, type InboundEmail } from "@brains/contracts";
import { createPluginHarness } from "@brains/plugins/test";
import { createMockLogger } from "@brains/test-utils";

import {
  EmailTriagePlugin,
  MailItemPlugin,
  emailTriage,
  mailTriageDecisionSchema,
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
  it("activates the entity and service from one explicit capability", () => {
    expect(
      emailTriage({ instructions: "Prioritize collaboration." }).map(
        (plugin) => ({ id: plugin.id, type: plugin.type }),
      ),
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

    await harness.installPlugin(new MailItemPlugin());
    await harness.installPlugin(
      new EmailTriagePlugin({ instructions: "Prioritize collaboration." }),
    );

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
    expect(prompts[0]).toContain("Prioritize collaboration.");
    expect(schemas).toEqual([mailTriageDecisionSchema]);
    expect(items).toHaveLength(1);
    expect(items[0]?.visibility).toBe("restricted");
  });
});
