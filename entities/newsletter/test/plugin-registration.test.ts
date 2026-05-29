import { describe, expect, it } from "bun:test";
import { PermissionService } from "@brains/templates";
import { createPluginHarness } from "@brains/plugins/test";
import { NewsletterPlugin } from "../src/plugin";
import { createNewsletter, type Newsletter } from "../src/schemas/newsletter";

describe("NewsletterPlugin - Publish Pipeline Integration", () => {
  it("declares newsletter publish statuses", async () => {
    const harness = createPluginHarness<NewsletterPlugin>({
      dataDir: "/tmp/test-newsletter-policy",
    });

    await harness.installPlugin(new NewsletterPlugin({}));

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("newsletter").publish,
    ).toEqual({ publishStatuses: ["queued", "published", "failed"] });
  });

  it("requires publish permission before publishing", async () => {
    const harness = createPluginHarness<NewsletterPlugin>({
      dataDir: "/tmp/test-newsletter-publish-permissions",
    });
    harness.setPermissionService(
      new PermissionService({
        entityActions: { newsletter: { publish: "anchor" } },
      }),
    );
    const messages: Array<{ type: string; payload: unknown }> = [];
    harness.subscribe("publish:report:failure", async (msg) => {
      messages.push({ type: "publish:report:failure", payload: msg.payload });
      return { success: true };
    });
    await harness.installPlugin(new NewsletterPlugin({}));
    const entityService = harness.getEntityService();
    const newsletter = createNewsletter({
      subject: "Weekly Update",
      content: "Newsletter body",
      status: "queued",
    });
    await entityService.createEntity({ entity: newsletter });

    await harness.sendMessage("publish:execute", {
      entityType: "newsletter",
      entityId: newsletter.id,
      authContext: { userPermissionLevel: "trusted" },
    });

    const updated = await entityService.getEntity<Newsletter>({
      entityType: "newsletter",
      id: newsletter.id,
    });
    expect(updated?.metadata.status).toBe("queued");
    expect(messages[0]?.payload).toMatchObject({
      entityType: "newsletter",
      entityId: newsletter.id,
    });
  });
});
