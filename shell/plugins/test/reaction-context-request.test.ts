import { describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { createJobEntityAccess } from "../src/job/job-entity-access";
import { createReactionContext } from "../src/service/reaction-context";
import { createServicePluginContext } from "../src/service/context";
import { createMockShell } from "../src/test/mock-shell";

/**
 * A reaction announces with `publish`. An inbox item whose body lives in the
 * mailbox the email interface reads has to ask that interface for it and
 * wait for the answer, which is a request, not an announcement. Named
 * consumer: @brains/email-workflows.
 */
describe("reaction context messaging.request", () => {
  it("sends a request over the bus and hands back the answer", async () => {
    const shell = createMockShell();
    shell.getMessageBus().subscribe("mail:source:read", async (message) => ({
      success: true,
      data: { text: `body of ${String(message.payload)}` },
    }));
    const reaction = createReactionContext({
      context: createServicePluginContext(shell, "triage"),
      packageName: "@fixture/triage",
      entities: createJobEntityAccess(
        shell.getEntityService(),
        new Set(),
        "triage",
      ),
      logger: createSilentLogger("reaction-request-test"),
    });

    const answer = await reaction.messaging.request({
      type: "mail:source:read",
      payload: "item-1",
    });

    expect(answer).toMatchObject({
      success: true,
      data: { text: "body of item-1" },
    });
  });

  it("reports when nobody answers, as the bus does", async () => {
    const shell = createMockShell();
    const reaction = createReactionContext({
      context: createServicePluginContext(shell, "triage"),
      packageName: "@fixture/triage",
      entities: createJobEntityAccess(
        shell.getEntityService(),
        new Set(),
        "triage",
      ),
      logger: createSilentLogger("reaction-request-test"),
    });

    const answer = await reaction.messaging.request({
      type: "mail:source:read",
      payload: "item-1",
    });

    expect(answer).not.toMatchObject({ data: expect.anything() });
  });
});
